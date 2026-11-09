import { describe, expect, it } from "vitest";
import { AgentMemory } from "../src/memory.js";
import { FRIDGE, PRINTER, WASHER, world } from "./helpers.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("idempotency: read before write, never blind-retry", () => {
  it("repeated ticks never re-open a rule that has an open task", async () => {
    const w = world([PRINTER]);
    w.chain.setMetric(PRINTER, "jobs_total", 60n);
    for (let i = 0; i < 5; i++) await w.agent.tick();
    expect(w.calls("open_upkeep_task")).toHaveLength(1);
  });

  it("a write that timed out but landed is not sent again; the feed reports it as landed", async () => {
    const w = world([PRINTER]);
    w.chain.setMetric(PRINTER, "jobs_total", 60n);
    w.chain.failNext("open_upkeep_task", { mode: "ambiguous_applied", settleAfter: 2 });
    await w.agent.tick();
    const amb = w.of("write_ambiguous");
    expect(amb).toHaveLength(1);
    expect(amb[0]!.data).toMatchObject({ method: "open_upkeep_task", landed: true, task_id: "0" });
    for (let i = 0; i < 4; i++) await w.agent.tick();
    expect(w.calls("open_upkeep_task")).toHaveLength(1);
    expect(w.chain.tasksRaw(PRINTER)).toHaveLength(1);
  });

  it("a write that timed out and was lost is held until it can no longer land, then sent once", async () => {
    const w = world([PRINTER]);
    w.chain.setMetric(PRINTER, "jobs_total", 60n);
    w.chain.failNext("open_upkeep_task", { mode: "ambiguous_lost", settleAfter: 2 });
    await w.agent.tick(); // sent, outcome unknown
    expect(w.of("write_ambiguous")[0]!.data["landed"]).toBe(false);
    await w.agent.tick(); // still unsettled → held
    await w.agent.tick(); // still unsettled → held
    expect(w.calls("open_upkeep_task")).toHaveLength(1);
    expect(w.of("agent_waiting").map((e) => e.data["reason"])).toContain("write_unsettled");
    await w.agent.tick(); // settled and not applied → decide again from fresh state
    expect(w.calls("open_upkeep_task")).toHaveLength(2);
    expect(w.chain.tasksRaw(PRINTER)).toHaveLength(1);
    await w.agent.tick();
    expect(w.calls("open_upkeep_task")).toHaveLength(2);
  });

  it("holds survive a restart through the memory file", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "agent-mem-")), "memory.json");
    const m1 = new AgentMemory(file);
    m1.hold("a/open/r", { method: "open_upkeep_task", txHash: "abc", nonce: 7n, sentAtMs: 1 });
    m1.markAnnotated("a/annotate/1");
    const m2 = new AgentMemory(file);
    expect(m2.heldKeys()).toEqual(["a/open/r"]);
    expect(m2.wasAnnotated("a/annotate/1")).toBe(true);
  });

  it("a write that failed before broadcast is not held; the next tick decides again", async () => {
    const w = world([PRINTER]);
    w.chain.setMetric(PRINTER, "nozzle_seconds", 720_000n);
    w.chain.failNext("open_upkeep_task", { mode: "rpc_down" });
    await w.agent.tick();
    expect(w.of("write_failed")).toHaveLength(1);
    expect(w.calls("open_upkeep_task")).toHaveLength(1);
    await w.agent.tick(); // definitely not applied → next tick may send again
    expect(w.calls("open_upkeep_task")).toHaveLength(2);
    expect(w.of("task_opened")).toHaveLength(1);
  });

  it("a contract rejection (E_TASK_ALREADY_OPEN after a race) is final and not retried", async () => {
    const w = world([WASHER]);
    w.chain.setMetric(WASHER, "cycles", 30n);
    const original = w.chain.openUpkeepTask.bind(w.chain);
    let raced = false;
    w.chain.openUpkeepTask = async (a, r, text) => {
      if (!raced) {
        raced = true;
        await original(a, r, "opened by a council member in between"); // someone else wins the race
      }
      return original(a, r, text);
    };
    await w.agent.tick();
    expect(w.of("write_rejected")[0]!.data).toMatchObject({ method: "open_upkeep_task", code: "E_TASK_ALREADY_OPEN" });
    await w.agent.tick();
    expect(w.chain.tasksRaw(WASHER)).toHaveLength(1);
  });

  it("stale unclaimed tasks are annotated exactly once", async () => {
    const w = world([FRIDGE]);
    w.chain.advanceHours(168);
    await w.agent.tick();
    w.chain.advanceHours(71);
    await w.agent.tick();
    expect(w.calls("annotate_task")).toHaveLength(0);
    w.chain.advanceHours(1);
    await w.agent.tick();
    await w.agent.tick();
    const notes = w.calls("annotate_task");
    expect(notes).toHaveLength(1);
    expect(notes[0]!.args["note"]).toBe("Still open after 72 h (claim timeout 72 h); consider raising the reward through a DAO profile change.");
  });

  it("view failures skip the asset without any write", async () => {
    const w = world([PRINTER]);
    w.chain.setMetric(PRINTER, "jobs_total", 60n);
    w.chain.viewsDown = true;
    await w.agent.tick();
    expect(w.chain.calls).toHaveLength(0);
    expect(w.of("agent_error")).toHaveLength(1);
    w.chain.viewsDown = false;
    await w.agent.tick();
    expect(w.calls("open_upkeep_task")).toHaveLength(1);
  });
});

describe("quota and float awareness", () => {
  it("does not send a task that would exceed the period quota and says why once", async () => {
    const w = world([WASHER]);
    w.chain.setMetric(WASHER, "cycles", 30n); // filter_clean: 3 rights, quota 12
    w.chain.setPeriod(WASHER, { rightsMinted: 10 });
    await w.agent.tick();
    await w.agent.tick();
    expect(w.calls("open_upkeep_task")).toHaveLength(0);
    const waits = w.of("agent_waiting");
    expect(waits).toHaveLength(1);
    expect(waits[0]!.data).toMatchObject({ reason: "quota_reached", rule_id: "filter_clean", rights_committed: 10, reward_rights: 3, quota: 12 });
  });

  it("counts rights reserved by open tasks, and opens once the period rolls over", async () => {
    const w = world([WASHER]);
    w.chain.setPeriod(WASHER, { rightsMinted: 4, rightsReserved: 6 });
    w.chain.setMetric(WASHER, "cycles", 30n);
    await w.agent.tick();
    expect(w.calls("open_upkeep_task")).toHaveLength(0);
    w.chain.advanceHours(30 * 24);
    w.chain.setPeriod(WASHER, { rightsReserved: 0 });
    await w.agent.tick();
    expect(w.calls("open_upkeep_task").map((c) => c.args["rule_id"])).toEqual(["filter_clean"]);
  });

  it("a task within the quota still opens when another rule is waiting", async () => {
    const w = world([WASHER]);
    w.chain.setPeriod(WASHER, { rightsMinted: 10 });
    w.chain.setMetric(WASHER, "cycles", 40n); // filter_clean (3) blocked, detergent (1) fits
    await w.agent.tick();
    expect(w.calls("open_upkeep_task").map((c) => c.args["rule_id"])).toEqual(["detergent"]);
  });
});
