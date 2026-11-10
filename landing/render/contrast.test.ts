/** The landing uses only @commonkit/design tokens (whose text pairs are checked for WCAG AA in that package);
 * this test keeps raw colours out of the landing stylesheet so no unchecked pair can creep in. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { color, contrast, textPairs } from '@commonkit/design';

const css = readFileSync(resolve(import.meta.dirname, '../src/styles/main.css'), 'utf8');

describe('landing colours', () => {
  it('main.css uses tokens only (no hex, rgb or hsl literals)', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });
  it('main.css uses no banned effects (D-029)', () => {
    expect(css).not.toMatch(/background-clip:\s*text|backdrop-filter|filter:\s*blur|text-shadow|gradient\(/);
  });
  it.each(textPairs)('design pair %s reaches AA', (_, fg, bg) => expect(contrast(color[fg], color[bg])).toBeGreaterThanOrEqual(4.5));
  it('the "admin" cursor label (ink on orange) reaches AA', () => expect(contrast(color.ink, color.orange500)).toBeGreaterThanOrEqual(4.5));
});
