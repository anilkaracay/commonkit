/**
 * The deterministic operations loop (AGENT_SPEC §2). Per asset and tick:
 *   read → open at most one task per due rule → annotate stale open tasks → escalate purchase
 *   and reimbursement needs → sync open escalations → float note.
 *
 * Idempotency (D-601): every write is preceded by a fresh read of the state it depends on; a
 * contract panic (E_*) is final and never retried; a write that may have landed (timeout after
 * broadcast) is held back until the chain says that transaction can no longer land, and the next
 * read decides. The agent never passes `manual` (the AgentChain interface has no such argument).
 */
import { ChainError, MAX_NOTE_LEN, MAX_OPEN_ESCALATIONS, MAX_RATIONALE_LEN, NS_PER_DAY, NS_PER_HOUR } from "./chain/types.js";
import type { AgentChain, TaskView } from "./chain/types.js";
import type { EventBus } from "./events.js";
import type { AgentMemory } from "./memory.js";
import { purchaseNeeds, reimbursementNeeds, type EscalationNeed, type PurchaseHint } from "./needs.js";
import type { Rephraser } from "./rationale/llm.js";
import { buildFacts, near, templateRationale } from "./rationale/templates.js";

export interface AgentAsset {
  assetId: string;
  alias: string;
  /** The device behind this asset is simulated; every event about it says so. */
  simulated: boolean;
  purchaseHints: PurchaseHint[];
  supplierIsTeamAccount: boolean;
}

export interface AgentOptions {
  chain: AgentChain;
  assets: AgentAsset[];
  bus: EventBus;
  rephraser: Rephraser;
  memory: AgentMemory;
  /** Minimum time between two `sync_escalation` calls for a Submitted escalation. */
  syncEveryMs: number;
  /** Wall clock (ms) for throttles only; never for due decisions. */
  nowMs?: () => number;
}

/** Suffix that records where the wording came from (AGENT_SPEC §3.2 `rationale_source`). */
export function withSource(text: string, source: "template" | "llm"): string {
  const suffix = ` [rationale: ${source}]`;
  const body = text.length + suffix.length > MAX_RATIONALE_LEN ? text.slice(0, MAX_RATIONALE_LEN - suffix.length - 1) + "…" : text;
  return body + suffix;
}

export class Agent {
  private readonly chain: AgentChain;
  private readonly nowMs: () => number;

  constructor(private readonly o: AgentOptions) {
    this.chain = o.chain;
    this.nowMs = o.nowMs ?? (() => Date.now());
  }

  /** One pass over every asset. An asset whose reads fail is skipped; the others still run. */
  async tick(): Promise<void> {
    for (const asset of this.o.assets) {
      try {
        await this.tickAsset(asset);
      } catch (err) {
        this.emit(asset, "agent_error", { error: errText(err) }, null, "error");
      }
    }
  }

  async tickAsset(asset: AgentAsset): Promise<void> {
    const id = asset.assetId;
    const chainNs = await this.chain.getChainTime();
    const wiring = await this.chain.getWiring(id);
    if (wiring.agentId !== this.chain.agentAccountId) {
      this.skip(asset, `${id}/binding`, "agent_not_bound", { agent_id: wiring.agentId, me: this.chain.agentAccountId }, chainNs);
      return;
    }
    this.o.memory.clearSkip(`${id}/binding`);

    const statuses = await this.chain.getRuleStatus(id);
    for (const s of statuses) {
      if (s.due && s.openTask === null) await this.openIfDue(asset, s.ruleId);
      else this.o.memory.clearSkip(`${id}/open/${s.ruleId}`);
    }

    const tasks = await this.chain.getTasks(id);
    await this.annotateStale(asset, tasks, chainNs);
    await this.escalateNeeds(asset);
    await this.syncEscalations(asset);
    await this.checkFloat(asset, chainNs);
  }

  // ------------------------------------------------------------------ upkeep tasks

