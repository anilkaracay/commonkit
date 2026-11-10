import { pino } from "pino";
import { ManualQrAdapter } from "../../src/adapters/manual_qr/manual_qr.js";
import { MoonrakerAdapter, moonrakerConfigSchema } from "../../src/adapters/moonraker/moonraker.js";
import { OctoprintAdapter, octoprintConfigSchema } from "../../src/adapters/octoprint/octoprint.js";
import { SmartPlugAdapter, smartPlugConfigSchema } from "../../src/adapters/smart_plug/smart_plug.js";
import type { SessionContext } from "../../src/adapters/types.js";
import {
  LOADS,
  createMoonrakerEmulator,
  createOctoprintEmulator,
  createShellyGen1Emulator,
  createShellyGen2Emulator,
  createTasmotaEmulator,
  type Emulator,
} from "../../src/emulators/index.js";
import { ManualClock } from "../../src/util/clock.js";
import { describeAdapterContract } from "../adapter.contract.js";
import { ctxFor } from "../helpers/devices.js";

/**
 * Every production adapter against its API-faithful emulator (D-022). Emulator and adapter share one
 * ManualClock, so adapter sleeps move emulated time deterministically.
 */
const logger = pino({ level: "silent" });

export async function serve(e: Emulator): Promise<string> {
  return e.app.listen({ port: 0, host: "127.0.0.1" });
}

/** Advances emulated time in steps until the adapter reports the session done (bounded). */
const until = (clock: ManualClock, stepMs: number) => async (a: { sessionDone(s: SessionContext): Promise<boolean> }, s: SessionContext) => {
  for (let i = 0; i < 5_000 && !(await a.sessionDone(s)); i++) clock.advance(stepMs);
};

describeAdapterContract("moonraker (vs Moonraker emulator)", async () => {
  const clock = new ManualClock();
  const emu = createMoonrakerEmulator({ clock, logger, apiKey: "secret-key", initialTotals: { total_jobs: 12, total_print_time: 600, total_filament_used: 318000 } });
  const url = await serve(emu);
  const ctx = await ctxFor(clock, { MOONRAKER_API_KEY: "secret-key" });
  const make = () => new MoonrakerAdapter(moonrakerConfigSchema.parse({ base_url: url, api_key_env: "MOONRAKER_API_KEY", default_job: "demo_cube.gcode" }), ctx);
  const adapter = make();
  return {
    adapter,
    completeSession: (s) => until(clock, 30_000)(adapter, s),
    restart: async () => make(),
    verificationTest: { type: "calibration_print", file: "calibration_cube.gcode", max_minutes: 10 },
    dispose: () => emu.app.close(),
  };
});

describeAdapterContract("octoprint (vs OctoPrint emulator)", async () => {
  const clock = new ManualClock();
  const emu = createOctoprintEmulator({ clock, logger, apiKey: "op-key" });
  const url = await serve(emu);
  const ctx = await ctxFor(clock, { OCTOPRINT_API_KEY: "op-key" });
  const make = () => new OctoprintAdapter(octoprintConfigSchema.parse({ base_url: url, api_key_env: "OCTOPRINT_API_KEY", default_job: "demo_cube.gcode" }), ctx);
  const adapter = make();
  return {
    adapter,
    completeSession: (s) => until(clock, 30_000)(adapter, s),
    restart: async () => make(),
    verificationTest: { type: "calibration_print", file: "calibration_cube.gcode", max_minutes: 10 },
    dispose: () => emu.app.close(),
  };
});

const plugVendors = [
  ["shelly_gen2", createShellyGen2Emulator],
  ["shelly_gen1", createShellyGen1Emulator],
  ["tasmota", createTasmotaEmulator],
] as const;

for (const [vendor, create] of plugVendors) {
  describeAdapterContract(`smart_plug ${vendor} (vs emulator, washer cycle load)`, async () => {
    const clock = new ManualClock();
    const emu = create({ clock, logger, load: LOADS.washer_cycle! });
    const url = await serve(emu);
    const ctx = await ctxFor(clock);
    const make = () =>
      new SmartPlugAdapter(smartPlugConfigSchema.parse({ vendor, base_url: url, session_end: "cycle", auto_poll: false, min_cycle_seconds: 600 }), ctx);
    const adapter = make();
    return {
      adapter,
      completeSession: (s) => until(clock, 10_000)(adapter, s),
      restart: async () => make(),
      verificationTest: { type: "power_profile", expect: { min_watts: 1500, max_watts: 2500, seconds: 60 } },
      dispose: () => emu.app.close(),
    };
  });
}

describeAdapterContract("manual_qr (steward-confirmed handover and return)", async () => {
  const clock = new ManualClock();
  const ctx = await ctxFor(clock);
  const make = () => new ManualQrAdapter({ code_length: 8 }, ctx);
  const adapter = make();
  return {
    adapter,
    completeSession: async (s) => {
      const info = (await adapter.sessionInfo(s)) as { manual_qr: { handover_code: string } };
      await adapter.confirm(s.sessionId, "handover", "steward.testnet", info.manual_qr.handover_code);
      await adapter.confirm(s.sessionId, "return", "steward.testnet", null);
    },
    restart: async () => make(),
    verificationTest: null,
  };
});
