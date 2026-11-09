/**
 * In-memory stand-in for the asset contract, limited to what the agent touches. Every check
 * mirrors contracts/asset/src (tasks.rs open_upkeep_task / annotate_task, escalations.rs), with
 * the same E_* codes, so tests and the offline limits demo exercise the agent against the same
 * rules the chain enforces. Everything it produces is simulated and labelled so.
 */
import { profileSchema } from "./schemas.js";
import {
  ChainError,
  MAX_NOTE_LEN,
  MAX_OPEN_ESCALATIONS,
  MAX_RATIONALE_LEN,
  MAX_REASON_LEN,
  NS_PER_DAY,
  NS_PER_HOUR,
  type AgentChain,
  type EscalationStatus,
  type EscalationView,
  type FaultsView,
  type LedgerView,
  type PeriodView,
  type ProfileView,
  type RuleStatus,
  type ServiceStatusView,
  type TaskView,
  type TxOutcome,
  type UpkeepRule,
  type WiringView,
  type WriteRef,
} from "./types.js";

export interface FakeTask extends TaskView {
  rationale: string;
  dueValueAtOpen: bigint;
  rewardRights: number;
  rewardCash: bigint;
}

/** Sputnik proposal status as the fake DAO reports it. */
export type FakeProposalStatus = "InProgress" | "Approved" | "Rejected" | "Expired" | "Removed" | "Failed";

interface FakeAsset {
  daoId: string;
  agentId: string | null;
  profile: ProfileView;
  createdAt: bigint;
  telemetry: Map<string, bigint>;
  baselines: Map<string, bigint>;
  faults: Map<string, Set<string>>;
  tasks: FakeTask[];
  openTaskByRule: Map<string, bigint>;
  period: PeriodView;
  ledger: LedgerView;
  roles: Map<string, string[]>;
  bondOnRefresh: bigint;
  proposalPeriodOnRefresh: bigint;
  bond: bigint | null;
  proposalPeriod: bigint | null;
  escalations: EscalationView[];
  proposals: Map<bigint, FakeProposalStatus>;
  service: ServiceStatusView;
}

export type FakeFailure =
  /** The write is applied, then the client sees a timeout. Settles after `settleAfter` checks. */
  | { mode: "ambiguous_applied"; settleAfter?: number }
  /** The client sees a timeout; the write never lands. Settles after `settleAfter` checks. */
  | { mode: "ambiguous_lost"; settleAfter?: number }
  /** Fails before broadcast; nothing applied. */
  | { mode: "rpc_down" };

export interface FakeCall {
  assetId: string;
  method: string;
  args: Record<string, unknown>;
  deposit: bigint;
}

export interface FakeAssetInit {
  /** A profile object in contract JSON (the `profile` field of profiles/*.json). */
  profileJson: unknown;
  daoId?: string;
  agentId?: string | null;
  floatFree?: bigint;
  proposalBond?: bigint;
  proposalPeriodNs?: bigint;
  /** Cache the DAO policy at creation (as if refresh_dao_policy already ran). */
  policyCached?: boolean;
}

export class FakeAgentChain implements AgentChain {
  readonly kind = "fake" as const;
  readonly calls: FakeCall[] = [];
  private readonly assets = new Map<string, FakeAsset>();
  private readonly failures = new Map<string, FakeFailure[]>();
  private readonly unsettled = new Map<string, number>();
  private txSeq = 0;
  private proposalSeq = 0n;
  viewsDown = false;

  constructor(
    readonly agentAccountId: string,
    public nowNs: bigint = 1_800_000_000_000_000_000n,
  ) {}

  // ---------------------------------------------------------------- scenario setup (tests, demo)

