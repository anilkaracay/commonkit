/** Pure helpers shared by the build (HTML slots) and the browser (live refresh). bigint for money. */
export interface Rule { id: string; kind: string; trigger: { Metric?: { metric: string; threshold: number }; Schedule?: { every_hours: number }; Report?: { min_reports: number } }; dueValue: string; due: boolean; openTask: string | null; rewardRights: number }
export interface Asset { account: string; kind: string; name: string; community: string; dao: string; inService: boolean; floatFree: string; floatCap: string; feesIn: string; swept: string; codeHash: string; fullAccessKeys: number; rules: Rule[]; tasks: { id: string; rule: string; status: string; claimer: string | null; verifier: string | null; rewardRights: number }[] }
export interface CkData {
  takenAt: string;
  assets: Asset[];
  overrides: { asset: string; rule: string; value: string; production: string }[];
  printerProfile: { price: string; deposit: string; slotMinutes: number; validityDays: number; group: string };
  earned: { step: number; tx: string; by: string; rights: string[] };
  refused: { label: string; hash: string; code: string; by: string }[];
}

/** yoctoNEAR string → "2.60" (bigint math, rounded to `dp` places). */
export function near(y: string, dp = 2): string {
  const s = 10n ** BigInt(24 - dp);
  const r = (BigInt(y) + s / 2n) / s;
  const p = 10n ** BigInt(dp);
  return dp ? `${r / p}.${(r % p).toString().padStart(dp, '0')}` : `${r}`;
}
export const ratio = (a: string, b: string): number => (BigInt(b) === 0n ? 0 : Number((BigInt(a) * 10000n) / BigInt(b)) / 10000);
export const sum = (xs: string[]): string => xs.reduce((s, x) => s + BigInt(x), 0n).toString();
export const threshold = (r: Rule): number => r.trigger.Metric?.threshold ?? r.trigger.Schedule?.every_hours ?? r.trigger.Report?.min_reports ?? 0;
export const headlineRule = (a: Asset): Rule => a.rules.find((r) => r.trigger.Metric) ?? a.rules[0]!;
const fmt = new Intl.NumberFormat('en-US');
export const int = (n: number | string): string => fmt.format(Number(n));
export const short = (h: string): string => `${h.slice(0, 6)}…`;
export const nameOf = (account: string): string => account.split('.')[0]!;
export const pct = (x: number): string => `${Math.round(Math.max(0, Math.min(1, x)) * 1000) / 10}%`;
export const readTime = (iso: string): string =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
export const explorer = (h: string): string => `https://testnet.nearblocks.io/txns/${h}`;
