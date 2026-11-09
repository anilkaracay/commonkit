/**
 * SIMULATION ONLY. Drives the fake chain so `pnpm dev:agent` shows the whole loop without
 * testnet or a bridge: counters grow, time passes, open tasks get done by a simulated member.
 * Never used with the NEAR chain.
 */
import type { FakeAgentChain } from "./chain/fake.js";
import type { EventBus } from "./events.js";

export const SIM_MEMBER = "member.sim.testnet";

export async function driveFake(chain: FakeAgentChain, assetIds: readonly string[], bus: EventBus, hoursPerTick: number): Promise<void> {
  chain.advanceHours(hoursPerTick);
  for (const assetId of assetIds) {
    const profile = await chain.getProfile(assetId);
    for (const rule of profile.rules) {
      if (rule.trigger.type === "Metric") chain.addMetric(assetId, rule.trigger.metric, rule.trigger.threshold / 3n + 1n);
    }
    for (const t of chain.tasksRaw(assetId)) {
      if (t.status !== "Open") continue;
      if (chain.nowNs - t.createdAt < BigInt(hoursPerTick) * 2n * 3_600_000_000_000n) continue;
      chain.completeTask(assetId, t.id, SIM_MEMBER);
      bus.emit({
        type: "sim_task_completed",
        assetId,
        simulated: true,
        chainNs: chain.nowNs,
        data: { task_id: t.id, rule_id: t.ruleId, claimer: SIM_MEMBER, note: "simulated member completed and was approved (fake chain)" },
      });
    }
  }
}
