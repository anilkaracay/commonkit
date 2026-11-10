import { createPrivateKey, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { baseEncode, type KeyPairString } from 'near-api-js';
import { describe, expect, it } from 'vitest';
import { nearToYocto } from '@commonkit/sdk';
import { REPO_ROOT } from '../../lib/config.js';
import { withRule } from './actions.js';
import { agentConfigText } from './agent.js';
import { bridgeConfigText } from './bridge.js';
import { renderEvidence } from './evidence-md.js';
import { nep413Hash, serializeNep413, signNep413 } from './nep413.js';
import { StepRecorder, protocolCode, readSteps, upsertStep } from './record.js';
import { NS_PER_MIN, pickFutureSlot, pickUsableSlot, reservationCost, slotsToExceedCap } from './slots.js';
import type { Profile } from './views.js';
import { activeOverrides, overrideLabel, readOverrides, recordOverride } from './overrides.js';
import type { TxResult } from '../../lib/near.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const N = nearToYocto;

/** near-api-js ed25519 key string from a raw 32-byte seed (secret = seed ‖ public key). */
function keyFromSeed(seedHex: string): KeyPairString {
  const seed = Buffer.from(seedHex, 'hex');
  const priv = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
  const pub = Buffer.from(createPublicKey(priv).export({ format: 'jwk' }).x as string, 'base64url');
  return `ed25519:${baseEncode(Buffer.concat([seed, pub]))}` as KeyPairString;
}

describe('NEP-413 signing matches the bridge test vectors', () => {
  const vectors = JSON.parse(readFileSync(join(REPO_ROOT, 'bridge/test/fixtures/nep413-vectors.json'), 'utf8')) as {
    env: { member_seed_hex: string };
    cases: { name: string; public_key: string; signed_recipient: string; nonce_b64: string; message: string; callback_url: string | null; payload_borsh_hex: string; payload_sha256_hex: string; signature_b64: string }[];
  };
  const valid = vectors.cases.find((c) => c.name === 'valid')!;
  const payload = { message: valid.message, nonce: Buffer.from(valid.nonce_b64, 'base64'), recipient: valid.signed_recipient, callbackUrl: valid.callback_url };

  it('serializes and hashes byte-for-byte', () => {
    expect(serializeNep413(payload).toString('hex')).toBe(valid.payload_borsh_hex);
    expect(nep413Hash(payload).toString('hex')).toBe(valid.payload_sha256_hex);
  });
  it('signs like the wallet', () => {
    const s = signNep413(payload, keyFromSeed(vectors.env.member_seed_hex));
    expect(s.publicKey).toBe(valid.public_key);
    expect(s.signature).toBe(valid.signature_b64);
  });
  it('rejects a short nonce', () => {
    expect(() => serializeNep413({ ...payload, nonce: new Uint8Array(31) })).toThrow();
  });
});

describe('slot math', () => {
  const printer = { slot_minutes: 30, start_window_minutes: 15, max_slots_per_reservation: 8 };
  const slot = 30n * NS_PER_MIN;
  const free = () => true;
  it('uses the current slot while its start window has margin left', () => {
    const now = 1000n * slot + 5n * NS_PER_MIN;
    expect(pickUsableSlot(now, printer, 2, free, { marginNs: 4n * NS_PER_MIN, maxWaitNs: slot })).toMatchObject({ startSlot: 1000n, waitNs: 0n });
  });
  it('waits for the next slot when the window is about to close', () => {
    const now = 1000n * slot + 12n * NS_PER_MIN;
    expect(pickUsableSlot(now, printer, 2, free, { marginNs: 4n * NS_PER_MIN, maxWaitNs: slot })).toMatchObject({ startSlot: 1001n, waitNs: 18n * NS_PER_MIN });
  });
  it('skips booked slots and gives up beyond the wait limit', () => {
    const now = 1000n * slot;
    const busy = (s: bigint) => s !== 1000n && s !== 1001n;
    expect(pickUsableSlot(now, printer, 1, busy, { marginNs: 0n, maxWaitNs: slot })).toBeNull();
    expect(pickFutureSlot(now, printer, 2, 1, busy)).toBe(1002n);
  });
  it('computes the exact attached deposit', () => {
    const p = { price_per_slot: N('0.25').toString(), deposit: N('2').toString(), deposit_trusted: N('0.5').toString(), trusted_after: 3 };
    expect(reservationCost(p, 0, 2, false)).toEqual({ fee: N('0.5'), deposit: N('2'), total: N('2.5') });
    expect(reservationCost(p, 3, 1, false).deposit).toBe(N('0.5'));
    expect(reservationCost(p, 0, 1, true)).toEqual({ fee: 0n, deposit: N('2'), total: N('2') });
    const washer = { price_per_slot: N('0.2').toString(), deposit: '0', deposit_trusted: '0', trusted_after: 0 };
    expect(reservationCost(washer, 0, 1, true).deposit).toBe(N('0.01')); // D-213 #1
  });
  it('finds the smallest booking that exceeds the cap', () => {
    expect(slotsToExceedCap(N('2.55'), N('3'), N('0.25'), 8)).toBe(2);
    expect(slotsToExceedCap(N('3'), N('3'), N('0.25'), 8)).toBe(1);
    expect(slotsToExceedCap(0n, N('3'), N('0.25'), 8)).toBeNull();
  });
});

describe('profile overrides', () => {
  const p = { rules: [{ rule_id: 'a', trigger: { Metric: { metric: 'm', threshold: 10 } } }, { rule_id: 'b', trigger: { Schedule: { every_hours: 168 } } }] } as unknown as Profile;
  it('replaces one rule and leaves the rest', () => {
    const q = withRule(p, 'b', { trigger: { Schedule: { every_hours: 1 } } });
    expect(q.rules[1]!.trigger).toEqual({ Schedule: { every_hours: 1 } });
    expect(q.rules[0]).toBe(p.rules[0]);
    expect(p.rules[1]!.trigger).toEqual({ Schedule: { every_hours: 168 } });
    expect(() => withRule(p, 'zz', {})).toThrow();
  });
});

describe('generated configs', () => {
  it('bridge config is the emulated stack shape with SIMULATED devices', () => {
    const text = bridgeConfigText(
      { printer: 'printer-01.x.testnet', laser: 'laser-01.x.testnet', fridge: 'fridge-01.x.testnet' },
      { port: 18787, rpcUrl: 'https://test.rpc.fastnear.com', bridgeAccount: 'bridge.x.testnet', stateDir: '/s', deployments: '/d.json', bridgeDir: '/b' },
    );
    const filled = text.replace(/\$\{([A-Z_]+)(?::-([^}]*))?\}/g, (_m, _n: string, def?: string) => def ?? 'http://127.0.0.1:1');
    const cfg = JSON.parse(filled.split('\n').slice(1).join('\n'));
    expect(cfg.chain).toBe('near');
    expect(cfg.assets.map((a: { adapter: string }) => a.adapter)).toEqual(['moonraker', 'smart_plug', 'simulator']);
    expect(cfg.assets[0].emulated_device).toBe(true);
    expect(cfg.assets[0].adapter_config.time_scale).toBe(60);
    expect(cfg.assets[1].safety.stand_in).toMatch(/stand-in/);
  });
  it('agent config: one asset, template rationale only, optional purchase hint override', () => {
    const cfg = JSON.parse(
      agentConfigText('printer-01.makerlab.commonkit-sxflo.testnet', {
        agent: 'agent.x.testnet', rpcUrl: 'https://test.rpc.fastnear.com', stateDir: '/s', evidenceDir: '/e', deployments: '/d', port: 1,
        purchaseHints: [{ rule_id: 'nozzle_clean', after_n: 1, item: 'Nozzle kit', amount: '4', receiver: 's.testnet' }],
      }).split('\n').slice(1).join('\n'),
    );
    expect(cfg.llm.enabled).toBe(false);
    expect(cfg.assets).toHaveLength(1);
    expect(cfg.assets[0].alias).toBe('PRINTER_01');
    expect(cfg.assets[0].purchase_hints[0].after_n).toBe(1);
  });
});

