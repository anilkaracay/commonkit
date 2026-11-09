import { describe, expect, it } from 'vitest';
import { loadCatalog, normalizeRule } from '../data/catalog';
import { UPKEEP_KINDS } from '../data/types';

describe('scenario catalog from profiles/*.json', () => {
  const catalog = loadCatalog();

  it('loads every profile file (not the schema) with a status', () => {
    expect(catalog.length).toBeGreaterThanOrEqual(8);
    expect(catalog.some((c) => c.file === 'profile.schema.json')).toBe(false);
    for (const c of catalog) expect(c.meta.status, c.file).not.toBe('unknown');
  });

  it('every rule has a known upkeep kind and a trigger', () => {
    for (const c of catalog)
      for (const r of c.profile.rules) {
        expect(UPKEEP_KINDS, `${c.file} ${r.rule_id}`).toContain(r.kind);
        expect(Object.keys(r.trigger)).toHaveLength(1);
      }
  });

  it('reads pre-D-017 rules as Maintenance + Metric', () => {
    const r = normalizeRule({ rule_id: 'x', title: 'X', metric: 'cycles', threshold: 30 });
    expect(r.kind).toBe('Maintenance');
    expect(r.trigger).toEqual({ Metric: { metric: 'cycles', threshold: 30 } });
  });

  it('only the washer is marked simulation', () => {
    expect(catalog.filter((c) => c.meta.status.startsWith('simulation')).map((c) => c.profile.asset_type)).toEqual(['washer']);
  });
});
