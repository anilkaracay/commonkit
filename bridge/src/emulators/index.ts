import type { Emulator, EmulatorOptions } from "./common.js";
import { createMoonrakerEmulator } from "./moonraker.js";
import { createOctoprintEmulator } from "./octoprint.js";
import { LOADS, type Load } from "./plug-core.js";
import { createShellyGen1Emulator, createShellyGen2Emulator, createTasmotaEmulator } from "./plugs.js";

export { EMULATED_HEADER, ScaledClock, type Emulator, type EmuClock } from "./common.js";
export { createMoonrakerEmulator } from "./moonraker.js";
export { createOctoprintEmulator } from "./octoprint.js";
export { createShellyGen1Emulator, createShellyGen2Emulator, createTasmotaEmulator } from "./plugs.js";
export { LOADS, PlugCore, type Load } from "./plug-core.js";
export { PrinterCore, parseGcodeMeta } from "./printer-core.js";

export const EMULATOR_KINDS = ["moonraker", "octoprint", "shelly-gen2", "shelly-gen1", "tasmota"] as const;
export type EmulatorKind = (typeof EMULATOR_KINDS)[number];

export interface EmulatorSpec {
  kind: EmulatorKind;
  apiKey?: string | null;
  load?: keyof typeof LOADS;
  initialTotals?: { total_jobs?: number; total_print_time?: number; total_filament_used?: number };
  initialWh?: number;
}

export function createEmulator(spec: EmulatorSpec, o: EmulatorOptions): Emulator {
  const load = spec.load ? (LOADS[spec.load] as Load) : undefined;
  switch (spec.kind) {
    case "moonraker":
      return createMoonrakerEmulator({ ...o, apiKey: spec.apiKey ?? null, ...(spec.initialTotals ? { initialTotals: spec.initialTotals } : {}) });
    case "octoprint":
      return createOctoprintEmulator({ ...o, apiKey: spec.apiKey ?? null });
    case "shelly-gen2":
      return createShellyGen2Emulator({ ...o, ...(load ? { load } : {}), ...(spec.initialWh ? { initialWh: spec.initialWh } : {}) });
    case "shelly-gen1":
      return createShellyGen1Emulator({ ...o, ...(load ? { load } : {}), ...(spec.initialWh ? { initialWh: spec.initialWh } : {}) });
    case "tasmota":
      return createTasmotaEmulator({ ...o, ...(load ? { load } : {}), ...(spec.initialWh ? { initialWh: spec.initialWh } : {}) });
  }
}
