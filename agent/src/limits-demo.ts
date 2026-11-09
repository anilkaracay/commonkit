/**
 * Limits demo (AGENT_SPEC §5, DEMO_SCRIPT steps 16 and 20): the agent's own key tries what it
 * must not be able to do, and each attempt records the chain's answer.
 *
 *   tsx src/limits-demo.ts --chain fake   → offline run on the fake chain (simulated, written to
 *                                            agent/state/agent-limits.fake.json, never evidence/)
 *   tsx src/limits-demo.ts --chain near --config config.yaml
 *                                         → testnet run, writes evidence/agent-limits.json
 *                                            (needs the function-call key signer, wired after M2)
 *
 * An attempt whose on-chain precondition is not met is recorded as `skipped` with the reason;
 * it is never counted as passed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FakeAgentChain } from "./chain/fake.js";
import { ChainError, NS_PER_DAY, type AgentChain, type RuleStatus, type TxOutcome } from "./chain/types.js";
import { loadProfileFile } from "./config.js";
import { toJson } from "./events.js";

/** What the limits demo needs beyond AgentChain: raw calls the agent loop never makes. */
export interface LimitsProbe {
  chain: AgentChain;
  /** `approve_task` signed with the agent key. */
  approveTaskAsAgent(assetId: string, taskId: bigint): Promise<TxOutcome>;
  /** A call with an attached deposit signed with the agent's function-call key. */
  callWithDepositAsAgent(assetId: string, method: string, deposit: bigint): Promise<TxOutcome>;
}

export interface LimitsPlan {
  /** Asset with Metric rules (printer): not-due, duplicate, approve and deposit attempts. */
  metricAsset: string;
  /** Asset with the Schedule rule (fridge `weekly_clean`, DEMO_SCRIPT step 20). */
  scheduleAsset: string;
  scheduleRule: string;
  /** Asset whose period quota is (nearly) used up. */
  quotaAsset: string;
  /** Asset on which the DAO revoked the agent (`set_operators(agent_id = None)`). */
  revokedAsset: string;
  /** Fake only: performs the DAO revocation. On testnet the DAO proposal runs beforehand. */
  revokeAgent?: (assetId: string) => Promise<void>;
}

export type AttemptStatus = "rejected" | "accepted" | "skipped";

export interface LimitAttempt {
  id: string;
  spec: string;
  asset_id: string;
  method: string;
  args: Record<string, unknown>;
  expected: string[];
  status: AttemptStatus;
  code: string | null;
  error: string | null;
  tx_hash: string | null;
  context: Record<string, unknown>;
  pass: boolean;
}

export interface LimitsReport {
  kind: "commonkit-agent-limits";
  generated_at: string;
  network: "testnet";
  chain: "fake" | "near";
  simulated: boolean;
  agent_account: string;
  attempts: LimitAttempt[];
  all_passed: boolean;
}

/** E_* code, or `PROTOCOL:<error>` for a transaction the protocol refused before the contract ran. */
export function outcomeCode(err: unknown): string | null {
  if (!(err instanceof ChainError)) return null;
  if (err.code) return err.code;
  const p = /\b(DepositWithFunctionCall|MethodNameMismatch|ReceiverMismatch|NotEnoughAllowance)\b/.exec(err.message);
  return p ? `PROTOCOL:${p[1]}` : null;
}

const LIMIT_RATIONALE = "Limits demo: the agent tries to open this task although the contract must refuse it.";