  private async openIfDue(asset: AgentAsset, ruleId: string): Promise<void> {
    const id = asset.assetId;
    const key = `${id}/open/${ruleId}`;
    if (await this.o.memory.isHeld(key, this.chain)) {
      this.skip(asset, key, "write_unsettled", { rule_id: ruleId }, null);
      return;
    }
    // Read before write: everything the decision depends on, fresh.
    const [statuses, profile, period, ledger, tasks, service, chainNs] = await Promise.all([
      this.chain.getRuleStatus(id),
      this.chain.getProfile(id),
      this.chain.getPeriod(id),
      this.chain.getLedger(id),
      this.chain.getTasks(id),
      this.chain.getServiceStatus(id),
      this.chain.getChainTime(),
    ]);
    const status = statuses.find((s) => s.ruleId === ruleId);
    const rule = profile.rules.find((r) => r.ruleId === ruleId);
    if (!status || !rule || !status.due || status.openTask !== null) return;

    const rolled = chainNs >= period.startedAt + BigInt(profile.periodDays) * NS_PER_DAY;
    const committed = (rolled ? 0 : period.rightsMinted) + period.rightsReserved + status.rewardRights;
    if (committed > profile.periodRewardQuota) {
      this.skip(asset, key, "quota_reached", {
        rule_id: ruleId,
        rights_committed: committed - status.rewardRights,
        reward_rights: status.rewardRights,
        quota: profile.periodRewardQuota,
      }, chainNs);
      return;
    }
    if (status.rewardCash > ledger.floatFree) {
      this.skip(asset, key, "float_below_reward_cash", { rule_id: ruleId, reward_cash: status.rewardCash, float_free: ledger.floatFree }, chainNs);
      return;
    }

    const completedBefore = tasks.filter((t) => t.ruleId === ruleId && t.status === "Rewarded").length;
    const facts = buildFacts(status, rule, { assetName: profile.displayName, completedBefore, outOfService: !service.inService });
    const template = templateRationale(facts, status, completedBefore);
    const phrased = await this.o.rephraser.rephrase(facts, template);
    const rationale = withSource(phrased.text, phrased.source);
    const detail = {
      rule_id: ruleId,
      kind: status.kind,
      trigger: status.trigger.type,
      due_value: status.dueValue,
      rationale,
      rationale_source: phrased.source,
      ...(phrased.source === "template" && this.o.rephraser.enabled ? { llm_fallback: phrased.fallbackReason } : {}),
    };

    try {
      const r = await this.chain.openUpkeepTask(id, ruleId, rationale);
      this.o.memory.clearSkip(key);
      this.emit(asset, "task_opened", { ...detail, task_id: r.taskId, tx_hash: r.txHash }, chainNs);
    } catch (err) {
      await this.onWriteError(asset, key, "open_upkeep_task", err, detail, async () => {
        const after = (await this.chain.getRuleStatus(id)).find((s) => s.ruleId === ruleId);
        return after?.openTask != null ? { task_id: after.openTask } : null;
      });
    }
  }

  /** Open, unclaimed tasks older than their claim timeout get one note (event only on chain). */
  private async annotateStale(asset: AgentAsset, tasks: readonly TaskView[], chainNs: bigint): Promise<void> {
    for (const t of tasks) {
      if (t.status !== "Open" || t.claimer !== null) continue;
      const age = chainNs > t.createdAt ? (chainNs - t.createdAt) / NS_PER_HOUR : 0n;
      if (t.claimTimeoutHours === 0 || age < BigInt(t.claimTimeoutHours)) continue;
      const key = `${asset.assetId}/annotate/${t.id}`;
      if (this.o.memory.wasAnnotated(key) || (await this.o.memory.isHeld(key, this.chain))) continue;
      const note = `Still open after ${age} h (claim timeout ${t.claimTimeoutHours} h); consider raising the reward through a DAO profile change.`.slice(0, MAX_NOTE_LEN);
      try {
        const r = await this.chain.annotateTask(asset.assetId, t.id, note);
        this.o.memory.markAnnotated(key);
        this.emit(asset, "task_annotated", { task_id: t.id, note, tx_hash: r.txHash }, chainNs);
      } catch (err) {
        // A note is informational: after a rejection or an unknown outcome, do not send it again.
        if (err instanceof ChainError && (err.code !== null || err.ambiguous)) this.o.memory.markAnnotated(key);
        await this.onWriteError(asset, key, "annotate_task", err, { task_id: t.id }, null);
      }
    }
  }