  addAsset(assetId: string, init: FakeAssetInit): void {
    const profile = profileSchema.parse(init.profileJson);
    const bond = init.proposalBond ?? 10n ** 23n;
    const period = init.proposalPeriodNs ?? 7n * NS_PER_DAY;
    this.assets.set(assetId, {
      daoId: init.daoId ?? `dao-of-${assetId}`,
      agentId: init.agentId === undefined ? this.agentAccountId : init.agentId,
      profile,
      createdAt: this.nowNs,
      telemetry: new Map(),
      baselines: new Map(),
      faults: new Map(),
      tasks: [],
      openTaskByRule: new Map(),
      period: { startedAt: this.nowNs, rightsMinted: 0, rightsReserved: 0 },
      ledger: { floatFree: init.floatFree ?? 2n * 10n ** 24n, floatCap: 3n * 10n ** 24n, depositsHeld: 0n, rewardsReserved: 0n },
      roles: new Map(),
      bondOnRefresh: bond,
      proposalPeriodOnRefresh: period,
      bond: init.policyCached ? bond : null,
      proposalPeriod: init.policyCached ? period : null,
      escalations: [],
      proposals: new Map(),
      service: { inService: true, since: this.nowNs },
    });
  }

  advanceHours(hours: number): void {
    this.nowNs += BigInt(hours) * NS_PER_HOUR;
  }

  setMetric(assetId: string, metric: string, value: bigint): void {
    const a = this.asset(assetId);
    const prev = a.telemetry.get(metric) ?? 0n;
    if (value < prev) throw new ChainError("E_TELEMETRY_NOT_MONOTONIC: counter decreased", "E_TELEMETRY_NOT_MONOTONIC");
    a.telemetry.set(metric, value);
  }

  addMetric(assetId: string, metric: string, delta: bigint): void {
    this.setMetric(assetId, metric, (this.asset(assetId).telemetry.get(metric) ?? 0n) + delta);
  }

  reportFault(assetId: string, ruleId: string, reporter: string): void {
    const a = this.asset(assetId);
    const set = a.faults.get(ruleId) ?? new Set<string>();
    if (set.has(reporter)) throw new ChainError("E_ALREADY_REPORTED: one active report per account", "E_ALREADY_REPORTED");
    set.add(reporter);
    a.faults.set(ruleId, set);
  }

  setOutOfService(assetId: string, out: boolean): void {
    this.asset(assetId).service = { inService: !out, since: this.nowNs };
  }

  setPeriod(assetId: string, p: Partial<PeriodView>): void {
    const a = this.asset(assetId);
    a.period = { ...a.period, ...p };
  }

  setFloat(assetId: string, floatFree: bigint): void {
    this.asset(assetId).ledger.floatFree = floatFree;
  }

  /** DAO `set_operators(agent_id = None)`. */
  revokeAgent(assetId: string): void {
    this.asset(assetId).agentId = null;
  }

  grantRole(assetId: string, account: string, role: string): void {
    const a = this.asset(assetId);
    a.roles.set(account, [...(a.roles.get(account) ?? []), role]);
  }

  /**
   * Members do the work and get approved: Open → Rewarded with the contract's reward effects
   * (rights counted, baseline reset per trigger, faults cleared, service restored by a Repair).
   * With `expense` above the auto cash cap the expense is left at NeedsEscalation (approve_task).
   */
  completeTask(assetId: string, taskId: bigint, claimer: string, expense = 0n): FakeTask {
    const a = this.asset(assetId);
    const t = this.task(a, taskId);
    const rule = this.rule(a, t.ruleId);
    t.claimer = claimer;
    t.claimedAt = this.nowNs;
    t.expense = expense;
    if (expense > a.profile.autoRewardCashCap) t.expenseState = { type: "NeedsEscalation" };
    else if (expense > 0n) t.expenseState = { type: "Paid" };
    t.status = "Rewarded";
    a.period.rightsReserved = Math.max(0, a.period.rightsReserved - t.rewardRights);
    a.period.rightsMinted += t.rewardRights;
    a.ledger.rewardsReserved -= t.rewardCash;
    if (rule.trigger.type === "Metric") a.baselines.set(rule.ruleId, a.telemetry.get(rule.trigger.metric) ?? 0n);
    if (rule.trigger.type === "Schedule") a.baselines.set(rule.ruleId, this.nowNs);
    if (rule.trigger.type === "Report") a.faults.delete(rule.ruleId);
    if (rule.kind === "Repair" && !a.service.inService) a.service = { inService: true, since: this.nowNs };
    a.openTaskByRule.delete(rule.ruleId);
    return t;
  }

