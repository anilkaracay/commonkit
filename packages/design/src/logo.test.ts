import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LOCKUP_ASPECT, LOCKUP_VIEWBOX, LOCKUP_WORD_D, lockupSvg } from './logo';

const file = readFileSync(new URL('../logo/concepts/a/lockup-nav.svg', import.meta.url), 'utf8');

describe('logo module', () => {
  it('matches the approved lockup SVG (run logo/src/export.py after changing it)', () => {
    expect(file).toContain(`viewBox="${LOCKUP_VIEWBOX}"`);
    expect(file).toContain(`d="${LOCKUP_WORD_D}"`);
  });
  it('sizes the box from the aspect ratio, decorative by default', () => {
    const svg = lockupSvg(18);
    expect(svg).toContain(`width="${Math.round(18 * LOCKUP_ASPECT * 10) / 10}" height="18"`);
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('fill="currentColor"');
  });
});