  // ------------------------------------------------------------------ escalations

  private async escalateNeeds(asset: AgentAsset): Promise<void> {
    const id = asset.assetId;
    const [tasks, escalations, profile] = await Promise.all([
      this.chain.getTasks(id),
      this.chain.getEscalations(id),
      this.chain.getProfile(id),
    ]);
    const needs = [
      ...reimbursementNeeds(tasks, escalations, profile.autoRewardCashCap),
      ...purchaseNeeds(asset.purchaseHints, tasks, escalations, { supplierIsTeamAccount: asset.supplierIsTeamAccount }),
    ];
    for (const need of needs) await this.escalateOne(asset, need);
  }

  private async escalateOne(asset: AgentAsset, need: EscalationNeed): Promise<void> {
    const id = asset.assetId;
    const key = `${id}/escalate/${need.key}`;
    if (await this.o.memory.isHeld(key, this.chain)) {
      this.skip(asset, key, "write_unsettled", { need: need.key }, null);
      return;
    }
    // Read before write, then recompute the need from the fresh state.
    const [wiring, ledger, tasks, escalations, profile] = await Promise.all([
      this.chain.getWiring(id),
      this.chain.getLedger(id),
      this.chain.getTasks(id),
      this.chain.getEscalations(id),
      this.chain.getProfile(id),
    ]);
    const fresh =
      need.kind === "reimbursement"
        ? reimbursementNeeds(tasks, escalations, profile.autoRewardCashCap)
        : purchaseNeeds(asset.purchaseHints, tasks, escalations, { supplierIsTeamAccount: asset.supplierIsTeamAccount });
    if (!fresh.some((n) => n.key === need.key)) return;

    if (wiring.daoProposalBond === null) {
      await this.refreshPolicy(asset);
      this.skip(asset, key, "dao_policy_not_cached", { need: need.key }, null);
      return;
    }
    if (wiring.openEscalations >= MAX_OPEN_ESCALATIONS) {
      this.skip(asset, key, "too_many_open_escalations", { need: need.key, open: wiring.openEscalations }, null);
      return;
    }
    if (ledger.floatFree < wiring.daoProposalBond) {
      this.skip(asset, key, "float_below_bond", { need: need.key, float_free: ledger.floatFree, bond: wiring.daoProposalBond }, null);
      return;
    }
    const detail = {
      need: need.key,
      kind: need.kind,
      receiver: need.receiver,
      amount: need.amount,
      amount_near: near(need.amount),
      task_id: need.taskId,
      reason: need.reason,
      bond: wiring.daoProposalBond,
    };
    try {
      const r = await this.chain.escalate(id, {
        kind: need.kind,
        receiver: need.receiver,
        amount: need.amount,
        reason: need.reason,
        taskId: need.taskId,
      });
      this.o.memory.clearSkip(key);
      this.emit(asset, "escalation_requested", { ...detail, escalation_id: r.escalationId, tx_hash: r.txHash }, null);
    } catch (err) {
      await this.onWriteError(asset, key, "escalate", err, detail, async () => {
        const after = await this.chain.getEscalations(id);
        const e = after.find((x) => x.kind === need.kind && x.taskId === need.taskId && x.status !== "Failed");
        return e ? { escalation_id: e.id } : null;
      });
    }
  }

  private async refreshPolicy(asset: AgentAsset): Promise<void> {
    const key = `${asset.assetId}/refresh_dao_policy`;
    if (!this.o.memory.syncDue(key, this.nowMs(), this.o.syncEveryMs)) return;
    if (await this.o.memory.isHeld(key, this.chain)) return;
    this.o.memory.markSynced(key, this.nowMs());
    try {
      const r = await this.chain.refreshDaoPolicy(asset.assetId);
      this.emit(asset, "dao_policy_refreshed", { tx_hash: r.txHash }, null);
    } catch (err) {
      await this.onWriteError(asset, key, "refresh_dao_policy", err, {}, null);
    }
  }

