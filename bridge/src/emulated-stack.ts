/**
 * One command for the whole EMULATED stack (D-022):
 *   pnpm --filter @commonkit/bridge dev:emulated [--speed 60] [--config config.emulated.yaml]
 * Starts the Moonraker and Shelly Gen2 emulators (lamp-class load), then the bridge with
 * config.emulated.yaml. Nothing here is hardware; every event says simulated, every emulator
 * response carries `x-commonkit-emulated`.
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { NearRpc } from "@commonkit/sdk";
import { pino, type Logger } from "pino";
import { Bridge } from "./bridge.js";
import { FakeChainClient } from "./chain/fake.js";
import { NearChainClient } from "./chain/near.js";
import { NearSignerTxSigner, resolveSigners } from "./chain/signer.js";
import type { ChainClient } from "./chain/types.js";
import { loadConfig } from "./config.js";
import { ScaledClock, createMoonrakerEmulator, createShellyGen2Emulator, type Emulator, type EmuClock } from "./emulators/index.js";
import { LOADS } from "./emulators/plug-core.js";
import { buildServer } from "./http/server.js";
import { systemClock } from "./util/clock.js";

export interface EmulatedDevices {
  moonraker: Emulator;
  shelly: Emulator;
  env: Record<string, string>;
  close(): Promise<void>;
}

/** Starts the device emulators and returns the env the emulated config expects. */
export async function startEmulators(o: { clock: EmuClock; logger: Logger; moonrakerPort?: number; shellyPort?: number; speed: number }): Promise<EmulatedDevices> {
  const apiKey = randomBytes(16).toString("hex");
  const moonraker = createMoonrakerEmulator({
    clock: o.clock,
    logger: o.logger,
    apiKey,
    // A used printer: 12 jobs, 318 m of a 330 m spool (the filament Restock rule is close).
    initialTotals: { total_jobs: 12, total_print_time: 14_400, total_filament_used: 318_000 },
  });
  const shelly = createShellyGen2Emulator({ clock: o.clock, logger: o.logger, load: LOADS.lamp_60w! });
  const mUrl = await moonraker.app.listen({ port: o.moonrakerPort ?? 7125, host: "127.0.0.1" });
  const sUrl = await shelly.app.listen({ port: o.shellyPort ?? 18081, host: "127.0.0.1" });
  return {
    moonraker,
    shelly,
    env: { EMU_MOONRAKER_URL: mUrl, EMU_MOONRAKER_API_KEY: apiKey, EMU_SHELLY_URL: sUrl, EMU_SPEED: String(o.speed) },
    close: async () => {
      await moonraker.app.close();
      await shelly.app.close();
    },
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      speed: { type: "string", default: "60" },
      config: { type: "string", default: "config.emulated.yaml" },
      // 0 = any free port (scripts/simulate runs next to a dev stack without collisions).
      "moonraker-port": { type: "string", default: "7125" },
      "shelly-port": { type: "string", default: "18081" },
    },
  });
  const speed = Number(values.speed);
  const logger = pino({ base: { service: "commonkit-emulated-stack", simulated: true } });
  const devices = await startEmulators({
    clock: new ScaledClock(speed),
    logger: logger.child({ emulated: true }),
    speed,
    moonrakerPort: Number(values["moonraker-port"]),
    shellyPort: Number(values["shelly-port"]),
  });
  const env = { ...process.env, ...devices.env };
  const config = await loadConfig(values.config, env);
  let chain: ChainClient;
  if (config.chain === "fake") {
    chain = new FakeChainClient(BigInt(Date.now()) * 1_000_000n);
  } else {
    const { signers, report } = await resolveSigners({ bridgeAccount: config.bridge_account, assets: config.assets, deploymentsPath: config.signer.deployments, env, signerOptions: { rpcUrls: [config.rpc_url] } });
    for (const r of report) logger.info({ asset_id: r.assetId, signer: r.source, public_key: r.publicKey }, "bridge signer");
    const tx = new Map([...signers].map(([a, s]) => [a, new NearSignerTxSigner(s, { clock: systemClock })]));
    chain = new NearChainClient(new NearRpc(config.rpc_url), (a) => tx.get(a) ?? null);
  }
  const bridge = new Bridge({ config, chain, logger, env });
  await bridge.init();
  const app = await buildServer(bridge);
  const url = await app.listen({ host: config.listen.host, port: config.listen.port });
  bridge.start();
  logger.warn(
    { bridge: url, moonraker: devices.env.EMU_MOONRAKER_URL, shelly: devices.env.EMU_SHELLY_URL, speed, chain: config.chain },
    "EMULATED stack up: SIMULATED assets, emulated devices, no hardware",
  );
  const stop = async () => {
    await app.close();
    await bridge.stop();
    await devices.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
