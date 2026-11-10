import { z } from "zod";
import { createEmulatorApp, type Emulator, type EmulatorOptions } from "./common.js";
import { LOADS, PlugCore, VOLTAGE, plugFaultsSchema, type Load, type PlugFaults } from "./plug-core.js";

export interface PlugEmulatorOptions extends EmulatorOptions {
  load?: Load;
  initialWh?: number;
  /** Tasmota user/password query params, Shelly Gen1 basic auth (null = no auth, the device default). */
  credentials?: { user: string; password: string } | null;
}

type PlugEmulator = Emulator & { plug: PlugCore; faults: PlugFaults };

function setup(device: string, o: PlugEmulatorOptions) {
  const faults: PlugFaults = plugFaultsSchema.parse({});
  const plug = new PlugCore(o.clock, o.load ?? (LOADS.lamp_60w as Load), faults, o.initialWh ?? 0);
  const snapshot = () => ({ load: plug.load.name, on: plug.on, watts: plug.watts(), total_wh: plug.totalWh() });
  const app = createEmulatorApp(device, o.logger, faults, plugFaultsSchema.partial(), snapshot);
  return { faults, plug, snapshot, app };
}

const bool = z.enum(["true", "false"]).transform((v) => v === "true");

/**
 * Shelly Gen2/Gen3 RPC over HTTP GET (research E7):
 *   /rpc/Switch.Set?id=0&on=true -> {"was_on": false}
 *   /rpc/Switch.GetStatus?id=0   -> {id, source, output, apower, voltage, current, aenergy{total Wh, by_minute mWh, minute_ts}, temperature{tC,tF}}
 */
export function createShellyGen2Emulator(o: PlugEmulatorOptions): PlugEmulator {
  const { faults, plug, snapshot, app } = setup("shelly-gen2", o);
  let lastMinute = { ts: Math.floor(o.clock.now() / 60_000) * 60, wh: plug.totalWh() };

  app.get("/rpc/Switch.Set", async (req, reply) => {
    const q = z.object({ id: z.coerce.number().int(), on: bool }).safeParse(req.query);
    if (!q.success || q.data.id !== 0) return reply.status(400).send({ code: -103, message: "Invalid argument" });
    return { was_on: plug.set(q.data.on) };
  });

  app.get("/rpc/Switch.GetStatus", async (req, reply) => {
    const q = z.object({ id: z.coerce.number().int() }).safeParse(req.query);
    if (!q.success || q.data.id !== 0) return reply.status(400).send({ code: -103, message: "Invalid argument" });
    const minuteTs = Math.floor(o.clock.now() / 60_000) * 60;
    if (minuteTs !== lastMinute.ts) lastMinute = { ts: minuteTs, wh: plug.totalWh() };
    const tC = plug.temperatureC();
    return {
      id: 0,
      source: "http",
      output: plug.on,
      apower: Math.round(plug.watts() * 10) / 10,
      voltage: VOLTAGE,
      current: plug.current(),
      aenergy: {
        total: Math.round(plug.totalWh() * 1000) / 1000,
        by_minute: [Math.round((plug.totalWh() - lastMinute.wh) * 1000), 0, 0],
        minute_ts: minuteTs,
      },
      temperature: { tC, tF: Math.round(((tC * 9) / 5 + 32) * 10) / 10 },
    };
  });

  return { device: "shelly-gen2", app, snapshot, plug, faults };
}

/**
 * Shelly Gen1 (research E8, best effort): /relay/0[?turn=on|off], /meter/0 (power W, total watt-minutes).
 */
export function createShellyGen1Emulator(o: PlugEmulatorOptions): PlugEmulator {
  const { faults, plug, snapshot, app } = setup("shelly-gen1", o);
  const expected = o.credentials ? `Basic ${Buffer.from(`${o.credentials.user}:${o.credentials.password}`).toString("base64")}` : null;
  app.addHook("preHandler", async (req, reply) => {
    if (req.url.startsWith("/__emulator")) return;
    if (expected && req.headers.authorization !== expected) return reply.status(401).send("401 Unauthorized");
  });
  const relay = () => ({
    ison: plug.on,
    has_timer: false,
    timer_started: 0,
    timer_duration: 0,
    timer_remaining: 0,
    overpower: false,
    source: "http",
  });
  app.get("/relay/0", async (req, reply) => {
    const q = z.object({ turn: z.enum(["on", "off", "toggle"]).optional() }).safeParse(req.query);
    if (!q.success) return reply.status(400).send("Bad turn!");
    if (q.data.turn) plug.set(q.data.turn === "toggle" ? !plug.on : q.data.turn === "on");
    return relay();
  });
  app.get("/meter/0", async () => ({
    power: Math.round(plug.watts() * 100) / 100,
    overpower: 0,
    is_valid: true,
    timestamp: Math.floor(o.clock.now() / 1000),
    counters: [0, 0, 0],
    total: Math.floor(plug.totalWh() * 60), // watt-minutes
  }));
  return { device: "shelly-gen1", app, snapshot, plug, faults };
}

/**
 * Tasmota (research E9): /cm?cmnd=Power%20On|Off|(query) -> {"POWER":"ON"}; /cm?cmnd=Status%208 -> StatusSNS.ENERGY (Total kWh).
 */
export function createTasmotaEmulator(o: PlugEmulatorOptions): PlugEmulator {
  const { faults, plug, snapshot, app } = setup("tasmota", o);
  const start = new Date(o.clock.now()).toISOString().slice(0, 19);
  app.get("/cm", async (req, reply) => {
    const q = z.object({ cmnd: z.string().min(1), user: z.string().optional(), password: z.string().optional() }).safeParse(req.query);
    if (!q.success) return reply.status(400).send({ Command: "Unknown" });
    if (o.credentials && (q.data.user !== o.credentials.user || q.data.password !== o.credentials.password)) {
      return reply.status(401).send({ WARNING: "Need user=<username>&password=<password>" });
    }
    const cmd = q.data.cmnd.trim().replace(/\s+/g, " ").toLowerCase();
    if (cmd === "power" || cmd === "power1") return { POWER: plug.on ? "ON" : "OFF" };
    const m = /^power1? (on|off|1|0|toggle|2)$/.exec(cmd);
    if (m?.[1]) {
      const v = m[1];
      plug.set(v === "toggle" || v === "2" ? !plug.on : v === "on" || v === "1");
      return { POWER: plug.on ? "ON" : "OFF" };
    }
    if (cmd === "status 8" || cmd === "status 10") {
      const w = Math.round(plug.watts());
      const kwh = Math.round(plug.totalWh()) / 1000;
      return {
        StatusSNS: {
          Time: new Date(o.clock.now()).toISOString().slice(0, 19),
          ENERGY: {
            TotalStartTime: start,
            Total: kwh,
            Yesterday: 0,
            Today: kwh,
            Power: w,
            ApparentPower: w,
            ReactivePower: 0,
            Factor: w > 0 ? 1 : 0,
            Voltage: VOLTAGE,
            Current: plug.current(),
          },
        },
      };
    }
    return { Command: "Unknown" };
  });
  return { device: "tasmota", app, snapshot, plug, faults };
}
