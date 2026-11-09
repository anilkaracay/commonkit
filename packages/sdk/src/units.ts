/** yoctoNEAR <-> NEAR conversions. All math is bigint; strings are only for display/input. */
export const YOCTO_PER_NEAR = 10n ** 24n;

/** Parse a decimal NEAR string ("1", "0.25") into yocto. Rejects more than 24 decimals. */
export function nearToYocto(near: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,24}))?$/.exec(near.trim());
  if (!m) throw new Error(`invalid NEAR amount: ${near}`);
  const whole = BigInt(m[1]!);
  const frac = BigInt((m[2] ?? '').padEnd(24, '0') || '0');
  return whole * YOCTO_PER_NEAR + frac;
}

/** Format yocto as a NEAR decimal string, truncated (never rounded up) to `maxDecimals`. */
export function yoctoToNear(yocto: bigint | string, maxDecimals = 4): string {
  const v = typeof yocto === 'string' ? BigInt(yocto) : yocto;
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / YOCTO_PER_NEAR;
  const frac = (abs % YOCTO_PER_NEAR).toString().padStart(24, '0').slice(0, maxDecimals);
  const trimmed = frac.replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${trimmed ? `.${trimmed}` : ''}`;
}
