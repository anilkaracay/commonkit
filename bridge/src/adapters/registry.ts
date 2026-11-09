import type { AssetConfig } from "../config.js";
import type { Adapter, AdapterContext } from "./types.js";
import { SimulatorAdapter, simulatorConfigSchema } from "./simulator/simulator.js";

export type AdapterFactory = (config: AssetConfig, ctx: AdapterContext) => Adapter;

/**
 * Adapter kinds built in this release. moonraker, octoprint, smart_plug and manual_qr
 * plug in here (Wave 3); until then configuring them fails at startup instead of pretending.
 */
const factories: Partial<Record<AssetConfig["adapter"], AdapterFactory>> = {
  simulator: (config, ctx) => {
    const parsed = simulatorConfigSchema.safeParse(config.adapter_config);
    if (!parsed.success) throw new Error(`invalid simulator adapter_config for ${config.asset_id}: ${parsed.error.message}`);
    return new SimulatorAdapter(parsed.data, ctx);
  },
};

export function createAdapter(config: AssetConfig, ctx: AdapterContext): Adapter {
  const factory = factories[config.adapter];
  if (!factory) throw new Error(`adapter "${config.adapter}" is not implemented in this build`);
  return factory(config, ctx);
}
