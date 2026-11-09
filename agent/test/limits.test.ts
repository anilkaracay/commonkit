import { describe, expect, it } from "vitest";
import { fakeLimitsSetup, outcomeCode, runLimitsDemo } from "../src/limits-demo.js";
import { ChainError } from "../src/chain/types.js";
import { PROFILES } from "./helpers.js";

describe("limits demo (AGENT_SPEC §5) on the fake chain", () => {
  it("every limit holds with the expected code, and the report says simulated", async () => {
    const { probe, plan } = fakeLimitsSetup(PROFILES);
    const report = await runLimitsDemo(probe, plan, () => new Date("2026-11-09T00:00:00Z"));
    expect(report).toMatchObject({ chain: "fake", simulated: true, all_passed: true });
    expect(Object.fromEntries(report.attempts.map((a) => [a.id, a.code]))).toEqual({
      rule_not_due_metric: "E_RULE_NOT_DUE",
      rule_not_due_schedule: "E_RULE_NOT_DUE",
      task_already_open: "E_TASK_ALREADY_OPEN",
      quota_exceeded: "E_QUOTA_EXCEEDED",
      approve_task: "E_MISSING_ROLE",
      deposit_with_function_call_key: "PROTOCOL:DepositWithFunctionCall",
      not_agent_after_revocation: "E_NOT_AGENT",
    });
    const schedule = report.attempts.find((a) => a.id === "rule_not_due_schedule")!;
    expect(schedule.context).toMatchObject({ rule_id: "weekly_clean", due: false, current: 1n });
    expect(schedule.context["next_due_estimate"]).not.toBeNull();
  });

  it("an unmet precondition is recorded as skipped, never as passed", async () => {
    const { probe, plan } = fakeLimitsSetup(PROFILES);
    delete plan.revokeAgent; // the DAO has not revoked the agent yet
    const report = await runLimitsDemo(probe, plan);
    const revoked = report.attempts.find((a) => a.id === "not_agent_after_revocation")!;
    expect(revoked).toMatchObject({ status: "skipped", pass: false });
    expect(revoked.error).toMatch(/run the DAO set_operators proposal first/);
    expect(report.all_passed).toBe(false);
  });

  it("a wrong error code fails the attempt", async () => {
    const { probe, plan, chain } = fakeLimitsSetup(PROFILES);
    chain.setPeriod(plan.quotaAsset, { rightsMinted: 0 }); // quota no longer reached
    const report = await runLimitsDemo(probe, plan);
    expect(report.attempts.find((a) => a.id === "quota_exceeded")!.status).toBe("skipped");
    expect(report.all_passed).toBe(false);
  });

  it("maps protocol refusals of function-call keys", () => {
    expect(outcomeCode(new ChainError("InvalidTxError: DepositWithFunctionCall", null))).toBe("PROTOCOL:DepositWithFunctionCall");
    expect(outcomeCode(new ChainError("ActionError MethodNameMismatch { method_name: approve_task }", null))).toBe("PROTOCOL:MethodNameMismatch");
    expect(outcomeCode(new ChainError("x", "E_NOT_AGENT"))).toBe("E_NOT_AGENT");
    expect(outcomeCode(new Error("network"))).toBeNull();
  });
});
