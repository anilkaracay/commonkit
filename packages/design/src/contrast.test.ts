import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { color, contrast, textPairs } from './index.ts';

describe('design tokens', () => {
  it.each(textPairs)('%s reaches WCAG AA', (_, fg, bg) => {
    expect(contrast(color[fg], color[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it('tokens.css and index.ts agree on every primitive', () => {
    const css = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8');
    const kebab = (k: string) => k.replace(/([a-z])(\d)/g, '$1-$2').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    for (const [k, v] of Object.entries(color)) {
      const name = k === 'ink' ? 'ink-950' : kebab(k);
      expect(css, `--ck-${name}`).toContain(`--ck-${name}: ${v};`);
    }
  });

  it('uses no banned effects', () => {
    const all = ['tokens.css', 'base.css', 'components.css'].map((f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')).join('\n');
    expect(all).not.toMatch(/background-clip:\s*text|backdrop-filter|filter:\s*blur|text-shadow|linear-gradient|radial-gradient/);
  });
});

describe('NEAR mark', () => {
  it('is the unmodified official file (path, viewBox and fill match assets/near/near-mark.svg)', async () => {
    const { NEAR_MARK_PATH, NEAR_MARK_VIEWBOX, NEAR_MARK_FILL } = await import('./near.ts');
    const svg = readFileSync(new URL('../assets/near/near-mark.svg', import.meta.url), 'utf8');
    expect(svg).toContain(`d="${NEAR_MARK_PATH}"`);
    expect(svg).toContain(`viewBox="${NEAR_MARK_VIEWBOX}"`);
    expect(svg).toContain(`fill="${NEAR_MARK_FILL}"`);
  });
});
