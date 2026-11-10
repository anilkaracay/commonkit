/**
 * pnpm --filter @commonkit/bridge emulate <device> [--port 7125] [--speed 60] [--api-key KEY] [--load lamp_60w]
 * Starts ONE emulated device (D-022). It is not a device: responses carry `x-commonkit-emulated`.
 */
import { parseArgs } from "node:util";
import { pino } from "pino";
import { z } from "zod";
import { ScaledClock } from "./common.js";
import { EMULATOR_KINDS, LOADS, createEmulator } from "./index.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: "string", default: "0" },
    host: { type: "string", default: "127.0.0.1" },
    speed: { type: "string", default: "1" },
    "api-key": { type: "string" },
    load: { type: "string" },
  },
});
const args = z
  .object({
    kind: z.enum(EMULATOR_KINDS),
    port: z.coerce.number().int().min(0).max(65535),
    host: z.string(),
    speed: z.coerce.number().positive().max(100_000),
    apiKey: z.string().optional(),
    load: z.enum(Object.keys(LOADS) as [string, ...string[]]).optional(),
  })
  .parse({ kind: positionals[0], port: values.port, host: values.host, speed: values.speed, apiKey: values["api-key"], load: values.load });

const logger = pino({ base: { service: "commonkit-emulator", emulated: true, simulated: true } });
const emu = createEmulator(
  { kind: args.kind, apiKey: args.apiKey ?? null, ...(args.load ? { load: args.load as keyof typeof LOADS } : {}) },
  { clock: new ScaledClock(args.speed), logger },
);
const address = await emu.app.listen({ port: args.port, host: args.host });
logger.warn({ device: args.kind, address, speed: args.speed }, `EMULATED ${args.kind} listening (not a real device)`);