const fakeTx = (o: Partial<TxResult>): TxResult => ({
  hash: 'H1', signer: 's.testnet', receiver: 'r.testnet', ok: true, failure: null, errorCode: null, receiptFailures: [], logs: [], events: [], returnValue: null, gasBurnt: 0n, ...o,
});

describe('step recorder and evidence', () => {
  const meta = { step: 4, title: 'Can is refused', core: true, simulated: true, negative: true };
  it('passes only with assertions, all ok, no error', () => {
    const r = new StepRecorder(meta, undefined, () => undefined);
    expect(r.finish().status).toBe('failed');
    r.check('x', true);
    expect(r.finish().status).toBe('passed');
    expect(r.finish(new Error('boom')).status).toBe('failed');
    r.check('y', false);
    expect(r.finish().status).toBe('failed');
  });
  it('asserts exact E_* codes and protocol refusals', () => {
    const r = new StepRecorder(meta, undefined, () => undefined);
    expect(r.expectCode('a', fakeTx({ ok: false, errorCode: 'E_SELF_VERIFY' as never, failure: 'x' }), 'E_SELF_VERIFY')).toBe(true);
    expect(r.expectCode('b', fakeTx({ ok: false, errorCode: 'E_BAD_STATE' as never, failure: 'x' }), 'E_SELF_VERIFY')).toBe(false);
    expect(r.expectCode('c', fakeTx({ ok: true }), 'E_SELF_VERIFY')).toBe(false);
    expect(protocolCode('{"ActionError":{"kind":{"FunctionCallError":{"MethodResolveError":"MethodNotFound"}}}}')).toBe('PROTOCOL:MethodNotFound');
  });
  it('keeps outputs of an earlier attempt and upserts by step', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ck-steps-'));
    const path = join(dir, 'steps.json');
    const r1 = new StepRecorder({ ...meta, step: 2 }, undefined, () => undefined);
    r1.out('reservation_id', 7n);
    r1.tx('reserve', fakeTx({ hash: 'AAA' }));
    upsertStep(r1.finish(new Error('later failure')), path);
    const prev = readSteps(path).find((s) => s.step === 2)!;
    expect(prev.status).toBe('failed');
    const r2 = new StepRecorder({ ...meta, step: 2 }, prev, () => undefined);
    expect(r2.outputs.reservation_id).toBe('7');
    r2.check('ok', true);
    upsertStep(r2.finish(), path);
    expect(readSteps(path)).toHaveLength(1);
    expect(readSteps(path)[0]!.status).toBe('passed');
  });
  it('renders the judge table, core marks and no-tx reasons', () => {
    const r = new StepRecorder(meta, undefined, () => undefined);
    r.check('bridge 403', true);
    r.noTxReason = 'refused by the bridge';
    const md = renderEvidence({ steps: [r.finish()], logs: {}, limits: null, pilotFunding: null });
    expect(md).toContain('| 4 | Can is refused ★ (simulation) | ✅ | — (refused by the bridge) |');
    expect(md).toContain('1 of 21 steps passed');
  });
});

describe('demo overrides evidence', () => {
  it('labels overrides as the web expects and tracks what is still live', () => {
    expect(overrideLabel('bed_level', 1, 50)).toBe('demo override bed_level 1 (production 50)');
    const path = join(mkdtempSync(join(tmpdir(), 'ck-ovr-')), 'o.json');
    const base = { step: 16, asset: 'printer-01.x.testnet', rule_id: 'bed_level', value: '1', production: '50', tx_hashes: ['H'] };
    recordOverride({ ...base, kind: 'override', proposal: 'd#12', at: '2026-11-10T05:00:00Z' }, path);
    recordOverride({ ...base, kind: 'override', proposal: 'd#12', at: '2026-11-10T05:00:00Z' }, path);
    expect(readOverrides(path)).toHaveLength(1);
    expect(activeOverrides(readOverrides(path))).toHaveLength(1);
    recordOverride({ ...base, kind: 'restore', value: '50', proposal: 'd#15', at: '2026-11-10T05:10:00Z' }, path);
    expect(activeOverrides(readOverrides(path))).toHaveLength(0);
    expect(readOverrides(path)[1]!.label).toBe('restore bed_level 50 (production 50)');
  });
});
