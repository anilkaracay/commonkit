/**
 * Agent service: `tsx src/main.ts --config <file>`.
 * chain: fake → in-memory chain seeded from the profiles (everything labelled simulated).
 * chain: near → testnet views; writes need the function-call key signer (wired after M2).
 */
import { resolve } from "node:path";
import { NearRpc } from "@commonkit/sdk";
import { Agent } from "./agent.js";
import { FakeAgentChain } from "./chain/fake.js";
import { NearAgentChain } from "./chain/near.js";
import type { AgentChain } from "./chain/types.js";
import { loadConfig } from "./config.js";
import { EventBus, EvidenceLog } from "./events.js";
import { createAgentServer } from "./http.js";
import { AgentMemory } from "./memory.js";
import { NearAiRephraser, llmConfigFromEnv, templateOnly, type Rephraser } from "./rationale/llm.js";
import { driveFake } from "./sim.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const { config, baseDir, assets } = loadConfig(arg("--config") ?? "config.yaml");
  const bus = new EventBus(undefined, new EvidenceLog(resolve(baseDir, config.evidence_dir)));
  const memory = new AgentMemory(resolve(baseDir, config.state_dir, `${config.agent_account}.${config.chain}.memory.json`));

  let chain: AgentChain;
  let fake: FakeAgentChain | null = null;
  if (config.chain === "fake") {
    fake = new FakeAgentChain(config.agent_account);
    for (const a of assets) fake.addAsset(a.assetId, { profileJson: a.profileJson, policyCached: true });
    chain = fake;
  } else {
    // ADAPTER: the function-call key signer (AGENT_KEY_<ALIAS>) is injected here after M2.
    chain = new NearAgentChain(new NearRpc(config.rpc_url), config.agent_account, null);
  }

  let rephraser: Rephraser = templateOnly;
  const llm = config.llm.enabled ? llmConfigFromEnv() : null;
  if (llm) {
    const r = new NearAiRephraser(llm);
    const check = await r.checkModel();
    if (check.ok) rephraser = r;
    bus.emit({ type: "llm_status", assetId: null, simulated: false, data: { enabled: check.ok, model: llm.model, reason: check.reason ?? null } });
  } else {
    bus.emit({ type: "llm_status", assetId: null, simulated: false, data: { enabled: false, reason: config.llm.enabled ? "NEARAI_API_KEY or NEARAI_MODEL missing" : "disabled in config" } });
  }

  const agent = new Agent({
    chain,
    assets: assets.map((a) => ({
      assetId: a.assetId,
      alias: a.alias,
      simulated: a.simulated,
      purchaseHints: a.purchaseHints,
      supplierIsTeamAccount: a.supplierIsTeamAccount,
    })),
    bus,
    rephraser,
    memory,
    syncEveryMs: config.sync_every_seconds * 1000,
  });

  const server = createAgentServer({
    bus,
    corsOrigins: config.cors_origins,
    health: () => ({
      ok: true,
      network: config.network,
      agent_account: config.agent_account,
      chain: chain.kind,
      llm: rephraser.enabled,
      held_writes: memory.heldKeys(),
      assets: assets.map((a) => ({ asset_id: a.assetId, simulated: a.simulated || chain.kind === "fake" })),
    }),
  });
  server.listen(config.listen.port, config.listen.host);

  bus.emit({
    type: "agent_started",
    assetId: null,
    simulated: chain.kind === "fake",
    data: { agent_account: config.agent_account, chain: chain.kind, poll_seconds: config.poll_seconds, assets: assets.map((a) => a.assetId) },
  });

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  const loop = async (): Promise<void> => {
    if (fake && config.fake.drive) await driveFake(fake, assets.map((a) => a.assetId), bus, config.fake.hours_per_tick);
    await agent.tick();
    if (!stopped) timer = setTimeout(() => void loop(), config.poll_seconds * 1000);
  };
  const stop = async (): Promise<void> => {
    stopped = true;
    if (timer) clearTimeout(timer);
    server.close();
    await bus.flush();
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
  await loop();
}

main().catch((err: unknown) => {
  process.stderr.write(`agent failed to start: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
