import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nearToYocto } from '@commonkit/sdk';
import { codeHash } from './code.js';
import { PROFILES_DIR } from './config.js';
import { canonicalJson, encodeCreateDao, encodeProposal, votesNeeded } from './dao.js';
import { emptyDeployments, mergeDeployments } from './deployments.js';
import { appendStep, evidenceMarkdown } from './evidence.js';
import {
  assetAccountFunding,
  commonsAccountFunding,
  faucetDropsNeeded,
  fundingPlan,
  recommendedStorageReserve,
  sumLines,
} from './funding.js';
import { Keystore, keyFileName } from './keystore.js';
import { AGENT_METHODS, BRIDGE_METHODS, COMMUNITIES, ids, roleAccount } from './topology.js';

const N = nearToYocto;
const b64json = (s: string): unknown => JSON.parse(Buffer.from(s, 'base64').toString('utf8'));

describe('proposal encoding (research §3.2)', () => {
  it('encodes a Transfer with token_id "" and msg null', () => {
    const p = encodeProposal('pay', { Transfer: { receiver_id: 'sup.testnet', amount: N('4') } });
    expect(p).toEqual({
      proposal: {
        description: 'pay',
        kind: {
          Transfer: {
            token_id: '',
            receiver_id: 'sup.testnet',
            amount: '4000000000000000000000000',
            msg: null,
          },
        },
      },
    });
  });

  it('encodes FunctionCall args as base64 JSON with string deposit and gas', () => {
    const p = encodeProposal('roles', {
      FunctionCall: {
        receiver_id: 'c.testnet',
        actions: [
          {
            method_name: 'set_roles',
            args: { account: 'a', roles: ['verifier'] },
            deposit: 5n,
            gas: 60_000_000_000_000n,
          },
        ],
      },
    }) as {
      proposal: {
        kind: { FunctionCall: { actions: { args: string; deposit: string; gas: string }[] } };
      };
    };
    const a = p.proposal.kind.FunctionCall.actions[0]!;
    expect(b64json(a.args)).toEqual({ account: 'a', roles: ['verifier'] });
    expect(a.deposit).toBe('5');
    expect(a.gas).toBe('60000000000000');
  });

  it('defaults gas to 50 Tgas and deposit to 0; fund_float {} encodes as e30=', () => {
    const p = encodeProposal('f', {
      FunctionCall: { receiver_id: 'x', actions: [{ method_name: 'fund_float', args: {} }] },
    }) as {
      proposal: {
        kind: { FunctionCall: { actions: { args: string; deposit: string; gas: string }[] } };
      };
    };
    expect(p.proposal.kind.FunctionCall.actions[0]).toEqual({
      method_name: 'fund_float',
      args: 'e30=',
      deposit: '0',
      gas: '50000000000000',
    });
  });

  it('rejects empty actions and Σ gas above 250 Tgas', () => {
    expect(() =>
      encodeProposal('x', { FunctionCall: { receiver_id: 'x', actions: [] } }),
    ).toThrow();
    const heavy = Array.from({ length: 6 }, () => ({
      method_name: 'm',
      args: {},
      gas: 50_000_000_000_000n,
    }));
    expect(() =>
      encodeProposal('x', { FunctionCall: { receiver_id: 'x', actions: heavy } }),
    ).toThrow(/250 Tgas/);
  });

  it('votesNeeded follows Ratio(n,d) → min(total*n/d + 1, total)', () => {
    expect(votesNeeded(3, [1, 2])).toBe(2);
    expect(votesNeeded(3, [2, 3])).toBe(3);
    expect(votesNeeded(1, [1, 2])).toBe(1);
    expect(votesNeeded(4, [1, 2])).toBe(3);
  });

  it('encodes factory create args with the council as policy array', () => {
    const c = encodeCreateDao('makerlab-ck', 'p', ['a.testnet', 'b.testnet']);
    expect(c.name).toBe('makerlab-ck');
    expect(b64json(c.args)).toEqual({
      config: { name: 'makerlab-ck', purpose: 'p', metadata: '' },
      policy: ['a.testnet', 'b.testnet'],
    });
    expect(() => encodeCreateDao('Bad_Name', 'p', ['a'])).toThrow();
    expect(() => encodeCreateDao('ok', 'p', [])).toThrow();
  });

  it('canonicalJson ignores key order so a resumed proposal matches what the DAO returns', () => {
    expect(canonicalJson({ b: 1, a: [{ y: 2, x: null }] })).toBe(
      canonicalJson({ a: [{ x: null, y: 2 }], b: 1 }),
    );
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
  });
});

