// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { displayRatio, formatNear, formatNearUnit, parseNear, sumYocto, toYocto, YOCTO_PER_NEAR } from '../lib/near';

describe('formatNear (yocto → NEAR, bigint only)', () => {
  it('formats whole and fractional amounts', () => {
    expect(formatNear('0')).toBe('0');
    expect(formatNear(YOCTO_PER_NEAR)).toBe('1');
    expect(formatNear('250000000000000000000000')).toBe('0.25');
    expect(formatNear('3000000000000000000000000')).toBe('3');
    expect(formatNear(parseNear('2.9'))).toBe('2.9');
  });

  it('truncates, never rounds up, beyond maxDecimals', () => {
    expect(formatNear('1999999999999999999999999')).toBe('1.9999');
    expect(formatNear('1999999999999999999999999', { maxDecimals: 2 })).toBe('1.99');
    expect(formatNear(parseNear('0.12345'), { maxDecimals: 4 })).toBe('0.1234');
  });

  it('marks dust instead of showing zero', () => {
    expect(formatNear('1')).toBe('<0.0001');
    expect(formatNear('-1')).toBe('-<0.0001');
    expect(formatNear('1', { maxDecimals: 0 })).toBe('<1');
  });

  it('groups thousands and pads min decimals', () => {
    expect(formatNear(parseNear('1234567.5'))).toBe('1,234,567.5');
    expect(formatNear(parseNear('1234567.5'), { group: false })).toBe('1234567.5');
    expect(formatNear(parseNear('3'), { minDecimals: 2 })).toBe('3.00');
  });

  it('handles values beyond Number precision exactly', () => {
    const big = 123456789012345678901234567890123n; // ~123 million NEAR + dust
    expect(formatNear(big, { maxDecimals: 24, group: false })).toBe('123456789.012345678901234567890123'.slice(0, 34));
    expect(formatNearUnit(big)).toBe('123,456,789.0123 NEAR');
  });

  it('handles negatives', () => {
    expect(formatNear(-parseNear('0.5'))).toBe('-0.5');
  });

  it('rejects non-integer yocto strings', () => {
    expect(() => toYocto('1.5')).toThrow();
    expect(() => toYocto('1e24')).toThrow();
    expect(() => formatNear('abc')).toThrow();
  });
});

describe('parseNear / sums / ratios', () => {
  it('parses decimals and commas exactly', () => {
    expect(parseNear('0.5')).toBe(YOCTO_PER_NEAR / 2n);
    expect(parseNear('1,000.25')).toBe(1000n * YOCTO_PER_NEAR + YOCTO_PER_NEAR / 4n);
    expect(parseNear('0.000000000000000000000001')).toBe(1n);
    expect(() => parseNear('0.0000000000000000000000001')).toThrow();
  });

  it('round-trips', () => {
    for (const s of ['0', '1', '0.1', '41.65', '7.95']) expect(formatNear(parseNear(s))).toBe(s);
  });

  it('sums mixed inputs and computes display ratios', () => {
    expect(sumYocto('1', 2n, '3')).toBe(6n);
    expect(displayRatio(parseNear('2.9'), parseNear('3'))).toBeCloseTo(0.966666, 5);
    expect(displayRatio('5', '0')).toBe(0);
  });
});
