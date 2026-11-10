import { fileURLToPath } from "node:url";
import { pino } from "pino";
import type { AdapterContext } from "../../src/adapters/types.js";
import type { ManualClock } from "../../src/util/clock.js";
import { tempDir } from "./harness.js";

export const GCODE_DIR = fileURLToPath(new URL("../../gcode/", import.meta.url));

export async function ctxFor(clock: ManualClock, env: NodeJS.ProcessEnv = {}): Promise<AdapterContext> {
  return { assetId: "device-01.testnet", stateDir: await tempDir(), clock, logger: pino({ level: "silent" }), configDir: GCODE_DIR, env };
}
