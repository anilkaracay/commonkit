import { z } from "zod";
import { deviceJson } from "../http.js";

export interface PlugReading {
  on: boolean;
  watts: number;
  /** Cumulative energy reported by the device, Wh. */
  energyWh: number;
  temperatureC: number | null;
}

/** Vendor-specific HTTP calls (research E7-E9). Every response is zod-validated. */
export interface PlugDriver {
  set(on: boolean): Promise<void>;
  read(): Promise<PlugReading>;
}

export interface DriverOptions {
  baseUrl: string;
  channel: number;
  credentials: { user: string; password: string } | null;
}

const u = (o: DriverOptions, path: string) => new URL(path, o.baseUrl).toString();

/** Shelly Gen2/Gen3: /rpc/Switch.Set, /rpc/Switch.GetStatus (aenergy.total in Wh). */
export function shellyGen2(o: DriverOptions): PlugDriver {
  const status = z.object({
    output: z.boolean(),
    apower: z.number(),
    aenergy: z.object({ total: z.number().nonnegative() }),
    temperature: z.object({ tC: z.number().nullable() }).optional(),
  });
  return {
    async set(on) {
      await deviceJson(u(o, `/rpc/Switch.Set?id=${o.channel}&on=${on}`), z.object({ was_on: z.boolean() }));
    },
    async read() {
      const s = await deviceJson(u(o, `/rpc/Switch.GetStatus?id=${o.channel}`), status);
      return { on: s.output, watts: s.apower, energyWh: s.aenergy.total, temperatureC: s.temperature?.tC ?? null };
    },
  };
}

/** Shelly Gen1: /relay/N, /meter/N (total in watt-minutes), optional basic auth. */
export function shellyGen1(o: DriverOptions): PlugDriver {
  const headers: Record<string, string> = o.credentials
    ? { authorization: `Basic ${Buffer.from(`${o.credentials.user}:${o.credentials.password}`).toString("base64")}` }
    : {};
  const relay = z.object({ ison: z.boolean() });
  const meter = z.object({ power: z.number(), total: z.number().nonnegative() });
  return {
    async set(on) {
      await deviceJson(u(o, `/relay/${o.channel}?turn=${on ? "on" : "off"}`), relay, { headers });
    },
    async read() {
      const r = await deviceJson(u(o, `/relay/${o.channel}`), relay, { headers });
      const m = await deviceJson(u(o, `/meter/${o.channel}`), meter, { headers });
      return { on: r.ison, watts: m.power, energyWh: m.total / 60, temperatureC: null };
    },
  };
}

/** Tasmota: /cm?cmnd=Power..., Status 8 -> StatusSNS.ENERGY.Total (kWh); user/password query params. */
export function tasmota(o: DriverOptions): PlugDriver {
  const auth = o.credentials ? `&user=${encodeURIComponent(o.credentials.user)}&password=${encodeURIComponent(o.credentials.password)}` : "";
  const relayName = `Power${o.channel + 1}`;
  const cm = (c: string) => u(o, `/cm?cmnd=${encodeURIComponent(c)}${auth}`);
  const power = z.record(z.string(), z.unknown()).transform((r, ctx) => {
    const v = r[relayName.toUpperCase()] ?? r.POWER;
    if (v !== "ON" && v !== "OFF") {
      ctx.addIssue({ code: "custom", message: "missing POWER" });
      return z.NEVER;
    }
    return v === "ON";
  });
  const energy = z.object({ StatusSNS: z.object({ ENERGY: z.object({ Total: z.number().nonnegative(), Power: z.number() }) }) });
  return {
    async set(on) {
      await deviceJson(cm(`${relayName} ${on ? "On" : "Off"}`), power);
    },
    async read() {
      const on = await deviceJson(cm(relayName), power);
      const e = await deviceJson(cm("Status 8"), energy);
      return { on, watts: e.StatusSNS.ENERGY.Power, energyWh: e.StatusSNS.ENERGY.Total * 1000, temperatureC: null };
    },
  };
}