  /** What the DAO's proposal would say on the next `sync_escalation`. */
  setProposalStatus(assetId: string, escalationId: bigint, status: FakeProposalStatus): void {
    const a = this.asset(assetId);
    const e = a.escalations.find((x) => x.id === escalationId);
    if (!e || e.proposalId === null) throw new Error(`no proposal for escalation ${escalationId}`);
    a.proposals.set(e.proposalId, status);
  }

  /** Make the next call of `method` fail as described. */
  failNext(method: string, failure: FakeFailure): void {
    this.failures.set(method, [...(this.failures.get(method) ?? []), failure]);
  }

  tasksRaw(assetId: string): readonly FakeTask[] {
    return this.asset(assetId).tasks;
  }

  // ---------------------------------------------------------------- views

  async getChainTime(): Promise<bigint> {
    this.viewGuard();
    return this.nowNs;
  }

  async getProfile(assetId: string): Promise<ProfileView> {
    this.viewGuard();
    return structuredClone(this.asset(assetId).profile);
  }

  async getWiring(assetId: string): Promise<WiringView> {
    this.viewGuard();
    const a = this.asset(assetId);
    return {
      daoId: a.daoId,
      agentId: a.agentId,
      daoProposalBond: a.bond,
      daoProposalPeriod: a.proposalPeriod,
      openEscalations: a.escalations.filter((e) => e.status === "Submitting" || e.status === "Submitted").length,
    };
  }

  async getRuleStatus(assetId: string): Promise<RuleStatus[]> {
    this.viewGuard();
    const a = this.asset(assetId);
    return a.profile.rules.map((rule) => ({
      ruleId: rule.ruleId,
      kind: rule.kind,
      trigger: structuredClone(rule.trigger),
      ...this.due(a, rule),
      openTask: a.openTaskByRule.get(rule.ruleId) ?? null,
      rewardRights: rule.rewardRights,
      rewardCash: rule.rewardCash,
      reimbursableMax: rule.reimbursableMax,
    }));
  }

  async getTasks(assetId: string): Promise<TaskView[]> {
    this.viewGuard();
    return this.asset(assetId).tasks.map((t) => {
      const { rationale: _r, dueValueAtOpen: _d, rewardRights: _rr, rewardCash: _rc, ...view } = structuredClone(t);
      return view;
    });
  }

  async getLedger(assetId: string): Promise<LedgerView> {
    this.viewGuard();
    return { ...this.asset(assetId).ledger };
  }

  async getPeriod(assetId: string): Promise<PeriodView> {
    this.viewGuard();
    return { ...this.asset(assetId).period };
  }

  async getEscalations(assetId: string): Promise<EscalationView[]> {
    this.viewGuard();
    return structuredClone(this.asset(assetId).escalations);
  }

  async getFaults(assetId: string): Promise<FaultsView[]> {
    this.viewGuard();
    const a = this.asset(assetId);
    return a.profile.rules
      .filter((r) => r.trigger.type === "Report")
      .map((r) => ({ ruleId: r.ruleId, reports: a.faults.get(r.ruleId)?.size ?? 0 }));
  }

  async getServiceStatus(assetId: string): Promise<ServiceStatusView> {
    this.viewGuard();
    return { ...this.asset(assetId).service };
  }

  // ---------------------------------------------------------------- writes (agent key)

