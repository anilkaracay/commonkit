// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createMockSource } from '../data/mock/mockSource';
import { deployment } from '../data/mock/fixtures';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evidenceItems, runProofChecks } from '../proof/checks';
import type { EvidenceStep } from '../data/offchain';
import { JUDGE_FLOW_STEPS } from '../demo/flow';

describe('proof checks mirror verify.sh', () => {
  it('runs the verify.sh checks in order and passes on the consistent mock world', async () => {
    const checks = await runProofChecks(createMockSource());
    expect(checks.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    // 2/3 pass with an ℹ line: the recorded build is non-reproducible (D-216), which verify.sh prints as information.
    for (const c of checks) expect(c.status, `${c.id} ${c.title}: ${JSON.stringify(c.items.filter((i) => !i.ok))}`).toBe('pass');
    expect(checks[1]?.items.some((i) => i.info)).toBe(true);
  });

  it('fails check 1 when a keyless account still has a key', async () => {
    const ds = createMockSource({
      accessKeys: { [deployment.assets[0]!.asset_id]: [{ public_key: 'ed25519:x', access_key: { nonce: 1, permission: 'FullAccess' } }] },
    });
    const checks = await runProofChecks(ds);
    expect(checks[0]?.status).toBe('fail');
  });

  it('passes check 2 for a reproducible build, fails on different code, warns without a recorded hash', async () => {
    const repro = { ...deployment, code: { ...deployment.code, asset: { ...deployment.code.asset, build: 'reproducible' } } };
    expect((await runProofChecks(createMockSource({ deployment: repro })))[1]?.status).toBe('pass');
    const diff = { ...deployment, assets: deployment.assets.map((a, i) => (i === 2 ? { ...a, code_hash: 'other' } : a)) };
    expect((await runProofChecks(createMockSource({ deployment: diff })))[1]?.status).toBe('fail');
    const noHash = { ...deployment, code: { ...deployment.code, asset: { ...deployment.code.asset, code_hash: '' } } };
    expect((await runProofChecks(createMockSource({ deployment: noHash })))[1]?.status).toBe('warn');
  });
});

describe('check 11 matches the recorded verify.sh run', () => {
  const root = join(process.cwd(), '..', 'evidence');
  const steps = JSON.parse(readFileSync(join(root, 'steps.json'), 'utf8')) as EvidenceStep[];
  const log = readFileSync(join(root, 'verify-step21.txt'), 'utf8');

  it('gives every step the result verify.sh printed (steps without tx pass with a no_tx_reason)', () => {
    const items = evidenceItems(steps, JUDGE_FLOW_STEPS);
    for (let n = 1; n <= JUDGE_FLOW_STEPS; n++) {
      const line = log.split('\n').find((l) => l.includes(`[11] step ${n}:`));
      expect(line, `step ${n} in verify-step21.txt`).toBeDefined();
      expect(items[n - 1]?.ok, `step ${n}: ${items[n - 1]?.value}`).toBe(line?.startsWith('✅'));
    }
    expect(log).toContain('all checks passed');
  });

  it('fails a step that failed or has neither tx nor reason', () => {
    const base = { title: 't', explorerLinks: [], assertions: [], timestamp: '' };
    const items = evidenceItems(
      [
        { ...base, step: 1, txHashes: [], no_tx_reason: 'read-only' },
        { ...base, step: 2, txHashes: [] },
        { ...base, step: 3, txHashes: ['h'], status: 'failed' },
      ],
      4,
    );
    expect(items.map((i) => i.ok)).toEqual([true, false, false, true]);
    expect(items[3]?.info).toBe(true);
  });
});

describe('progressive live checks', () => {
  it('publishes independent results while a slow key check remains pending, then preserves final order', async () => {
    const ds = createMockSource();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const keys = ds.viewAccessKeyList;
    ds.viewAccessKeyList = async (id) => { await gate; return keys(id); };
    const received: { id: number; status: string }[] = [];
    const complete = runProofChecks(ds, (check) => received.push(check));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(received.some((c) => c.id === 11)).toBe(true);
    expect(received.some((c) => c.id === 1)).toBe(false);
    release();
    const final = await complete;
    expect(final.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(received.find((c) => c.id === 1)?.status).toBe('pass');
  });

  it('keeps valid results when another RPC read fails, without reporting that check as passed', async () => {
    const ds = createMockSource();
    ds.viewAccessKeyList = async () => { throw new Error('RPC unavailable'); };
    const ids: number[] = [];
    await expect(runProofChecks(ds, (check) => ids.push(check.id))).rejects.toThrow('RPC unavailable');
    expect(ids).not.toContain(1);
    expect(ids).toContain(11);
  });
});
