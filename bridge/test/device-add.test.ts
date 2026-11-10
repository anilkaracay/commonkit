import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { pino } from "pino";
import { parse as parseYaml } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { deviceAdd, deviceAddArgsSchema, type DeviceAddIo } from "../src/cli/device-add.js";
import { parseConfig } from "../src/config.js";
import { createShellyGen1Emulator, createShellyGen2Emulator, createTasmotaEmulator, type Emulator } from "../src/emulators/index.js";
import { ManualClock } from "../src/util/clock.js";
import { tempDir } from "./helpers/harness.js";

const logger = pino({ level: "silent" });
const closers: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const c of closers.splice(0)) await c();
});

async function emulator<E extends Emulator>(e: E): Promise<{ e: E; host: string }> {
  const url = await e.app.listen({ port: 0, host: "127.0.0.1" });
  closers.push(() => e.app.close());
  return { e, host: new URL(url).host };
}

function io(answers: string[] = []): DeviceAddIo & { lines: string[]; prompts: string[] } {
  const lines: string[] = [];
  const prompts: string[] = [];
  return {
    lines,
    prompts,
    print: (l) => lines.push(l),
    prompt: async (q) => {
      prompts.push(q);
      return answers.shift() ?? "";
    },
    env: {},
    clock: new ManualClock(),
  };
}

const args = (o: Record<string, unknown>) => deviceAddArgsSchema.parse({ adapter: "smart_plug", vendor: "shelly_gen2", asset: "laser-01.makerlab.testnet", ...o });

describe("device:add against emulators", () => {
  it("connection test only (no stand-in): reads the plug, never switches it, writes a config entry", async () => {
    const { e, host } = await emulator(createShellyGen2Emulator({ clock: new ManualClock(), logger }));
    const config = join(await tempDir(), "config.yaml");
    const out = io();
    const r = await deviceAdd(args({ host, config }), out);
    expect(r).toMatchObject({ ok: true, emulated: true, toggle: "skipped_no_stand_in", configWritten: true });
    expect(e.plug.on).toBe(false);
    expect(out.lines.join("\n")).toMatch(/EMULATED device/);
    const yaml = parseYaml(await readFile(config, "utf8")) as { assets: Array<Record<string, unknown>> };
    expect(yaml.assets[0]).toMatchObject({
      asset_id: "laser-01.makerlab.testnet",
      adapter: "smart_plug",
      emulated_device: true,
      adapter_config: { vendor: "shelly_gen2", base_url: `http://${host}`, session_end: "manual", report_temperature: true },
    });
  });

  it("with --confirm-stand-in and --yes on an EMULATOR: safety notice, OFF -> ON -> OFF, stand-in in config", async () => {
    const clock = new ManualClock();
    const { e, host } = await emulator(createShellyGen2Emulator({ clock, logger }));
    const config = join(await tempDir(), "config.yaml");
    const out = { ...io(), clock }; // one clock: the 3 s ON phase is emulated time too
    const r = await deviceAdd(args({ host, config, standIn: "desk lamp (stand-in for the laser cutter)", yes: true, dangerous: true }), out);
    expect(r).toMatchObject({ ok: true, toggle: "ok" });
    expect(r.toggleDetail).toMatch(/ON drew 60 W/);
    expect(out.prompts).toHaveLength(0);
    expect(out.lines.join("\n")).toMatch(/SAFETY NOTICE/);
    expect(e.plug.on).toBe(false);
    expect(e.plug.totalWh()).toBeGreaterThan(0);
    const cfg = parseConfig(await readFile(config, "utf8"), "/x", { BRIDGE_ACCOUNT_ID: "bridge.testnet" });
    expect(cfg.assets[0]?.safety).toMatchObject({ dangerous: true, stand_in: "desk lamp (stand-in for the laser cutter)" });
  });

  it("Shelly Gen1 and Tasmota work the same way", async () => {
    for (const [vendor, make] of [["shelly_gen1", createShellyGen1Emulator], ["tasmota", createTasmotaEmulator]] as const) {
      const { e, host } = await emulator(make({ clock: new ManualClock(), logger }));
      const r = await deviceAdd(args({ vendor, host, config: join(await tempDir(), "c.yaml"), standIn: "kettle (stand-in)", yes: true }), io());
      expect(r, vendor).toMatchObject({ ok: true, toggle: "ok" });
      expect(e.plug.on).toBe(false);
    }
  });

  it("a stuck relay fails the toggle test and writes nothing", async () => {
    const { host } = await emulator(createShellyGen2Emulator({ clock: new ManualClock(), logger }));
    await fetch(`http://${host}/__emulator/faults`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stuck: true }) });
    const r = await deviceAdd(args({ host, config: join(await tempDir(), "c.yaml"), standIn: "lamp", yes: true }), io());
    expect(r).toMatchObject({ ok: false, toggle: "failed", configWritten: false });
    expect(r.toggleDetail).toMatch(/did not follow/);
  });

  it("offline device: connection test fails, nothing else happens", async () => {
    const { host } = await emulator(createShellyGen2Emulator({ clock: new ManualClock(), logger }));
    await fetch(`http://${host}/__emulator/faults`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offline: true }) });
    const out = io();
    const r = await deviceAdd(args({ host, config: join(await tempDir(), "c.yaml"), standIn: "lamp", yes: true }), out);
    expect(r).toMatchObject({ ok: false, reading: null, configWritten: false });
    expect(out.lines.join("\n")).toMatch(/Connection test FAILED/);
  });

  it("updates an existing entry in place and keeps the rest of the config (comments included)", async () => {
    const { host } = await emulator(createShellyGen2Emulator({ clock: new ManualClock(), logger }));
    const config = join(await tempDir(), "config.yaml");
    await writeFile(
      config,
      "# my bridge\nnetwork: testnet\nbridge_account: bridge.testnet\nassets:\n  - asset_id: washer-01.testnet # keep me\n    adapter: simulator\n  - asset_id: laser-01.makerlab.testnet\n    adapter: manual_qr\n",
    );
    await deviceAdd(args({ host, config }), io());
    const text = await readFile(config, "utf8");
    expect(text).toMatch(/# my bridge/);
    expect(text).toMatch(/# keep me/);
    const cfg = parseYaml(text) as { assets: Array<{ asset_id: string; adapter: string }> };
    expect(cfg.assets.map((a) => [a.asset_id, a.adapter])).toEqual([
      ["washer-01.testnet", "simulator"],
      ["laser-01.makerlab.testnet", "smart_plug"],
    ]);
  });
});

