/** Formatting shared by the build-time renderer and the browser. Money is bigint yoctoNEAR, never float. */

export const YOCTO_PER_NEAR = 10n ** 24n;

/** yoctoNEAR string → "2", "0.25", "1.5" (trailing zeros trimmed, at most `digits` decimals). */
export function near(yocto: string | bigint, digits = 2): string {
  const v = typeof yocto === 'bigint' ? yocto : BigInt(yocto);
  const neg = v < 0n;
  const a = neg ? -v : v;
  const whole = a / YOCTO_PER_NEAR;
  const scale = 10n ** BigInt(24 - digits);
  const frac = (a % YOCTO_PER_NEAR) / scale;
  let f = frac.toString().padStart(digits, '0').replace(/0+$/, '');
  const s = f ? `${whole}.${f}` : `${whole}`;
  return neg ? `-${s}` : s;
}

export function int(n: number | bigint | string): string {
  return BigInt(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Short form of a long account id: printer-01.makerlab.commonkit-sxflo.testnet → printer-01.makerlab… */
export function shortAccount(id: string): string {
  const parts = id.split('.');
  return parts.length > 2 ? `${parts[0]}.${parts[1]}…` : id;
}

export function firstLabel(id: string): string {
  return id.split('.')[0] ?? id;
}

export function shortHash(h: string): string {
  return h.length > 12 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h;
}

interface Unit {
  div: number;
  label: string;
}

const METRIC_UNITS: Record<string, Unit> = {
  nozzle_seconds: { div: 3600, label: 'h of printing' },
  run_seconds: { div: 3600, label: 'h of cutting' },
  engine_seconds: { div: 3600, label: 'engine h' },
  gpu_hours: { div: 1, label: 'GPU h' },
  filament_used_mm: { div: 1000, label: 'm of filament' },
  fuel_used_dl: { div: 10, label: 'L of fuel' },
  jobs_total: { div: 1, label: 'jobs' },
  cycles: { div: 1, label: 'cycles' },
  temp_high_samples: { div: 1, label: 'warm readings' },
  km: { div: 1, label: 'km' },
  sessions: { div: 1, label: 'sessions' },
  uses: { div: 1, label: 'loans' },
};

export function metricValue(metric: string, raw: number | string | bigint): string {
  const u = METRIC_UNITS[metric] ?? { div: 1, label: metric };
  const v = Number(raw) / u.div;
  return int(Math.floor(v));
}

export function metricLabel(metric: string): string {
  return (METRIC_UNITS[metric] ?? { div: 1, label: metric }).label;
}

export type Trigger =
  | { Metric: { metric: string; threshold: number } }
  | { Schedule: { every_hours: number } }
  | { Report: { min_reports: number } };

export function hoursText(h: number): string {
  if (h % 168 === 0) return h === 168 ? 'every week' : `every ${h / 168} weeks`;
  if (h % 24 === 0) return h === 24 ? 'every day' : `every ${h / 24} days`;
  return `every ${h} h`;
}

/** "every 200 h of printing", "every 30 days", "after 2 fault reports" */
export function triggerText(t: Trigger): string {
  if ('Metric' in t) return `every ${metricValue(t.Metric.metric, t.Metric.threshold)} ${metricLabel(t.Metric.metric)}`;
  if ('Schedule' in t) return hoursText(t.Schedule.every_hours);
  const n = t.Report.min_reports;
  return n === 1 ? 'after a fault report' : `after ${n} fault reports`;
}

export function triggerKind(t: Trigger): 'Metric' | 'Schedule' | 'Report' {
  return 'Metric' in t ? 'Metric' : 'Schedule' in t ? 'Schedule' : 'Report';
}

export function relTime(fromIso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(fromIso)) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function utcStamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}
