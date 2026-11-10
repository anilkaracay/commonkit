import type { AssetConfig } from "../config.js";
import type { Adapter, AdapterContext } from "./types.js";
import { ManualQrAdapter, manualQrConfigSchema } from "./manual_qr/manual_qr.js";
import { MoonrakerAdapter, moonrakerConfigSchema } from "./moonraker/moonraker.js";
import { OctoprintAdapter, octoprintConfigSchema } from "./octoprint/octoprint.js";
import { SimulatorAdapter, simulatorConfigSchema } from "./simulator/simulator.js";
import { SmartPlugAdapter, smartPlugConfigSchema } from "./smart_plug/smart_plug.js";
import { z } from "zod";

export type AdapterFactory = (config: AssetConfig, ctx: AdapterContext) => Adapter;

function parse<T>(schema: z.ZodType<T>, config: AssetConfig): T {
  const r = schema.safeParse(config.adapter_config);
  if (!r.success) throw new Error(`invalid ${config.adapter} adapter_config for ${config.asset_id}: ${z.prettifyError(r.error)}`);
  return r.data;
}

/** Every adapter kind passes test/adapter.contract.ts (simulator: scenarios; the rest: device emulators). */
const factories: Record<AssetConfig["adapter"], AdapterFactory> = {
  simulator: (c, ctx) => new SimulatorAdapter(parse(simulatorConfigSchema, c), ctx),
  moonraker: (c, ctx) => new MoonrakerAdapter(parse(moonrakerConfigSchema, c), ctx),
  octoprint: (c, ctx) => new OctoprintAdapter(parse(octoprintConfigSchema, c), ctx),
  smart_plug: (c, ctx) => new SmartPlugAdapter(parse(smartPlugConfigSchema, c), ctx),
  manual_qr: (c, ctx) => new ManualQrAdapter(parse(manualQrConfigSchema, c), ctx),
};

export function createAdapter(config: AssetConfig, ctx: AdapterContext): Adapter {
  return factories[config.adapter](config, ctx);
}
