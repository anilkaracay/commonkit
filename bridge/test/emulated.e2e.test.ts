import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Bridge } from "../src/bridge.js";
import { FakeChainClient } from "../src/chain/fake.js";
import { loadConfig, parseConfig } from "../src/config.js";
import { startEmulators, type EmulatedDevices } from "../src/emulated-stack.js";
import { buildServer } from "../src/http/server.js";
import { ManualClock } from "../src/util/clock.js";
import { MEMBER_SEED, STRANGER_SEED } from "./nep413-cases.js";
import { captureLogger, tempDir } from "./helpers/harness.js";
import { publicKeyOf, signedPost } from "./helpers/sign.js";

const BRIDGE_DIR = fileURLToPath(new URL("../", import.meta.url));
const PRINTER = "printer-01.makerlab.commonkit-sxflo.testnet";
const LASER = "laser-01.makerlab.commonkit-sxflo.testnet";
const ALICE = "alice.testnet";
const STEWARD = "sam.testnet";

describe("emulated stack (config.emulated.yaml): real adapters -> device emulators, fake chain", () => {
  let devices: EmulatedDevices;
  let bridge: Bridge;
  let app: FastifyInstance;
  let chain: FakeChainClient;
  let clock: ManualClock;
  let lines: Array<Record<string, unknown>>;
  const advance = (ms: number) => {
    clock.advance(ms);
    chain.advanceMs(ms);
  };

  beforeEach(async () => {
    clock = new ManualClock();
    const cap = captureLogger();
    lines = cap.lines;
    devices = await startEmulators({ clock, logger: cap.logger.child({ emulated: true, simulated: true }), moonrakerPort: 0, shellyPort: 0, speed: 1 });
    const env = { ...devices.env, EMU_SPEED: "1" };
    const config = { ...(await loadConfig(`${BRIDGE_DIR}config.emulated.yaml`, env)), state_dir: await tempDir(), evidence_dir: await tempDir() };
    // Adapters poll on demand here (one shared manual clock), not on their own timers.
    for (const a of config.assets) if (a.adapter === "smart_plug") a.adapter_config.auto_poll = false;
    chain = new FakeChainClient();
    bridge = new Bridge({ config, chain, logger: cap.logger, clock, env, retry: { attempts: 2, baseDelayMs: 10 }, chainClockMaxAgeMs: 0 });
    await bridge.init();
    app = await buildServer(bridge);
    const now = await chain.getChainTime();
    chain.addAccessKey(ALICE, publicKeyOf(MEMBER_SEED));
    for (const [asset, id] of [[PRINTER, 1n], [LASER, 2n]] as const) {
      chain.addReservation(asset, { id, holder: ALICE, status: "Confirmed", windowStart: now - 60_000_000_000n, windowEnd: now + 900_000_000_000n });
    }
  });
  afterEach(async () => {
    await app.close();
    await bridge.stop();
    await devices.close();
  });

  const access = (asset: string, reservation: string) =>
    signedPost(app, "/access", { asset_id: asset, reservation_id: reservation, account_id: ALICE }, MEMBER_SEED);

  it("printer: access uploads and prints the job on emulated Moonraker; the finish reports filament from history totals", async () => {
    const res = await access(PRINTER, "1");
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ ok: true, simulated: true });
    const m = devices.moonraker as unknown as { printer: { job: { state: string; filename: string } | null } };
    expect(m.printer.job).toMatchObject({ state: "printing", filename: "demo_cube.gcode" });
    advance(10 * 60_000);
    await bridge.sessions.pollOnce();
    expect(bridge.sessions.get(res.body.session_id as string)?.status).toBe("active");
    advance(10 * 60_000 + 1_000);
    await bridge.sessions.pollOnce();
    const s = bridge.sessions.get(res.body.session_id as string)!;
    expect(s.status).toBe("finished");
    expect(s.finishReason).toBe("device_done");
    const tel = (await chain.getTelemetry(PRINTER)).metrics;
    expect(tel).toMatchObject({ jobs_total: 13n, filament_used_mm: 322_000n, print_seconds: 15_600n, simulated: 1n });

    // Upkeep verification: calibration print on the emulated printer, reported on chain.
    chain.addTask(PRINTER, { id: 7n, ruleId: "nozzle_clean", status: "Submitted", claimer: ALICE });
    const run = await signedPost(app, `/verification/${PRINTER}/7/run`, { asset_id: PRINTER, task_id: "7", account_id: ALICE, action: "verify" }, MEMBER_SEED);
    expect(run.statusCode, JSON.stringify(run.body)).toBe(202);
    const done = await bridge.verification.wait(run.body.run_id as string);
    expect(done.status).toBe("reported");
    expect(done.outcome?.passed).toBe(true);
    expect(done.outcome?.details).toMatchObject({ adapter: "moonraker", final_state: "complete", file: "calibration_cube.gcode" });
    expect(chain.task(PRINTER, 7n)?.verification?.detailsHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("laser stand-in: plug switches the emulated lamp load, energy and run time are measured, the holder ends it", async () => {
    const res = await access(LASER, "2");
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    const plug = (devices.shelly as unknown as { plug: { on: boolean } }).plug;
    expect(plug.on).toBe(true);
    const unlocked = bridge.bus.history().find((e) => e.type === "device_unlocked" && e.asset_id === LASER);
    expect(unlocked?.data.stand_in).toMatch(/stand-in for the laser cutter/);
    for (let i = 0; i < 300; i++) {
      advance(2_000);
      await bridge.telemetry.tickOnce(LASER);
    }
    const fin = await signedPost(app, `/sessions/${res.body.session_id}/finish`, { asset_id: LASER, reservation_id: "2", account_id: ALICE, action: "finish" }, MEMBER_SEED);
    expect(fin.statusCode, JSON.stringify(fin.body)).toBe(200);
    expect(plug.on).toBe(false);
    const tel = (await chain.getTelemetry(LASER)).metrics;
    expect(tel.energy_wh).toBe(10n);
    expect(tel.run_seconds! >= 596n && tel.run_seconds! <= 600n).toBe(true);
    expect(tel.simulated).toBe(1n);
  });

  it("everything is labelled: bridge_started says emulated, all events simulated, emulator logs emulated", async () => {
    await access(PRINTER, "1");
    const started = bridge.bus.history().find((e) => e.type === "bridge_started")!;
    const assets = started.data.assets as Array<{ asset_id: string; device: string; simulated: boolean }>;
    expect(assets.map((a) => [a.asset_id.split(".")[0], a.device, a.simulated])).toEqual([
      ["printer-01", "emulated", true],
      ["laser-01", "emulated", true],
      ["washer-01", "simulator", true],
      ["fridge-01", "simulator", true],
    ]);
    expect(bridge.bus.history().every((e) => e.simulated)).toBe(true);
    const emuLines = lines.filter((l) => l.device === "moonraker");
    expect(emuLines.length).toBeGreaterThan(0);
    expect(emuLines.every((l) => l.emulated === true && l.simulated === true)).toBe(true);
  });
});

describe("manual_qr through the bridge: steward-confirmed handover and return", () => {
  const ITEM = "ladder-01.tools.testnet";
  let bridge: Bridge;
  let app: FastifyInstance;
  let chain: FakeChainClient;

  beforeEach(async () => {
    const config = parseConfig(
      `
network: testnet
bridge_account: bridge.testnet
chain: fake
state_dir: ${await tempDir()}
evidence_dir: ${await tempDir()}
assets:
  - { asset_id: ${ITEM}, adapter: manual_qr, emulated_device: true }
`,
      "/tmp",
      {},
    );
    chain = new FakeChainClient();
    bridge = new Bridge({ config, chain, logger: captureLogger().logger, clock: new ManualClock(), chainClockMaxAgeMs: 0 });
    await bridge.init();
    app = await buildServer(bridge);
    const now = await chain.getChainTime();
    chain.addAccessKey(ALICE, publicKeyOf(MEMBER_SEED));
    chain.addAccessKey(STEWARD, publicKeyOf(STRANGER_SEED));
    chain.setRoles(ITEM, STEWARD, ["steward"]);
    chain.addReservation(ITEM, { id: 4n, holder: ALICE, status: "Confirmed", windowStart: now - 1n, windowEnd: now + 900_000_000_000n });
  });
  afterEach(async () => {
    await app.close();
    await bridge.stop();
  });

  it("holder gets a code; only a steward (role on chain, not the holder) confirms; return ends the session", async () => {
    const res = await signedPost(app, "/access", { asset_id: ITEM, reservation_id: "4", account_id: ALICE }, MEMBER_SEED);
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    const code = (res.body.device as { manual_qr: { handover_code: string } }).manual_qr.handover_code;
    const sid = res.body.session_id as string;
    const confirm = (account: string, seed: Uint8Array, step: string, extra: Record<string, unknown> = {}) =>
      signedPost(app, `/manual/${ITEM}/${sid}/confirm`, { asset_id: ITEM, reservation_id: "4", account_id: account, action: "confirm", step, ...extra }, seed);
    expect((await confirm(ALICE, MEMBER_SEED, "handover", { code })).body).toMatchObject({ reason: "NOT_STEWARD" });
    expect((await confirm(STEWARD, STRANGER_SEED, "handover", { code: "WRONG000" })).body).toMatchObject({ reason: "CONFIRM_REFUSED" });
    expect((await confirm(STEWARD, STRANGER_SEED, "handover", { code })).body).toMatchObject({ ok: true, step: "handover" });
    expect((await confirm(STEWARD, STRANGER_SEED, "return")).body).toMatchObject({ ok: true, step: "return" });
    await bridge.sessions.pollOnce();
    expect(bridge.sessions.get(sid)?.status).toBe("finished");
    expect((await chain.getTelemetry(ITEM)).metrics).toMatchObject({ uses: 1n, simulated: 1n });
  });
});
