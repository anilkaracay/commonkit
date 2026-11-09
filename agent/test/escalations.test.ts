import { describe, expect, it } from "vitest";
import { reimbursementNeeds } from "../src/needs.js";
import type { TaskView } from "../src/chain/types.js";
import { PRINTER, world, type World } from "./helpers.js";

const NEAR = 10n ** 24n;
const SUPPLIER = "supplier.commonkit-sxflo.testnet";

/** Opens and completes `n` nozzle_clean tasks (each needs 200 h of nozzle time). */
async function nozzleCycles(w: World, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    w.chain.addMetric(PRINTER, "nozzle_seconds", 720_000n);
    await w.agent.tick();
    const t = w.chain.tasksRaw(PRINTER).find((x) => x.ruleId === "nozzle_clean" && x.status === "Open")!;
    w.chain.completeTask(PRINTER, t.id, "ayse.testnet");
  }
}

/** Opens filament_spool and completes it with `expense`. */
async function restockWithExpense(w: World, expense: bigint): Promise<bigint> {
  w.chain.addMetric(PRINTER, "filament_used_mm", 330_000n);
  await w.agent.tick();
  const t = w.chain.tasksRaw(PRINTER).find((x) => x.ruleId === "filament_spool" && x.status === "Open")!;
  w.chain.completeTask(PRINTER, t.id, "ayse.testnet", expense);
  return t.id;
}

describe("purchase escalations from profile purchase_hints", () => {
  it("proposes the nozzle kit once after every 2 rewarded cleanings", async () => {
    const w = world([PRINTER], { supplierIsTeamAccount: true });
    await nozzleCycles(w, 1);
    await w.agent.tick();
    expect(w.calls("escalate")).toHaveLength(0);

    await nozzleCycles(w, 1);
    await w.agent.tick();
    await w.agent.tick();
    const calls = w.calls("escalate");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args).toMatchObject({ kind: "purchase", receiver: SUPPLIER, amount: (4n * NEAR).toString(), task_id: "1" });
    expect(calls[0]!.args["reason"]).toBe(
      `Nozzle kit for 'nozzle_clean': 2 rewarded tasks so far, the profile suggests a new one every 2 (latest task #1). Amount 4 NEAR. Receiver ${SUPPLIER} is a COMMONKIT team account acting as the demo supplier.`,
    );
    expect(w.of("escalation_requested")[0]!.data).toMatchObject({ kind: "purchase", escalation_id: "0", amount_near: "4 NEAR" });

    await nozzleCycles(w, 2);
    await w.agent.tick();
    expect(w.calls("escalate").map((c) => c.args["task_id"])).toEqual(["1", "3"]);
  });

  it("a DAO rejection is the answer (not re-asked); a failed submission may be retried", async () => {
    const w = world([PRINTER]);
    await nozzleCycles(w, 2);
    await w.agent.tick();
    w.chain.setProposalStatus(PRINTER, 0n, "Rejected");
    w.clockMs.now += 60_000;
    await w.agent.tick(); // sync → Rejected
    await w.agent.tick();
    expect((await w.chain.getEscalations(PRINTER))[0]!.status).toBe("Rejected");
    expect(w.calls("escalate")).toHaveLength(1);

    const w2 = world([PRINTER]);
    await nozzleCycles(w2, 2);
    await w2.agent.tick();
    w2.chain.setProposalStatus(PRINTER, 0n, "Failed");
    w2.clockMs.now += 60_000;
    await w2.agent.tick(); // sync (after the needs step) → Failed
    expect(w2.calls("escalate")).toHaveLength(1);
    await w2.agent.tick(); // the need is open again
    expect(w2.calls("escalate")).toHaveLength(2);
  });
});