describe("device:add on a NON-emulated plug (header-less fake, stands in for real hardware)", () => {
  /** Minimal Shelly Gen2 API without the emulator header: device:add must treat it as real. */
  async function realLikeShelly(): Promise<{ app: FastifyInstance; host: string; state: { on: boolean; everOn: boolean } }> {
    const state = { on: false, everOn: false };
    const app = Fastify();
    app.get("/rpc/Switch.Set", async (req) => {
      const was = state.on;
      state.on = (req.query as { on: string }).on === "true";
      state.everOn ||= state.on;
      return { was_on: was };
    });
    app.get("/rpc/Switch.GetStatus", async () => ({ id: 0, output: state.on, apower: state.on ? 40 : 0, aenergy: { total: 1 }, temperature: { tC: 30 } }));
    const url = await app.listen({ port: 0, host: "127.0.0.1" });
    closers.push(() => app.close());
    return { app, host: new URL(url).host, state };
  }

  it("--yes is ignored: the human must type YES; anything else and the plug is never switched on", async () => {
    const dev = await realLikeShelly();
    const out = io(["yes please"]);
    const r = await deviceAdd(args({ host: dev.host, config: join(await tempDir(), "c.yaml"), standIn: "desk lamp", yes: true }), out);
    expect(r).toMatchObject({ emulated: false, toggle: "declined" });
    expect(out.prompts).toHaveLength(1);
    expect(out.lines.join("\n")).toMatch(/--yes is ignored for a real device/);
    expect(dev.state.everOn).toBe(false);
    const yaml = parseYaml(await readFile(r.configPath, "utf8")) as { assets: Array<Record<string, unknown>> };
    expect(yaml.assets[0]).not.toHaveProperty("emulated_device");
  });

  it("typed YES toggles once and leaves it off; without --confirm-stand-in nothing is ever switched", async () => {
    const dev = await realLikeShelly();
    expect((await deviceAdd(args({ host: dev.host, config: join(await tempDir(), "c.yaml") }), io(["YES"]))).toggle).toBe("skipped_no_stand_in");
    expect(dev.state.everOn).toBe(false);
    const r = await deviceAdd(args({ host: dev.host, config: join(await tempDir(), "c.yaml"), standIn: "desk lamp" }), io(["YES"]));
    expect(r.toggle).toBe("ok");
    expect(dev.state.everOn).toBe(true);
    expect(dev.state.on).toBe(false);
  });
});