export async function runLimitsDemo(probe: LimitsProbe, plan: LimitsPlan, now: () => Date = () => new Date()): Promise<LimitsReport> {
  const { chain } = probe;
  const attempts: LimitAttempt[] = [];

  async function attempt(
    a: Omit<LimitAttempt, "status" | "code" | "error" | "tx_hash" | "pass">,
    run: (() => Promise<TxOutcome>) | null,
    skipReason?: string,
  ): Promise<LimitAttempt> {
    let rec: LimitAttempt;
    if (!run) {
      rec = { ...a, status: "skipped", code: null, error: skipReason ?? "precondition not met", tx_hash: null, pass: false };
    } else {
      try {
        const r = await run();
        rec = { ...a, status: "accepted", code: null, error: null, tx_hash: r.txHash, pass: false };
      } catch (err) {
        const code = outcomeCode(err);
        rec = {
          ...a,
          status: "rejected",
          code,
          error: err instanceof Error ? err.message : String(err),
          tx_hash: null,
          pass: code !== null && a.expected.includes(code),
        };
      }
    }
    attempts.push(rec);
    return rec;
  }

  const ruleCtx = (s: RuleStatus): Record<string, unknown> => ({
    rule_id: s.ruleId,
    kind: s.kind,
    trigger: s.trigger,
    current: s.current,
    baseline: s.baseline,
    due_value: s.dueValue,
    due: s.due,
    next_due_estimate: s.nextDueEstimate,
    open_task: s.openTask,
  });

  // 1. Metric rule below its threshold.
  {
    const s = (await chain.getRuleStatus(plan.metricAsset)).find((r) => r.trigger.type === "Metric" && !r.due && r.openTask === null);
    await attempt(
      {
        id: "rule_not_due_metric",
        spec: "Open a task for a rule whose delta < threshold",
        asset_id: plan.metricAsset,
        method: "open_upkeep_task",
        args: { rule_id: s?.ruleId ?? null, rationale: LIMIT_RATIONALE },
        expected: ["E_RULE_NOT_DUE"],
        context: s ? ruleCtx(s) : {},
      },
      s ? () => chain.openUpkeepTask(plan.metricAsset, s.ruleId, LIMIT_RATIONALE) : null,
      "no Metric rule that is not due and has no open task",
    );
  }

  // 2. Schedule rule before every_hours (fridge weekly_clean).
  {
    const s = (await chain.getRuleStatus(plan.scheduleAsset)).find((r) => r.ruleId === plan.scheduleRule);
    const ok = s !== undefined && s.trigger.type === "Schedule" && !s.due && s.openTask === null;
    await attempt(
      {
        id: "rule_not_due_schedule",
        spec: "Open a task for a Schedule rule before every_hours have passed",
        asset_id: plan.scheduleAsset,
        method: "open_upkeep_task",
        args: { rule_id: plan.scheduleRule, rationale: LIMIT_RATIONALE },
        expected: ["E_RULE_NOT_DUE"],
        context: { ...(s ? ruleCtx(s) : {}), chain_time_ns: await chain.getChainTime() },
      },
      ok ? () => chain.openUpkeepTask(plan.scheduleAsset, plan.scheduleRule, LIMIT_RATIONALE) : null,
      s ? `schedule rule is ${s.due ? "due" : "blocked by an open task"}` : "schedule rule not found",
    );
  }

  // 3. Second task for a rule that already has one (opened legitimately first if needed).
  let openTaskId: bigint | null = null;
  {
    let statuses = await chain.getRuleStatus(plan.metricAsset);
    let s = statuses.find((r) => r.openTask !== null);
    let setup: Record<string, unknown> = {};
    if (!s) {
      const due = statuses.find((r) => r.due && r.openTask === null);
      if (due) {
        const r = await chain.openUpkeepTask(plan.metricAsset, due.ruleId, "Limits demo setup: the rule is due, so the first task opens normally.");
        setup = { setup_task_id: r.taskId, setup_tx_hash: r.txHash };
        statuses = await chain.getRuleStatus(plan.metricAsset);
        s = statuses.find((x) => x.ruleId === due.ruleId);
      }
    }
    openTaskId = s?.openTask ?? null;
    await attempt(
      {
        id: "task_already_open",
        spec: "Open a second task for the same rule",
        asset_id: plan.metricAsset,
        method: "open_upkeep_task",
        args: { rule_id: s?.ruleId ?? null, rationale: LIMIT_RATIONALE },
        expected: ["E_TASK_ALREADY_OPEN"],
        context: { ...(s ? ruleCtx(s) : {}), ...setup },
      },
      s && s.openTask !== null ? () => chain.openUpkeepTask(plan.metricAsset, s.ruleId, LIMIT_RATIONALE) : null,
      "no rule with an open task and no due rule to open one",
    );
  }

  // 4. Period quota.
  {
    const [statuses, period, profile, nowNs] = await Promise.all([
      chain.getRuleStatus(plan.quotaAsset),
      chain.getPeriod(plan.quotaAsset),
      chain.getProfile(plan.quotaAsset),
      chain.getChainTime(),
    ]);
    const rolled = nowNs >= period.startedAt + BigInt(profile.periodDays) * NS_PER_DAY;
    const committed = (rolled ? 0 : period.rightsMinted) + period.rightsReserved;
    const s = statuses.find((r) => r.due && r.openTask === null && committed + r.rewardRights > profile.periodRewardQuota);
    await attempt(
      {
        id: "quota_exceeded",
        spec: "Exceed the period quota",
        asset_id: plan.quotaAsset,
        method: "open_upkeep_task",
        args: { rule_id: s?.ruleId ?? null, rationale: LIMIT_RATIONALE },
        expected: ["E_QUOTA_EXCEEDED"],
        context: {
          ...(s ? ruleCtx(s) : {}),
          rights_minted: period.rightsMinted,
          rights_reserved: period.rightsReserved,
          reward_rights: s?.rewardRights ?? null,
          quota: profile.periodRewardQuota,
        },
      },
      s ? () => chain.openUpkeepTask(plan.quotaAsset, s.ruleId, LIMIT_RATIONALE) : null,
      `no due rule whose rights exceed the quota (committed ${committed} of ${profile.periodRewardQuota})`,
    );
  }

  // 5. approve_task with the agent key.
  await attempt(
    {
      id: "approve_task",
      spec: "Call approve_task",
      asset_id: plan.metricAsset,
      method: "approve_task",
      args: { task_id: openTaskId },
      expected: ["E_MISSING_ROLE", "E_SELF_VERIFY", "PROTOCOL:MethodNameMismatch"],
      context: {},
    },
    openTaskId !== null ? () => probe.approveTaskAsAgent(plan.metricAsset, openTaskId) : null,
    "no task to approve",
  );

  // 6. Money: attach a deposit with the function-call key; the float must not move.
  {
    const before = await chain.getLedger(plan.metricAsset);
    const rec = await attempt(
      {
        id: "deposit_with_function_call_key",
        spec: "Attach deposit with its function-call key (e.g. fund_float)",
        asset_id: plan.metricAsset,
        method: "fund_float",
        args: { deposit_yocto: "1" },
        expected: ["PROTOCOL:DepositWithFunctionCall"],
        context: { float_free_before: before.floatFree },
      },
      () => probe.callWithDepositAsAgent(plan.metricAsset, "fund_float", 1n),
    );
    const after = await chain.getLedger(plan.metricAsset);
    rec.context["float_free_after"] = after.floatFree;
    rec.pass = rec.pass && after.floatFree === before.floatFree;
  }

  // 7. After the DAO revoked the agent.
  {
    if (plan.revokeAgent) await plan.revokeAgent(plan.revokedAsset);
    const wiring = await chain.getWiring(plan.revokedAsset);
    const rule = (await chain.getRuleStatus(plan.revokedAsset))[0];
    await attempt(
      {
        id: "not_agent_after_revocation",
        spec: "Use the key after the DAO calls set_operators(agent_id=None)",
        asset_id: plan.revokedAsset,
        method: "open_upkeep_task",
        args: { rule_id: rule?.ruleId ?? null, rationale: LIMIT_RATIONALE },
        expected: ["E_NOT_AGENT"],
        context: { agent_id_on_chain: wiring.agentId },
      },
      wiring.agentId === null && rule ? () => chain.openUpkeepTask(plan.revokedAsset, rule.ruleId, LIMIT_RATIONALE) : null,
      `agent still bound on chain (agent_id = ${wiring.agentId}); run the DAO set_operators proposal first`,
    );
  }

  return {
    kind: "commonkit-agent-limits",
    generated_at: now().toISOString(),
    network: "testnet",
    chain: chain.kind,
    simulated: chain.kind === "fake",
    agent_account: chain.agentAccountId,
    attempts,
    all_passed: attempts.every((a) => a.pass),
  };
}