  async openUpkeepTask(assetId: string, ruleId: string, rationale: string): Promise<TxOutcome & { taskId: bigint | null }> {
    return this.write(assetId, "open_upkeep_task", { rule_id: ruleId, rationale }, 0n, () => {
      const a = this.asset(assetId);
      this.assertAgentOrCouncil(a);
      const rule = a.profile.rules.find((r) => r.ruleId === ruleId);
      if (!rule) panic("E_RULE_NOT_FOUND", "no such rule in the profile");
      if (a.openTaskByRule.has(ruleId)) panic("E_TASK_ALREADY_OPEN", "rule already has an open task");
      const due = this.due(a, rule);
      if (!due.due) panic("E_RULE_NOT_DUE", "the rule's trigger has not fired");
      if (rationale.length === 0) panic("E_INVALID_ARGS", "rationale must not be empty");
      if (rationale.length > MAX_RATIONALE_LEN) panic("E_INVALID_ARGS", "rationale longer than 1000 characters");
      if (rule.rewardCash > a.profile.autoRewardCashCap) panic("E_CASH_CAP_EXCEEDED", "reward_cash above auto_reward_cash_cap");
      if (rule.rewardCash > a.ledger.floatFree) panic("E_INSUFFICIENT_FLOAT", "float cannot reserve the cash reward");
      this.rollPeriod(a);
      if (a.period.rightsMinted + a.period.rightsReserved + rule.rewardRights > a.profile.periodRewardQuota)
        panic("E_QUOTA_EXCEEDED", "period reward quota reached");
      a.ledger.floatFree -= rule.rewardCash;
      a.ledger.rewardsReserved += rule.rewardCash;
      a.period.rightsReserved += rule.rewardRights;
      const id = BigInt(a.tasks.length);
      a.tasks.push({
        id,
        ruleId,
        kind: rule.kind,
        status: "Open",
        openedBy: this.agentAccountId,
        manual: false,
        claimer: null,
        claimedAt: null,
        claimTimeoutHours: rule.claimTimeoutHours,
        expense: 0n,
        expenseState: { type: "None" },
        createdAt: this.nowNs,
        rationale,
        dueValueAtOpen: due.dueValue,
        rewardRights: rule.rewardRights,
        rewardCash: rule.rewardCash,
      });
      a.openTaskByRule.set(ruleId, id);
      return { taskId: id };
    });
  }

  async annotateTask(assetId: string, taskId: bigint, note: string): Promise<TxOutcome> {
    return this.write(assetId, "annotate_task", { task_id: taskId.toString(), note }, 0n, () => {
      const a = this.asset(assetId);
      if (a.agentId !== this.agentAccountId) panic("E_NOT_AGENT", "caller is not the agent");
      this.task(a, taskId);
      if (note.length > MAX_NOTE_LEN) panic("E_INVALID_ARGS", "note longer than 500 characters");
      return {};
    });
  }

  async escalate(
    assetId: string,
    req: { kind: "purchase" | "reimbursement"; receiver: string; amount: bigint; reason: string; taskId: bigint | null },
  ): Promise<TxOutcome & { escalationId: bigint | null }> {
    const args = {
      kind: req.kind,
      receiver: req.receiver,
      amount: req.amount.toString(),
      reason: req.reason,
      task_id: req.taskId === null ? null : req.taskId.toString(),
    };
    return this.write(assetId, "escalate", args, 0n, () => {
      const a = this.asset(assetId);
      this.assertAgentOrCouncil(a);
      if (req.amount <= 0n) panic("E_WRONG_AMOUNT", "amount must be > 0");
      if (req.reason.length === 0) panic("E_INVALID_ARGS", "reason must not be empty");
      if (req.reason.length > MAX_REASON_LEN) panic("E_INVALID_ARGS", "reason longer than 500 characters");
      const task = req.taskId === null ? null : this.task(a, req.taskId);
      if (req.kind === "reimbursement") {
        if (!task) panic("E_INVALID_ARGS", "reimbursement needs task_id");
        if (task.expenseState.type !== "NeedsEscalation") panic("E_BAD_STATE", "task expense does not need an escalation");
        if (task.claimer !== req.receiver || task.expense !== req.amount)
          panic("E_INVALID_ARGS", "reimbursement must pay the claimer exactly the expense");
      }
      const open = a.escalations.filter((e) => e.status === "Submitting" || e.status === "Submitted").length;
      if (open >= MAX_OPEN_ESCALATIONS) panic("E_TOO_MANY_ESCALATIONS", "too many open escalations");
      if (a.bond === null) panic("E_BAD_STATE", "call refresh_dao_policy first");
      if (a.ledger.floatFree < a.bond) panic("E_INSUFFICIENT_FLOAT", "float cannot cover the proposal bond");
      a.ledger.floatFree -= a.bond;
      const id = BigInt(a.escalations.length);
      const proposalId = this.proposalSeq++;
      a.proposals.set(proposalId, "InProgress");
      a.escalations.push({
        id,
        kind: req.kind,
        receiver: req.receiver,
        amount: req.amount,
        reason: req.reason,
        taskId: req.taskId,
        proposalId,
        status: "Submitted",
        bondSettled: false,
        submittedAt: this.nowNs,
      });
      if (task && req.kind === "reimbursement") task.expenseState = { type: "Escalated", escalationId: id };
      return { escalationId: id };
    });
  }

