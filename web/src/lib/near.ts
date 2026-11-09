/**
 * Display helpers for yoctoNEAR on top of @commonkit/sdk (nearToYocto / yoctoToNear).
 * All money math is bigint; numbers appear only as display ratios (bar widths), never amounts.
 * Formatting truncates like the sdk: a shown balance is never more than the real one.
 */
import { nearToYocto, yoctoToNear, YOCTO_PER_NEAR } from '@commonkit/sdk';

export { YOCTO_PER_NEAR };

export type YoctoLike = string | bigint;

/** Parse a yocto amount (U128 JSON string or bigint). Throws on anything that is not an integer. */
export function toYocto(value: YoctoLike): bigint {
  if (typeof value === 'bigint') return value;
  const s = value.trim();
  if (!/^-?\d+$/.test(s)) throw new Error(`not a yocto integer: "${value}"`);
  return BigInt(s);
}

export interface FormatNearOptions {
  /** Maximum fraction digits shown (default 4, truncated). */
  maxDecimals?: number;
  /** Minimum fraction digits shown (default 0). */
  minDecimals?: number;
  /** Group the integer part with commas (default true). */
  group?: boolean;
}

/**
 * Format yoctoNEAR as a NEAR decimal string without unit: "3", "0.25", "1,234.5".
 * Non-zero amounts below the shown precision render as "<0.0001".
 */
export function formatNear(value: YoctoLike, opts: FormatNearOptions = {}): string {
  const { maxDecimals = 4, minDecimals = 0, group = true } = opts;
  if (maxDecimals < 0 || maxDecimals > 24 || minDecimals > maxDecimals) throw new Error('invalid decimals');
  const yocto = toYocto(value);
  const negative = yocto < 0n;
  const abs = negative ? -yocto : yocto;
  const plain = yoctoToNear(abs, maxDecimals);

  if (abs > 0n && /^0(\.0*)?$/.test(plain)) {
    const tiny = maxDecimals === 0 ? '1' : `0.${'0'.repeat(maxDecimals - 1)}1`;
    return `${negative ? '-' : ''}<${tiny}`;
  }
  const [int = '0', frac = ''] = plain.split('.');
  const fracOut = frac.padEnd(minDecimals, '0');
  const intOut = group ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : int;
  return `${negative && abs > 0n ? '-' : ''}${intOut}${fracOut ? `.${fracOut}` : ''}`;
}

/** formatNear with the " NEAR" unit appended. */
export function formatNearUnit(value: YoctoLike, opts?: FormatNearOptions): string {
  return `${formatNear(value, opts)} NEAR`;
}

/** Parse a human NEAR decimal ("0.5", "1,000.25") into yocto. Thousands commas are allowed. */
export function parseNear(input: string): bigint {
  return nearToYocto(input.replace(/,/g, ''));
}

export function sumYocto(...values: YoctoLike[]): bigint {
  return values.reduce<bigint>((acc, v) => acc + toYocto(v), 0n);
}

/** part / whole as a display fraction (bigint math, one conversion). Only for widths/gauges. */
export function displayRatio(part: YoctoLike, whole: YoctoLike): number {
  const w = toYocto(whole);
  if (w <= 0n) return 0;
  return Number((toYocto(part) * 1_000_000n) / w) / 1_000_000;
}