/** Offline scenario: printer (Metric), washer (quota nearly used), fridge (Schedule, 1 h old). */
export function fakeLimitsSetup(profilesDir: string, agent = "agent-01.makerlab.testnet"): { probe: LimitsProbe; plan: LimitsPlan; chain: FakeAgentChain } {
  const chain = new FakeAgentChain(agent);
  const printer = "printer-01.makerlab.testnet";
  const washer = "washer-01.dorm-b.testnet";
  const fridge = "fridge-01.dorm-b.testnet";
  chain.addAsset(printer, { profileJson: loadProfileFile(resolve(profilesDir, "printer_3d.json")).profileJson, policyCached: true });
  chain.addAsset(washer, { profileJson: loadProfileFile(resolve(profilesDir, "washer.json")).profileJson, policyCached: true });
  chain.addAsset(fridge, { profileJson: loadProfileFile(resolve(profilesDir, "community_fridge.json")).profileJson, policyCached: true });
  chain.advanceHours(1);
  chain.setMetric(printer, "nozzle_seconds", 720_000n); // nozzle_clean due (200 h)
  chain.setMetric(printer, "filament_used_mm", 120_000n); // filament_spool not due (120 m of 330 m)
  chain.setMetric(washer, "cycles", 31n); // filter_clean due (3 rights)
  chain.setPeriod(washer, { rightsMinted: 10 }); // quota 12: 10 + 3 > 12
  return {
    chain,
    probe: {
      chain,
      approveTaskAsAgent: (a, t) => chain.approveTaskAsAgent(a, t),
      callWithDepositAsAgent: (a, m, d) => chain.callWithDepositAsAgent(a, m, d),
    },
    plan: {
      metricAsset: printer,
      scheduleAsset: fridge,
      scheduleRule: "weekly_clean",
      quotaAsset: washer,
      revokedAsset: printer,
      revokeAgent: async (a) => chain.revokeAgent(a),
    },
  };
}

function writeReport(path: string, report: LimitsReport): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(JSON.parse(toJson(report)), null, 2) + "\n");
}

async function cli(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const repo = resolve(here, "../..");
  const chainArg = process.argv[process.argv.indexOf("--chain") + 1] ?? "fake";
  if (chainArg !== "fake") {
    // ADAPTER: after M2, build a LimitsProbe from NearAgentChain + the agent's function-call key
    // signer and the testnet LimitsPlan from deployments/testnet.json, then write
    // evidence/agent-limits.json.
    throw new Error("testnet limits run needs the agent signer and deployments/testnet.json (after M2)");
  }
  const { probe, plan } = fakeLimitsSetup(resolve(repo, "profiles"));
  const report = await runLimitsDemo(probe, plan);
  const out = resolve(here, "../state/agent-limits.fake.json");
  writeReport(out, report);
  for (const a of report.attempts) process.stdout.write(`${a.pass ? "PASS" : a.status === "skipped" ? "SKIP" : "FAIL"} ${a.id}: ${a.code ?? a.error}\n`);
  process.stdout.write(`${report.all_passed ? "all limits held" : "some limits not shown"} (SIMULATED, fake chain) → ${out}\n`);
  if (!report.all_passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  cli().catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
