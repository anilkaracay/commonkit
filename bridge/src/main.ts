import { parseArgs } from "node:util";
import { NearRpc } from "@commonkit/sdk";
import { pino } from "pino";
import { Bridge } from "./bridge.js";
import { FakeChainClient } from "./chain/fake.js";
import { NearChainClient } from "./chain/near.js";
import type { ChainClient } from "./chain/types.js";
import { loadConfig } from "./config.js";
import { buildServer } from "./http/server.js";

const { values } = parseArgs({ options: { config: { type: "string", default: process.env.BRIDGE_CONFIG ?? "config.yaml" } } });

const config = await loadConfig(values.config);
// With the fake chain everything is simulated, so every log line (HTTP included) carries the label.
// With the real chain, lines about a simulated asset carry it through the per-asset child logger.
const logger = pino({
  base: {
    service: "commonkit-bridge",
    network: config.network,
    chain: config.chain,
    ...(config.chain === "fake" ? { simulated: true } : {}),
  },
});

let chain: ChainClient;
if (config.chain === "fake") {
  logger.warn("using the in-memory FAKE chain: nothing is written to NEAR; every event is labelled simulated");
  chain = new FakeChainClient(BigInt(Date.now()) * 1_000_000n);
} else {
  // Reads work today; writes need the bridge signer (function-call keys), which is not wired yet.
  chain = new NearChainClient(new NearRpc(config.rpc_url));
}

const bridge = new Bridge({ config, chain, logger });
await bridge.init();
const app = await buildServer(bridge);
await app.listen({ host: config.listen.host, port: config.listen.port });
bridge.start();

const shutdown = async (signal: string) => {
  logger.info({ signal }, "shutting down");
  await app.close();
  await bridge.stop();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