describe("reimbursement escalations (D-017)", () => {
  it("escalates exactly the claimer and expense for a NeedsEscalation task, once", async () => {
    const w = world([PRINTER]);
    const taskId = await restockWithExpense(w, 8n * NEAR / 10n); // above the 0.5 NEAR cap
    await w.agent.tick();
    await w.agent.tick();
    const calls = w.calls("escalate");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args).toMatchObject({ kind: "reimbursement", receiver: "ayse.testnet", amount: (8n * NEAR / 10n).toString(), task_id: taskId.toString() });
    expect(calls[0]!.args["reason"]).toBe(
      `Reimburse the documented Restock expense of 0.8 NEAR for task #${taskId} ('filament_spool') to its claimer. It is above the asset's automatic cash cap of 0.5 NEAR, so the DAO decides.`,
    );
    expect((await w.chain.getTasks(PRINTER))[Number(taskId)]!.expenseState).toEqual({ type: "Escalated", escalationId: 0n });
  });

  it("never escalates an expense at or below the cap", async () => {
    const w = world([PRINTER]);
    await restockWithExpense(w, 4n * NEAR / 10n);
    await w.agent.tick();
    expect(w.calls("escalate")).toHaveLength(0);
  });

  it("only NeedsEscalation tasks qualify", () => {
    const base: TaskView = {
      id: 1n, ruleId: "fault_repair", kind: "Repair", status: "Rewarded", openedBy: "a", manual: false, claimer: "c.testnet",
      claimedAt: 1n, claimTimeoutHours: 96, expense: NEAR, expenseState: { type: "None" }, createdAt: 1n,
    };
    for (const type of ["None", "Reserved", "Paid"] as const)
      expect(reimbursementNeeds([{ ...base, expenseState: { type } }], [], NEAR / 2n)).toEqual([]);
    expect(reimbursementNeeds([{ ...base, expenseState: { type: "Escalated", escalationId: 0n } }], [], NEAR / 2n)).toEqual([]);
    expect(reimbursementNeeds([{ ...base, expenseState: { type: "NeedsEscalation" } }], [], NEAR / 2n)).toHaveLength(1);
  });
});

describe("escalation preconditions and dedupe", () => {
  it("refreshes the DAO policy first when the bond is not cached", async () => {
    const w = world([PRINTER], { policyCached: false });
    await restockWithExpense(w, NEAR);
    await w.agent.tick();
    expect(w.calls("refresh_dao_policy")).toHaveLength(1);
    expect(w.calls("escalate")).toHaveLength(0); // on chain the policy lands in a callback; escalate on the next read
    await w.agent.tick();
    expect(w.calls("refresh_dao_policy")).toHaveLength(1);
    expect(w.calls("escalate")).toHaveLength(1);
  });

  it("waits when the float cannot cover the bond, and says so", async () => {
    const w = world([PRINTER]);
    await restockWithExpense(w, NEAR);
    w.chain.setFloat(PRINTER, 10n ** 22n);
    await w.agent.tick();
    expect(w.calls("escalate")).toHaveLength(0);
    expect(w.of("agent_waiting").map((e) => e.data["reason"])).toEqual(expect.arrayContaining(["float_below_bond", "float_low"]));
  });

  it("waits while 3 escalations are open", async () => {
    const w = world([PRINTER]);
    for (let i = 0; i < 4; i++) await restockWithExpense(w, NEAR);
    await w.agent.tick();
    expect(w.calls("escalate")).toHaveLength(3);
    expect(w.of("agent_waiting").some((e) => e.data["reason"] === "too_many_open_escalations")).toBe(true);
  });

  it("an escalate that timed out but landed is never duplicated", async () => {
    const w = world([PRINTER]);
    await nozzleCycles(w, 2);
    w.chain.failNext("escalate", { mode: "ambiguous_applied", settleAfter: 1 });
    for (let i = 0; i < 4; i++) await w.agent.tick();
    expect(w.calls("escalate")).toHaveLength(1);
    expect(await w.chain.getEscalations(PRINTER)).toHaveLength(1);
    expect(w.of("write_ambiguous")[0]!.data).toMatchObject({ method: "escalate", landed: true, escalation_id: "0" });
  });

  it("an escalate that timed out and was lost is sent again only after it can no longer land", async () => {
    const w = world([PRINTER]);
    await nozzleCycles(w, 2);
    w.chain.failNext("escalate", { mode: "ambiguous_lost", settleAfter: 2 });
    await w.agent.tick();
    await w.agent.tick();
    await w.agent.tick();
    expect(w.calls("escalate")).toHaveLength(1);
    await w.agent.tick();
    expect(w.calls("escalate")).toHaveLength(2);
    expect(await w.chain.getEscalations(PRINTER)).toHaveLength(1);
  });
});

describe("sync of open escalations", () => {
  it("syncs submitted escalations at most once per interval and stops once settled", async () => {
    const w = world([PRINTER]);
    await nozzleCycles(w, 2);
    await w.agent.tick(); // escalate + first sync
    await w.agent.tick(); // throttled
    expect(w.calls("sync_escalation")).toHaveLength(1);
    w.chain.setProposalStatus(PRINTER, 0n, "Approved");
    w.clockMs.now += 60_000;
    await w.agent.tick();
    expect(w.of("escalation_synced").at(-1)!.data).toMatchObject({ status_before: "Submitted", status_after: "Approved", bond_settled: true });
    w.clockMs.now += 600_000;
    await w.agent.tick();
    expect(w.calls("sync_escalation")).toHaveLength(2);
  });
});
