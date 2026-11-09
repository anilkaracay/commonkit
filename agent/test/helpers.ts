import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Agent, type AgentAsset } from "../src/agent.js";
import { FakeAgentChain } from "../src/chain/fake.js";
import { loadProfileFile } from "../src/config.js";
import { EventBus, type AgentEvent } from "../src/events.js";
import { AgentMemory } from "../src/memory.js";
import { templateOnly, type Rephraser } from "../src/rationale/llm.js";

export const PROFILES = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../profiles");
export const AGENT = "agent-01.makerlab.testnet";
export const PRINTER = "printer-01.makerlab.testnet";
export const WASHER = "washer-01.dorm-b.testnet";
export const FRIDGE = "fridge-01.dorm-b.testnet";
export const BIKE = "bike-01.street.testnet";

const FILES: Record<string, string> = {
  [PRINTER]: "printer_3d.json",
  [WASHER]: "washer.json",
  [FRIDGE]: "community_fridge.json",
  [BIKE]: "cargo_bike.json",
};

export function profile(assetId: string) {
  return loadProfileFile(resolve(PROFILES, FILES[assetId]!));
}

export interface World {
  chain: FakeAgentChain;
  bus: EventBus;
  events: AgentEvent[];
  memory: AgentMemory;
  agent: Agent;
  assets: AgentAsset[];
  clockMs: { now: number };
  of(type: string): AgentEvent[];
  calls(method: string): FakeAgentChain["calls"];
}

export function world(
  assetIds: string[] = [PRINTER],
  opts: { rephraser?: Rephraser; policyCached?: boolean; simulated?: boolean; supplierIsTeamAccount?: boolean } = {},
): World {
  const chain = new FakeAgentChain(AGENT);
  const events: AgentEvent[] = [];
  const bus = new EventBus(null, null);
  bus.subscribe((e) => events.push(e));
  const memory = new AgentMemory(null);
  const clockMs = { now: 1_000_000 };
  const assets: AgentAsset[] = assetIds.map((id) => {
    const p = profile(id);
    chain.addAsset(id, { profileJson: p.profileJson, policyCached: opts.policyCached ?? true });
    return {
      assetId: id,
      alias: id.split("-")[0]!.toUpperCase(),
      simulated: opts.simulated ?? false,
      purchaseHints: p.purchaseHints,
      supplierIsTeamAccount: opts.supplierIsTeamAccount ?? false,
    };
  });
  const agent = new Agent({
    chain,
    assets,
    bus,
    rephraser: opts.rephraser ?? templateOnly,
    memory,
    syncEveryMs: 60_000,
    nowMs: () => clockMs.now,
  });
  return {
    chain,
    bus,
    events,
    memory,
    agent,
    assets,
    clockMs,
    of: (type) => events.filter((e) => e.type === type),
    calls: (method) => chain.calls.filter((c) => c.method === method),
  };
}