describe('deployments merge', () => {
  const now = new Date('2026-11-09T12:00:00Z');
  it('adds and updates without dropping fields; unions id arrays', () => {
    let d = mergeDeployments(
      emptyDeployments(),
      {
        accounts: {
          'a.testnet': { role: 'asset', kind: 'contract', keyless: 'pending', created_tx: 'T1' },
        },
        communities: {
          m: {
            name: 'M',
            root_account: 'm.t',
            dao_id: 'd',
            dao_council: ['x'],
            commons_id: 'c',
            assets: ['a.testnet'],
          },
        },
      },
      now,
    );
    d = mergeDeployments(
      d,
      {
        accounts: { 'a.testnet': { code_hash: 'H' } },
        communities: { m: { assets: ['b.testnet', 'a.testnet'] } },
      },
      now,
    );
    expect(d.accounts['a.testnet']).toMatchObject({
      role: 'asset',
      created_tx: 'T1',
      code_hash: 'H',
      keyless: 'pending',
    });
    expect(d.communities.m!.assets).toEqual(['a.testnet', 'b.testnet']);
    expect(d.updated_at).toBe(now.toISOString());
  });

  it('never turns a verified keyless account back into pending', () => {
    let d = mergeDeployments(emptyDeployments(), {
      accounts: {
        a: { role: 'commons', kind: 'contract', keyless: true, keys_deleted_tx: ['K1'] },
      },
    });
    d = mergeDeployments(d, { accounts: { a: { keyless: 'pending', keys_deleted_tx: ['K2'] } } });
    expect(d.accounts.a!.keyless).toBe(true);
    expect(d.accounts.a!.keys_deleted_tx).toEqual(['K1', 'K2']);
  });

  it('deduplicates function-call keys and rejects invalid entries', () => {
    const k = {
      account: 'bridge.t',
      public_key: 'ed25519:X',
      receiver_id: 'a',
      method_names: ['report_telemetry'],
      tx: 'T',
    };
    let d = mergeDeployments(emptyDeployments(), { function_call_keys: [k] });
    d = mergeDeployments(d, { function_call_keys: [k] });
    expect(d.function_call_keys).toHaveLength(1);
    expect(() =>
      mergeDeployments(d, {
        accounts: { z: { role: 'nope' as never, kind: 'team', keyless: false } },
      }),
    ).toThrow();
  });
});

describe('funding math', () => {
  it('sizes asset storage so wasm + 64 kB state stays ≤ 80% of the reserve', () => {
    expect(recommendedStorageReserve(468_037)).toBe(N('6.7'));
    expect(recommendedStorageReserve(300_000)).toBe(N('4.6'));
    expect(assetAccountFunding(N('5'), 468_037)).toBe(N('6.75'));
    expect(assetAccountFunding(N('7'), 468_037)).toBe(N('7.05'));
  });

  it('commons funding = code bytes + 0.5 NEAR, rounded up to 0.1', () => {
    expect(commonsAccountFunding(337_044)).toBe(N('3.9'));
  });

  it('itemises the full plan and marks the dry-run subset', () => {
    const reserves = Object.fromEntries(
      COMMUNITIES.flatMap((c) => c.assets.map((a) => [a.profileFile, N('5')])),
    );
    const lines = fundingPlan({
      assetWasmBytes: 455_955,
      commonsWasmBytes: 337_044,
      profileReserves: reserves,
    });
    expect(lines.filter((l) => l.what.startsWith('storage_reserve'))).toHaveLength(4);
    expect(sumLines(lines, true)).toBeLessThan(sumLines(lines));
    expect(sumLines(lines)).toBe(lines.reduce((s, l) => s + l.amount, 0n));
    expect(() =>
      fundingPlan({ assetWasmBytes: 1, commonsWasmBytes: 1, profileReserves: {} }),
    ).toThrow(/storage_reserve/);
  });

  it('counts faucet drops of 10 NEAR minus what each helper keeps', () => {
    expect(faucetDropsNeeded(N('5'), N('10'))).toBe(0);
    expect(faucetDropsNeeded(N('20'), N('10'))).toBe(2);
    expect(faucetDropsNeeded(N('19.9'), N('10'))).toBe(1);
  });
});

