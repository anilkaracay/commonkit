/**
 * Slot math for demo reservations (CONTRACT_SPEC §6). Pure: chain time in, slot choice out.
 * `slot = floor(t / slot_ns)`; a reservation can start its session only inside
 * `[start, start + start_window]`, so a step that uses the device right away needs a slot whose
 * window is still open (or opens soon), while a step that only books ahead needs a later slot.
 */
export const NS_PER_MIN = 60_000_000_000n;

export interface SlotProfile {
  slot_minutes: number;
  start_window_minutes: number;
  max_slots_per_reservation: number;
}

export interface SlotChoice {
  startSlot: bigint;
  /** Chain time (ns) at which the session may start; `<= now` means right away. */
  startNs: bigint;
  /** Chain time (ns) after which the session can no longer start. */
  windowEndNs: bigint;
  /** How long to wait before access (ns, 0 if none). */
  waitNs: bigint;
}

export const slotNs = (p: SlotProfile): bigint => BigInt(p.slot_minutes) * NS_PER_MIN;
export const slotOf = (nowNs: bigint, p: SlotProfile): bigint => nowNs / slotNs(p);

/**
 * First slot run of `slots` free slots whose start window is still usable for at least `marginNs`
 * and whose start is at most `maxWaitNs` away. `isFree(slot)` says whether a slot is unbooked.
 * Returns null when none qualifies.
 */
export function pickUsableSlot(
  nowNs: bigint,
  p: SlotProfile,
  slots: number,
  isFree: (slot: bigint) => boolean,
  opts: { marginNs: bigint; maxWaitNs: bigint },
): SlotChoice | null {
  if (slots < 1 || slots > p.max_slots_per_reservation) throw new Error(`bad slot count ${slots}`);
  const len = slotNs(p);
  const window = BigInt(p.start_window_minutes) * NS_PER_MIN;
  for (let s = slotOf(nowNs, p); s * len <= nowNs + opts.maxWaitNs; s++) {
    const startNs = s * len;
    const windowEndNs = startNs + window;
    if (windowEndNs < nowNs + opts.marginNs) continue;
    if (!runFree(s, slots, isFree)) continue;
    return { startSlot: s, startNs, windowEndNs, waitNs: startNs > nowNs ? startNs - nowNs : 0n };
  }
  return null;
}

/** First free run of `slots` slots starting at least `leadSlots` after the current slot (booking ahead). */
export function pickFutureSlot(
  nowNs: bigint,
  p: SlotProfile,
  slots: number,
  leadSlots: number,
  isFree: (slot: bigint) => boolean,
  scan = 96,
): bigint {
  const first = slotOf(nowNs, p) + BigInt(leadSlots);
  for (let s = first; s < first + BigInt(scan); s++) if (runFree(s, slots, isFree)) return s;
  throw new Error(`no ${slots} free slots in the next ${scan} slots`);
}

function runFree(start: bigint, slots: number, isFree: (slot: bigint) => boolean): boolean {
  for (let i = 0n; i < BigInt(slots); i++) if (!isFree(start + i)) return false;
  return true;
}

export interface CostProfile {
  price_per_slot: string;
  deposit: string;
  deposit_trusted: string;
  trusted_after: number;
}

/** CONTRACT_SPEC §7 + D-213 #1: exact attached deposit `reserve` expects. */
export const MIN_RESERVATION_STORAGE_DEPOSIT = 10_000_000_000_000_000_000_000n; // 0.01 NEAR

export function reservationCost(
  p: CostProfile,
  cleanReturns: number,
  slots: number,
  withRight: boolean,
): { fee: bigint; deposit: bigint; total: bigint } {
  const trusted = cleanReturns >= p.trusted_after;
  const base = BigInt(trusted ? p.deposit_trusted : p.deposit);
  const fee = withRight ? 0n : BigInt(p.price_per_slot) * BigInt(slots);
  const deposit =
    withRight && base < MIN_RESERVATION_STORAGE_DEPOSIT ? MIN_RESERVATION_STORAGE_DEPOSIT : base;
  return { fee, deposit, total: fee + deposit };
}

/** Smallest slot count whose fee pushes `floatFree` above `cap` (step 6), or null if none fits. */
export function slotsToExceedCap(
  floatFree: bigint,
  cap: bigint,
  pricePerSlot: bigint,
  maxSlots: number,
): number | null {
  for (let n = 1; n <= maxSlots; n++) if (floatFree + pricePerSlot * BigInt(n) > cap) return n;
  return null;
}
