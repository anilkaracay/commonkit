import { describe, expect, it } from 'vitest';
import { loadData } from './data.ts';
import { renderSlots } from './render.ts';

const d = loadData();
const s = renderSlots(d);

describe('landing render (honesty)', () => {
  it('labels the demo threshold in the hero and tells the last verified upkeep with its tx', () => {
    expect(s['hero-callouts']).toContain('demo threshold (production: every 200 h of printing)');
    expect(s['hero-callouts']).toContain('Nozzle cleaned');
    expect(s['hero-callouts']).toContain('Task #0 by ayse, verified by mehmet');
    expect(s['hero-callouts']).toMatch(/nearblocks\.io\/txns\/Gr7bwq/);
  });
  it('shows all twelve commons with their README status verbatim', () => {
    expect(s.care!.match(/class="care-tile"/g)).toHaveLength(12);
    for (const p of d.profiles) expect(s.care).toContain(`Status: ${p.status}`);
  });
  it('lists the eleven verify.sh checks, all passing', () => {
    expect(s['proof-checks']!.match(/<li class="ok">/g)).toHaveLength(11);
    expect(s['proof-checks']).not.toContain('class="bad"');
  });
  it('links every refusal and agent attempt to its testnet tx or says why there is none', () => {
    expect(s['rights-refused']!.match(/nearblocks\.io\/txns\//g)!.length).toBeGreaterThanOrEqual(3);
    const attempts = s.agent!.match(/<li class=/g)!.length;
    const linked = (s.agent!.match(/nearblocks\.io\/txns\//g) ?? []).length;
    const protocol = (s.agent!.match(/no tx · refused by the protocol/g) ?? []).length;
    expect(linked + protocol).toBe(attempts);
  });
  it('fills every slot', () => {
    for (const [k, v] of Object.entries(s)) if (k !== 'pilot') expect(v, k).not.toBe('');
  });
});