describe('topology', () => {
  it('derives ids under the root (D-105) and keeps them ≤ 64 chars', () => {
    const m = COMMUNITIES[0]!;
    expect(ids.asset(m, m.assets[0]!)).toBe('printer-01.makerlab.commonkit-sxflo.testnet');
    expect(ids.dao(m)).toBe('makerlab-ck.sputnikv2.testnet');
    for (const c of COMMUNITIES)
      for (const a of c.assets) expect(ids.asset(c, a).length).toBeLessThanOrEqual(64);
    expect(roleAccount(m, 'elif')).toBe('elif.makerlab.commonkit-sxflo.testnet');
    expect(roleAccount(m, 'mehmet')).toBe('mehmet.commonkit-sxflo.testnet');
  });

  it('operator method lists match CONTRACT_SPEC and contain no payable method', () => {
    expect(BRIDGE_METHODS).toEqual([
      'mark_session_started',
      'mark_session_finished',
      'report_telemetry',
      'submit_verification_result',
    ]);
    expect(AGENT_METHODS).toEqual([
      'open_upkeep_task',
      'annotate_task',
      'escalate',
      'sync_escalation',
      'refresh_dao_policy',
    ]);
  });

  it('every asset profile file exists with a group and a storage reserve', () => {
    for (const c of COMMUNITIES)
      for (const a of c.assets) {
        const p = JSON.parse(readFileSync(join(PROFILES_DIR, a.profileFile), 'utf8')).profile;
        expect(p.group_id).toBeTruthy();
        expect(BigInt(p.storage_reserve)).toBeGreaterThan(0n);
      }
  });
});

describe('evidence', () => {
  it('renders steps and logs; reruns of a step replace it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ck-ev-'));
    const step = {
      step: 2,
      title: 'reserve',
      txHashes: ['ABCDEFGHIJ'],
      explorerLinks: [],
      assertions: [{ what: 'confirmed', ok: true }],
      timestamp: 't',
    };
    appendStep(step, dir);
    appendStep({ ...step, assertions: [{ what: 'confirmed', ok: false }] }, dir);
    const steps = JSON.parse(readFileSync(join(dir, 'steps.json'), 'utf8'));
    expect(steps).toHaveLength(1);
    expect(readFileSync(join(dir, 'EVIDENCE.md'), 'utf8')).toContain('| 2 | reserve | ❌ |');
    expect(evidenceMarkdown([], {})).toContain('No judge-flow step has run yet.');
  });
});

describe('keys and code hash', () => {
  it('stores generated keys in the CLI layout and returns only the public key', () => {
    const ks = new Keystore(mkdtempSync(join(tmpdir(), 'ck-ks-')));
    const pk = ks.generate('a.testnet', { primary: true });
    expect(pk).toMatch(/^ed25519:/);
    expect(ks.publicKeys('a.testnet')).toEqual([pk]);
    const pk2 = ks.generate('a.testnet', { primary: false });
    expect(ks.publicKeys('a.testnet')).toEqual([pk, pk2]);
    expect(ks.has('a.testnet', pk2)).toBe(true);
    expect(keyFileName('ed25519:ABC')).toBe('ed25519_ABC.json');
    expect(ks.has('missing.testnet')).toBe(false);
  });

  it('code_hash is base58(sha256(wasm))', () => {
    // sha256("") = e3b0c442…; base58 of it is the well-known empty-code hash below.
    expect(codeHash(new Uint8Array())).toBe('GKot5hBsd81kMupNCXHaqbhv3huEbxAFMLnpcX2hniwn');
  });
});
