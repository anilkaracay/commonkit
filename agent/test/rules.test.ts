import { describe, expect, it } from "vitest";
import { ruleStatusSchema, taskSchema } from "../src/chain/schemas.js";
import { BIKE, FRIDGE, PRINTER, WASHER, world } from "./helpers.js";

describe("rule evaluation per trigger (the agent trusts get_rule_status.due)", () => {
  it("Metric: opens only once the delta reaches the threshold", async () => {
    const w = world([PRINTER]);
    w.chain.setMetric(PRINTER, "filament_used_mm", 329_999n);
    await w.agent.tick();
    expect(w.calls("open_upkeep_task")).toHaveLength(0);

    w.chain.setMetric(PRINTER, "filament_used_mm", 334_000n);
    await w.agent.tick();
    const opened = w.of("task_opened");
    expect(opened).toHaveLength(1);
    expect(opened[0]!.data).toMatchObject({ rule_id: "filament_spool", kind: "Restock", trigger: "Metric", due_value: "334000" });
    expect(opened[0]!.data["rationale"]).toBe(
      "Filament used since last restock: 334 m (threshold 330 m). Opening 'Load a new filament spool (receipt for reimbursement)' with reward: 1 usage right; a receipt of up to 0.5 NEAR can be reimbursed. [rationale: template]",
    );
  });

  it("Metric: after a reward the baseline moves and the rule waits for a new delta", async () => {
    const w = world([PRINTER]);
    w.chain.setMetric(PRINTER, "jobs_total", 50n);
    await w.agent.tick();
    const taskId = BigInt(w.of("task_opened")[0]!.data["task_id"] as string);
    w.chain.completeTask(PRINTER, taskId, "ayse.testnet");
    w.chain.setMetric(PRINTER, "jobs_total", 99n);
    await w.agent.tick();
    expect(w.calls("open_upkeep_task")).toHaveLength(1);
    w.chain.setMetric(PRINTER, "jobs_total", 100n);
    await w.agent.tick();
    expect(w.calls("open_upkeep_task")).toHaveLength(2);
  });

  it("Schedule: not due before every_hours, due after (fridge weekly_clean)", async () => {
    const w = world([FRIDGE]);
    w.chain.advanceHours(167);
    await w.agent.tick();
    expect(w.calls("open_upkeep_task")).toHaveLength(0);

    w.chain.advanceHours(1);
    await w.agent.tick();
    const opened = w.of("task_opened");
    expect(opened).toHaveLength(1);
    expect(opened[0]!.data).toMatchObject({ rule_id: "weekly_clean", kind: "Cleaning", trigger: "Schedule", due_value: "168" });
    expect(opened[0]!.data["rationale"]).toBe(
      "No cleaning recorded in the last 168 h (every 168 h). Opening 'Empty, clean and sanitize the fridge' with reward: 2 usage rights. [rationale: template]",
    );
  });

  it("Schedule: after a completed cleaning the wording uses the last cleaning", async () => {
    const w = world([FRIDGE]);
    w.chain.advanceHours(168);
    await w.agent.tick();
    w.chain.completeTask(FRIDGE, 0n, "zeynep.testnet");
    w.chain.advanceHours(168);
    await w.agent.tick();
    expect(w.of("task_opened")[1]!.data["rationale"]).toBe(
      "Last cleaning 7 days ago (every 168 h). Opening 'Empty, clean and sanitize the fridge' with reward: 2 usage rights. [rationale: template]",
    );
  });

  it("Report: opens once distinct reports reach min_reports and names nobody", async () => {
    const w = world([BIKE]);
    w.chain.reportFault(BIKE, "return_home", "alice.testnet");
    await w.agent.tick();
    expect(w.calls("open_upkeep_task")).toHaveLength(0);

    w.chain.reportFault(BIKE, "return_home", "bob.testnet");
    await w.agent.tick();
    const opened = w.of("task_opened");
    expect(opened).toHaveLength(1);
    const rationale = opened[0]!.data["rationale"] as string;
    expect(rationale).toBe(
      "2 members reported the asset away from its home spot (needed: 2). Opening 'Bring the bike back to its home spot' with reward: 1 usage right. [rationale: template]",
    );
    expect(rationale).not.toMatch(/alice|bob/);
  });

  it("opens at most one task per due rule and several rules in one tick", async () => {
    const w = world([WASHER]);
    w.chain.setMetric(WASHER, "cycles", 40n); // filter_clean (30) and detergent (40) due
    await w.agent.tick();
    await w.agent.tick();
    const rules = w.calls("open_upkeep_task").map((c) => c.args["rule_id"]);
    expect(rules.sort()).toEqual(["detergent", "filter_clean"]);
  });

  it("never sends manual (open_upkeep_task args are exactly rule_id and rationale)", async () => {
    const w = world([PRINTER, FRIDGE]);
    w.chain.setMetric(PRINTER, "nozzle_seconds", 800_000n);
    w.chain.advanceHours(200);
    await w.agent.tick();
    const calls = w.calls("open_upkeep_task");
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(Object.keys(c.args).sort()).toEqual(["rationale", "rule_id"]);
  });

  it("does nothing when the DAO has not bound this agent to the asset", async () => {
    const w = world([PRINTER]);
    w.chain.setMetric(PRINTER, "jobs_total", 60n);
    w.chain.revokeAgent(PRINTER);
    await w.agent.tick();
    await w.agent.tick();
    expect(w.calls("open_upkeep_task")).toHaveLength(0);
    expect(w.of("agent_waiting").map((e) => e.data["reason"])).toEqual(["agent_not_bound"]);
  });

  it("one failing asset does not stop the others", async () => {
    const w = world([PRINTER, WASHER]);
    w.chain.setMetric(WASHER, "cycles", 30n);
    w.assets.unshift({ ...w.assets[0]!, assetId: "missing.testnet" });
    await w.agent.tick();
    expect(w.of("agent_error")[0]!.asset_id).toBe("missing.testnet");
    expect(w.of("task_opened")[0]!.asset_id).toBe(WASHER);
  });
});