  async syncEscalation(assetId: string, escalationId: bigint): Promise<TxOutcome> {
    return this.write(assetId, "sync_escalation", { escalation_id: escalationId.toString() }, 0n, () => {
      const a = this.asset(assetId);
      const e = a.escalations.find((x) => x.id === escalationId);
      if (!e) panic("E_NOT_FOUND", "no such escalation");
      if (e.proposalId === null) panic("E_BAD_STATE", "escalation has no proposal id");
      if (e.bondSettled) panic("E_BAD_STATE", "escalation is final and its bond settled");
      const status = a.proposals.get(e.proposalId) ?? "Removed";
      const bond = a.bond ?? 0n;
      let mapped: EscalationStatus;
      if (status === "Removed") {
        e.bondSettled = true; // bond lost
        mapped = "Rejected";
      } else if (status === "InProgress") {
        const expired = a.proposalPeriod !== null && e.submittedAt + a.proposalPeriod < this.nowNs;
        mapped = expired ? "Expired" : "Submitted";
      } else if (status === "Failed") {
        e.bondSettled = true; // bond lost
        mapped = "Failed";
      } else {
        e.bondSettled = true;
        a.ledger.floatFree += bond;
        mapped = status;
      }
      // escalations.rs `propagate_expense`: Approved → Paid, DAO rejection → Denied,
      // Removed / Expired / Failed → NeedsEscalation (may be escalated again).
      const t = e.taskId === null ? undefined : a.tasks.find((x) => x.id === e.taskId);
      if (e.kind === "reimbursement" && t && t.expenseState.type === "Escalated" && t.expenseState.escalationId === e.id) {
        if (mapped === "Approved") t.expenseState = { type: "Paid" };
        else if (mapped === "Rejected" && status !== "Removed") t.expenseState = { type: "Denied" };
        else if (mapped !== "Submitted") t.expenseState = { type: "NeedsEscalation" };
      }
      e.status = mapped;
      return {};
    });
  }

  async refreshDaoPolicy(assetId: string): Promise<TxOutcome> {
    return this.write(assetId, "refresh_dao_policy", {}, 0n, () => {
      const a = this.asset(assetId);
      a.bond = a.bondOnRefresh;
      a.proposalPeriod = a.proposalPeriodOnRefresh;
      return {};
    });
  }

  async isWriteSettled(ref: WriteRef): Promise<boolean> {
    if (ref.txHash === null) return true;
    const left = this.unsettled.get(ref.txHash);
    if (left === undefined || left <= 0) return true;
    this.unsettled.set(ref.txHash, left - 1);
    return false;
  }

  // ---------------------------------------------------------------- limits-demo probes

  /** `approve_task` signed by the agent: the contract requires the verifier role first. */
  async approveTaskAsAgent(assetId: string, taskId: bigint): Promise<TxOutcome> {
    return this.write(assetId, "approve_task", { task_id: taskId.toString() }, 0n, () => {
      const a = this.asset(assetId);
      if (!(a.roles.get(this.agentAccountId) ?? []).includes("verifier")) panic("E_MISSING_ROLE", "caller lacks role verifier");
      panic("E_SELF_VERIFY", "claimer, agent and bridge cannot approve");
    });
  }

  /** A function-call access key cannot attach a deposit; the protocol rejects the transaction. */
  async callWithDepositAsAgent(assetId: string, method: string, deposit: bigint): Promise<TxOutcome> {
    this.calls.push({ assetId, method, args: {}, deposit });
    throw new ChainError(
      "InvalidTxError: InvalidAccessKeyError: DepositWithFunctionCall (simulated by the fake chain)",
      null,
    );
  }

  // ---------------------------------------------------------------- internals

