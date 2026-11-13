import { describe, expect, it } from 'vitest';
import { loadData } from './data.ts';
import { renderSlots } from './render.ts';

const d = loadData();
const s = renderSlots(d);
const all = Object.values(s).join('\n');

describe('landing render (honest and quiet)', () => {
  it('labels the lowered nozzle threshold and tells the verified upkeep in the hero', () => {
    expect(s['hero-callouts']).toContain('Nozzle time · demo threshold');
    expect(s['hero-callouts']).toContain('Nozzle cleaned');
    expect(s['hero-callouts']).toContain('Done by Ayşe, verified by Mehmet');
  });
  it('shows all twelve commons with their README status verbatim', () => {
    expect(s.care!.match(/class="care-tile"/g)).toHaveLength(12);
    for (const p of d.profiles) expect(s.care).toContain(`Status: ${p.status}`);
  });
  it('states exactly three proof facts from a passing verify run', () => {
    expect(s.proof!.match(/<li>/g)).toHaveLength(3);
    expect(s.proof).toContain('<b class="ck-num">0</b> keys');
    expect(s.proof).toContain('<b class="ck-num">1</b> contract');
  });
  it('keeps judge plumbing off the landing: no step numbers, decision ids, evidence file names or raw hashes', () => {
    expect(all).not.toMatch(/\bstep \d|D-\d{3}|evidence\/|verify-step|\.json\b|E_[A-Z_]{4,}|[1-9A-HJ-NP-Za-km-z]{6}…/);
  });
  it('derives the money, proof and right numbers from the snapshot, evidence and profile at build time', () => {
    const fees = d.snapshot.assets.reduce((t, a) => t + BigInt(a.ledger.total_fees_in), 0n);
    const fixed = (y: bigint) => { const r = (y + 5n * 10n ** 21n) / 10n ** 22n; return `${r / 100n}.${(r % 100n).toString().padStart(2, '0')}`; };
    expect(s['money-stats']).toContain(`<span class="ck-num">${fixed(fees)}</span><span class="ck-sr"> NEAR</span>`);
    expect(s.proof).toContain(`<b class="ck-num">${d.evidence_txs}</b> transactions`);
    const printer = d.profiles.find((p) => p.asset_type === 'printer_3d')!;
    expect(s['rights-pass']).toContain(`${printer.right_validity_days} days`);
  });
  it('marks every real-world scene as Simulated or Example, with demo thresholds where a lowered value shows', () => {
    const items = s['scenes-list']!.split('class="scene"').slice(1);
    expect(items).toHaveLength(5);
    for (const it of items) expect(it).toMatch(/class="sim-mark">(Simulated|Example)/);
    expect(items[0]).toContain('demo threshold 30 min of printing');
    expect(items[3]).toContain('demo threshold 1 h');
    expect(items[4]).toContain('Example');
  });
  it('gives every timeline step a who, a role and what happened, and links only evidence txs', () => {
    const steps = s['scenes-list']!.match(/<li class="tl-step">[\s\S]*?<\/li>/g)!;
    expect(steps.length).toBe(19);
    for (const st of steps) {
      expect(st).toMatch(/<b>[^<]+<\/b><span class="role">· [^<]+<\/span>/);
      expect(st).toMatch(/class="tl-what">[^<]{4,}</);
    }
    const links = [...s['scenes-list']!.matchAll(/txns\/([1-9A-HJ-NP-Za-km-z]{43,44})/g)].map((m) => m[1]);
    const known = new Set(d.steps.flatMap((x) => x.txs.map((t) => t.hash)));
    for (const h of links) expect(known.has(h!)).toBe(true);
  });
  it('marks every NEAR amount with the official mark and keeps the word for screen readers', () => {
    for (const k of ['hero-callouts', 'money-lineup', 'money-stats', 'how']) {
      expect(s[k]).toContain('class="ck-near-mark"');
      expect(s[k]!.replace(/aria-label="[^"]*"/g, '')).not.toMatch(/\d NEAR\b/);
    }
    expect(s['scenes-list']).toContain('class="ck-near-mark"');
  });
  it('links each refusal to its testnet transaction', () => {
    expect(s['rights-refused']!.match(/nearblocks\.io\/txns\//g)).toHaveLength(3);
  });
});
