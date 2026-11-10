/** Member actions shared by several steps (reserve now / ahead, return, task flow). */
import { readFileSync } from 'node:fs';
import type { TxResult } from '../../lib/near.js';
import { profilePath, slugOf } from './cast.js';
import { eventOf, near, type DemoContext } from './context.js';
import { sha256Hex } from './hash.js';
import { NS_PER_MIN, pickFutureSlot, pickUsableSlot, reservationCost } from './slots.js';
import type { Profile, Reservation } from './views.js';

export interface Booking {
  id: string;
  tx: TxResult;
  startSlot: bigint;
  startNs: bigint;
  fee: bigint;
  deposit: bigint;
}

async function isFreeFn(ctx: DemoContext, assetId: string): Promise<(s: bigint) => boolean> {
  const cache = new Map<bigint, boolean>();
  const a = ctx.asset(assetId);
  // Pre-read the next 12 slots; the slot picker only scans a short range.
  const p = await a.profile();
  const now = (await ctx.chainNow()) / (BigInt(p.slot_minutes) * NS_PER_MIN);
  await Promise.all(
    Array.from({ length: 12 }, (_, i) => now + BigInt(i)).map(async (s) => cache.set(s, (await a.slotOwner(s)) === null)),
  );
  return (s) => cache.get(s) ?? true;
}

async function book(ctx: DemoContext, label: string, assetId: string, holder: string, startSlot: bigint, slots: number, p: Profile, rightId?: string): Promise<Booking> {
  const rep = await ctx.asset(assetId).reputation(holder);
  const cost = reservationCost(p, rep.clean_returns, slots, rightId !== undefined);
  const tx = await ctx.call(
    `${label} (${slots} slot${slots > 1 ? 's' : ''} from slot ${startSlot}${rightId ? `, right ${rightId}` : ''}; fee ${near(cost.fee)} + deposit ${near(cost.deposit)})`,
    holder,
    assetId,
    'reserve',
    { start_slot: startSlot.toString(), slots, right_id: rightId ?? null },
    { deposit: cost.total },
  );
  const id = String(tx.returnValue ?? eventOf(tx, 'reservation_pending')?.reservation_id);
  return { id, tx, startSlot, startNs: startSlot * BigInt(p.slot_minutes) * NS_PER_MIN, fee: cost.fee, deposit: cost.deposit };
}

/** Book slots that can be used right away (or after a short wait for the next slot). */
export async function reserveNow(ctx: DemoContext, label: string, assetId: string, holder: string, slots: number, rightId?: string): Promise<Booking> {
  const p = await ctx.asset(assetId).profile();
  const choice = pickUsableSlot(await ctx.chainNow(), p, slots, await isFreeFn(ctx, assetId), {
    marginNs: 4n * NS_PER_MIN,
    maxWaitNs: BigInt(p.slot_minutes) * NS_PER_MIN,
  });
  if (!choice) throw new Error(`no usable ${slugOf(assetId)} slot in the next slot length`);
  if (choice.waitNs > 0n) ctx.rec.note(`${slugOf(assetId)}: booked the next slot; its start window opens in ${choice.waitNs / 60_000_000_000n} min (chain time)`);
  return book(ctx, label, assetId, holder, choice.startSlot, slots, p, rightId);
}

/** Book slots `leadSlots` ahead (cancellable with full refund, CONTRACT_SPEC §3.2). */
export async function reserveAhead(ctx: DemoContext, label: string, assetId: string, holder: string, slots: number, leadSlots: number, rightId?: string): Promise<Booking> {
  const p = await ctx.asset(assetId).profile();
  const start = pickFutureSlot(await ctx.chainNow(), p, slots, leadSlots, await isFreeFn(ctx, assetId));
  return book(ctx, label, assetId, holder, start, slots, p, rightId);
}

export async function reservation(ctx: DemoContext, assetId: string, id: string): Promise<Reservation> {
  const r = await ctx.asset(assetId).reservation(id);
  if (!r) throw new Error(`${slugOf(assetId)} reservation ${id} not found`);
  return r;
}

/** Wait until the reservation's start window is open (chain time). */
export async function waitForStart(ctx: DemoContext, assetId: string, r: Reservation): Promise<void> {
  const p = await ctx.asset(assetId).profile();
  await ctx.waitChain(BigInt(r.start_slot) * BigInt(p.slot_minutes) * NS_PER_MIN + 2_000_000_000n, `for reservation ${r.id}'s start slot`);
}

/** The `profile` block of a profile file (what `new`/`set_profile` take). */
export function fileProfile(assetSlug: string): Profile {
  return (JSON.parse(readFileSync(profilePath(assetSlug), 'utf8')) as { profile: Profile }).profile;
}

/** Pure: copy of `profile` with one rule's fields replaced (demo overrides go through the DAO). */
export function withRule(profile: Profile, ruleId: string, patch: Partial<Profile['rules'][number]>): Profile {
  if (!profile.rules.some((r) => r.rule_id === ruleId)) throw new Error(`no rule ${ruleId}`);
  return { ...profile, rules: profile.rules.map((r) => (r.rule_id === ruleId ? { ...r, ...patch } : r)) };
}

export const metricThreshold = (p: Profile, ruleId: string): number | undefined =>
  p.rules.find((r) => r.rule_id === ruleId)?.trigger.Metric?.threshold;

/** Claimer flow: claim (if needed) and submit evidence (hashes only). */
export async function claimAndSubmit(ctx: DemoContext, assetId: string, taskId: string, claimer: string, evidence: string, expense?: { amount: bigint; receipt: string }): Promise<void> {
  const a = ctx.asset(assetId);
  let t = await a.task(taskId);
  if (t?.status === 'Open') {
    await ctx.call(`claim task #${taskId}`, claimer, assetId, 'claim_task', { task_id: taskId });
    t = await a.task(taskId);
  }
  if (t?.status === 'Claimed')
    await ctx.call(
      `submit task #${taskId} (evidence hash${expense ? `, expense ${near(expense.amount)} + receipt hash` : ''})`,
      claimer,
      assetId,
      'submit_task',
      {
        task_id: taskId,
        evidence_hash: sha256Hex(evidence),
        evidence_uri: null,
        expense: expense ? expense.amount.toString() : null,
        receipt_hash: expense ? sha256Hex(expense.receipt) : null,
      },
    );
}