  private write<T extends object>(
    assetId: string,
    method: string,
    args: Record<string, unknown>,
    deposit: bigint,
    apply: () => T,
  ): Promise<TxOutcome & T> {
    this.calls.push({ assetId, method, args, deposit });
    const txHash = `fake-tx-${++this.txSeq}`;
    const queue = this.failures.get(method);
    const failure = queue?.shift();
    const ref: WriteRef = { method, txHash, nonce: BigInt(this.txSeq), sentAtMs: 0 };
    if (failure?.mode === "rpc_down") return Promise.reject(new ChainError(`RPC unavailable (fake) during ${method}`, null));
    if (failure?.mode === "ambiguous_lost") {
      this.unsettled.set(txHash, failure.settleAfter ?? 1);
      return Promise.reject(new ChainError(`timeout waiting for ${method} (fake)`, null, true, ref));
    }
    let result: T;
    try {
      result = apply();
    } catch (err) {
      return Promise.reject(err);
    }
    if (failure?.mode === "ambiguous_applied") {
      this.unsettled.set(txHash, failure.settleAfter ?? 1);
      return Promise.reject(new ChainError(`timeout waiting for ${method} (fake)`, null, true, ref));
    }
    return Promise.resolve({ txHash, ...result });
  }

  private viewGuard(): void {
    if (this.viewsDown) throw new ChainError("RPC unavailable (fake)", null);
  }

  private asset(assetId: string): FakeAsset {
    const a = this.assets.get(assetId);
    if (!a) throw new ChainError(`unknown asset ${assetId}`, null);
    return a;
  }

  private rule(a: FakeAsset, ruleId: string): UpkeepRule {
    const r = a.profile.rules.find((x) => x.ruleId === ruleId);
    if (!r) panic("E_RULE_NOT_FOUND", "no such rule in the profile");
    return r;
  }

  private task(a: FakeAsset, taskId: bigint): FakeTask {
    const t = a.tasks.find((x) => x.id === taskId);
    if (!t) panic("E_NOT_FOUND", "no such task");
    return t;
  }

  private assertAgentOrCouncil(a: FakeAsset): void {
    const isAgent = a.agentId === this.agentAccountId;
    const isCouncil = (a.roles.get(this.agentAccountId) ?? []).includes("council");
    if (!isAgent && !isCouncil) panic("E_NOT_AGENT", "caller is not the agent or a council member");
  }

  private rollPeriod(a: FakeAsset): void {
    if (this.nowNs >= a.period.startedAt + BigInt(a.profile.periodDays) * NS_PER_DAY) {
      a.period = { startedAt: this.nowNs, rightsMinted: 0, rightsReserved: a.period.rightsReserved };
    }
  }

  /** tasks.rs `rule_due`. */
  private due(a: FakeAsset, rule: UpkeepRule): Pick<RuleStatus, "current" | "baseline" | "dueValue" | "due" | "nextDueEstimate"> {
    const t = rule.trigger;
    if (t.type === "Metric") {
      const current = a.telemetry.get(t.metric) ?? 0n;
      const baseline = a.baselines.get(rule.ruleId) ?? 0n;
      const delta = current > baseline ? current - baseline : 0n;
      return { current, baseline, dueValue: delta, due: delta >= t.threshold, nextDueEstimate: null };
    }
    if (t.type === "Schedule") {
      const baseline = a.baselines.get(rule.ruleId) ?? a.createdAt;
      const elapsed = this.nowNs > baseline ? this.nowNs - baseline : 0n;
      const interval = BigInt(t.everyHours) * NS_PER_HOUR;
      const hours = elapsed / NS_PER_HOUR;
      return { current: hours, baseline, dueValue: hours, due: elapsed >= interval, nextDueEstimate: baseline + interval };
    }
    const active = BigInt(a.faults.get(rule.ruleId)?.size ?? 0);
    return { current: active, baseline: 0n, dueValue: active, due: active >= BigInt(t.minReports), nextDueEstimate: null };
  }
}

function panic(code: string, message: string): never {
  throw new ChainError(`Smart contract panicked: ${code}: ${message}`, code);
}