describe("contract JSON decoding", () => {
  it("decodes get_rule_status rows for all trigger shapes", () => {
    const base = { kind: "Cleaning", current: "7", baseline: "0", due_value: "7", due: true, open_task: null, reward_rights: 2, reward_cash: "0", reimbursable_max: "0" };
    const m = ruleStatusSchema.parse({ ...base, rule_id: "a", trigger: { Metric: { metric: "km", threshold: 300 } }, next_due_estimate: null });
    const s = ruleStatusSchema.parse({ ...base, rule_id: "b", trigger: { Schedule: { every_hours: 168 } }, next_due_estimate: "1800604800000000000", open_task: "4" });
    const r = ruleStatusSchema.parse({ ...base, rule_id: "c", trigger: { Report: { min_reports: 2 } } });
    expect(m.trigger).toEqual({ type: "Metric", metric: "km", threshold: 300n });
    expect(s.trigger).toEqual({ type: "Schedule", everyHours: 168 });
    expect(s.nextDueEstimate).toBe(1_800_604_800_000_000_000n);
    expect(s.openTask).toBe(4n);
    expect(r.trigger).toEqual({ type: "Report", minReports: 2 });
  });

  it("decodes expense states including Escalated", () => {
    const t = {
      id: "3", rule_id: "fault_repair", kind: "Repair", status: "Rewarded", opened_by: "agent.testnet", manual: false,
      claimer: "ayse.testnet", claimed_at: "1", claim_timeout_hours: 96, expense: "800000000000000000000000",
      created_at: "1", extra_field_is_ignored: true,
    };
    expect(taskSchema.parse({ ...t, expense_state: "NeedsEscalation" }).expenseState).toEqual({ type: "NeedsEscalation" });
    expect(taskSchema.parse({ ...t, expense_state: { Escalated: { escalation_id: "2" } } }).expenseState).toEqual({ type: "Escalated", escalationId: 2n });
  });
});
