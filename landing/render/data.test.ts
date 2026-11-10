import { describe, expect, it } from 'vitest';
import { loadData } from './data.ts';

describe('landing build data', () => {
  const d = loadData();
  it('reads 12 profiles, each with exactly one README status', () => {
    expect(d.profiles).toHaveLength(12);
    for (const p of d.profiles) expect(p.status.length).toBeGreaterThan(0);
  });
  it('labels exactly the deployed testnet assets as simulated testnet assets', () => {
    const deployed = new Set(d.snapshot.assets.map((a) => a.asset_type));
    for (const p of d.profiles) expect(p.status.includes('testnet asset')).toBe(deployed.has(p.asset_type));
  });
  it('quotes real contract lines', () => {
    expect(d.excerpts.constant.lines[0]!.text).toContain('E_NON_TRANSFERABLE');
    expect(d.excerpts.transfer.lines.map((l) => l.text).join('\n')).toContain('pub fn nft_transfer');
    expect(d.excerpts.revoke.lines[0]!.text).toContain('E_NO_REVOCATION');
  });
  it('builds the ticker only from successful evidence txs', () => {
    expect(d.ticker.length).toBeGreaterThan(0);
    for (const t of d.ticker) expect(t.url).toContain(t.hash);
  });
});
