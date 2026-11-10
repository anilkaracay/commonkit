// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createMockSource } from '../data/mock/mockSource';
import { deployment } from '../data/mock/fixtures';
import { runProofChecks } from '../proof/checks';

describe('proof checks mirror verify.sh', () => {
  it('runs the verify.sh checks in order and passes on the consistent mock world', async () => {
    const checks = await runProofChecks(createMockSource());
    expect(checks.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    // 2/3 warn: the recorded build is non-reproducible (D-216), as verify.sh prints it.
    for (const c of checks)
      expect(c.status, `${c.id} ${c.title}: ${JSON.stringify(c.items.filter((i) => !i.ok))}`).toBe(c.id === 2 || c.id === 3 ? 'warn' : 'pass');
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