  /** `sync_escalation` is public and idempotent on chain; it is only throttled here. */
  private async syncEscalations(asset: AgentAsset): Promise<void> {
    const escalations = await this.chain.getEscalations(asset.assetId);
    for (const e of escalations) {
      if (e.proposalId === null || e.bondSettled) continue;
      const key = `${asset.assetId}/sync/${e.id}`;
      const every = e.status === "Submitted" ? this.o.syncEveryMs : this.o.syncEveryMs * 10;
      if (!this.o.memory.syncDue(key, this.nowMs(), every)) continue;
      this.o.memory.markSynced(key, this.nowMs());
      try {
        const r = await this.chain.syncEscalation(asset.assetId, e.id);
        const after = (await this.chain.getEscalations(asset.assetId)).find((x) => x.id === e.id);
        this.emit(asset, "escalation_synced", {
          escalation_id: e.id,
          proposal_id: e.proposalId,
          status_before: e.status,
          status_after: after?.status ?? null,
          bond_settled: after?.bondSettled ?? null,
          tx_hash: r.txHash,
        }, null);
      } catch (err) {
        this.emit(asset, "escalation_sync_failed", { escalation_id: e.id, ...errorFields(err) }, null, "warn");
      }
    }
  }

  /** Off-chain note only: without float for a proposal bond, escalations cannot be opened. */
  private async checkFloat(asset: AgentAsset, chainNs: bigint): Promise<void> {
    const [wiring, ledger] = await Promise.all([this.chain.getWiring(asset.assetId), this.chain.getLedger(asset.assetId)]);
    const key = `${asset.assetId}/float`;
    if (wiring.daoProposalBond !== null && ledger.floatFree < wiring.daoProposalBond) {
      this.skip(asset, key, "float_low", {
        float_free: ledger.floatFree,
        bond: wiring.daoProposalBond,
        note: "The float cannot cover a proposal bond; the DAO can fund the float (fund_float) or change prices.",
      }, chainNs);
    } else {
      this.o.memory.clearSkip(key);
    }
  }

  // ------------------------------------------------------------------ helpers

  /**
   * After a failed write: E_* → final, report and never retry. Ambiguous → hold the write and
   * re-read; if the effect is visible, report it as done. Otherwise it definitely did not apply
   * and the next tick decides again from fresh state.
   */
  private async onWriteError(
    asset: AgentAsset,
    key: string,
    method: string,
    err: unknown,
    detail: Record<string, unknown>,
    confirm: (() => Promise<Record<string, unknown> | null>) | null,
  ): Promise<void> {
    if (err instanceof ChainError && err.code !== null) {
      this.emit(asset, "write_rejected", { method, code: err.code, ...detail, error: err.message }, null, "warn");
      return;
    }
    if (err instanceof ChainError && err.ambiguous && err.ref) {
      this.o.memory.hold(key, err.ref);
      let seen: Record<string, unknown> | null = null;
      try {
        seen = confirm ? await confirm() : null;
      } catch {
        seen = null;
      }
      this.emit(asset, "write_ambiguous", {
        method,
        ...detail,
        tx_hash: err.ref.txHash,
        landed: seen !== null,
        ...(seen ?? {}),
        note: "held until the transaction can no longer land; the next read decides",
      }, null, "warn");
      return;
    }
    this.emit(asset, "write_failed", { method, ...detail, ...errorFields(err) }, null, "warn");
  }

  private skip(asset: AgentAsset, key: string, reason: string, data: Record<string, unknown>, chainNs: bigint | null): void {
    if (!this.o.memory.skipChanged(key, reason)) return;
    this.emit(asset, "agent_waiting", { reason, ...data }, chainNs);
  }

  private emit(
    asset: AgentAsset,
    type: string,
    data: Record<string, unknown>,
    chainNs: bigint | null,
    level: "info" | "warn" | "error" = "info",
  ): void {
    this.o.bus.emit({
      type,
      assetId: asset.assetId,
      simulated: asset.simulated || this.chain.kind === "fake",
      data,
      chainNs,
      level,
    });
  }
}

function errorFields(err: unknown): Record<string, unknown> {
  if (err instanceof ChainError) return { code: err.code, ambiguous: err.ambiguous, error: err.message };
  return { error: errText(err) };
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
