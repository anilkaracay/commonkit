/** Nanosecond timestamps (U64 strings) and slot math (CONTRACT_SPEC §6). */
import type { U64 } from '../data/types';

const NS_PER_MS = 1_000_000n;
const NS_PER_MINUTE = 60n * 1_000_000_000n;

export function nsToDate(ns: U64 | bigint): Date {
  return new Date(Number(BigInt(ns) / NS_PER_MS));
}

export function dateToNs(date: Date): bigint {
  return BigInt(date.getTime()) * NS_PER_MS;
}

/** slot = floor(timestamp_ns / (slot_minutes * 60e9)) */
export function slotOf(ns: bigint, slotMinutes: number): bigint {
  return ns / (BigInt(slotMinutes) * NS_PER_MINUTE);
}

export function slotStartNs(slot: U64 | bigint, slotMinutes: number): bigint {
  return BigInt(slot) * BigInt(slotMinutes) * NS_PER_MINUTE;
}

const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "14 Nov 09:30 UTC". UTC keeps screenshots and tests deterministic. */
export function formatDateTime(ns: U64 | bigint): string {
  const d = nsToDate(ns);
  return `${dayFmt.format(d)} ${timeFmt.format(d)} UTC`;
}

export function formatTime(ns: U64 | bigint): string {
  return timeFmt.format(nsToDate(ns));
}

/** Relative age against `nowMs`, coarse: "just now", "12 min ago", "3 h ago", "2 d ago". */
export function formatAgo(ns: U64 | bigint, nowMs: number): string {
  const diffMin = Math.floor((nowMs - nsToDate(ns).getTime()) / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const h = Math.floor(diffMin / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}
