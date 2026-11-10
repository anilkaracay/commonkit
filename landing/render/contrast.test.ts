/** WCAG AA check for the landing tokens: every text colour on every surface it is used on. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(import.meta.dirname, '../src/styles/main.css'), 'utf8');
const token = (name: string): string => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(css);
  if (!m) throw new Error(`token --${name} not found`);
  return m[1]!;
};
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

const PAIRS: [string, string][] = [
  ['fg', 'ink-0'], ['fg-2', 'ink-0'], ['fg-3', 'ink-0'], ['fg-2', 'ink-2'], ['fg-3', 'ink-1'], ['fg-3', 'ink-2'],
  ['brass', 'ink-0'], ['brass-2', 'ink-1'], ['sage', 'ink-1'], ['sim', 'ink-2'], ['danger', 'ink-1'], ['slate', 'ink-1'],
  ['paper-ink', 'paper'], ['paper-mute', 'paper'], ['paper-mute', 'paper-2'], ['paper-mute', 'paper-3'],
  ['brass-deep', 'paper'], ['brass-deep', 'paper-2'], ['sage-deep', 'paper'], ['sim-deep', 'paper'], ['sim-deep', 'paper-2'],
];

describe('landing colour contrast (WCAG AA, 4.5:1 for text)', () => {
  for (const [fg, bg] of PAIRS)
    it(`${fg} on ${bg}`, () => expect(ratio(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5));
});
