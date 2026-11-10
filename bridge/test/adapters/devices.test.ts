import { readFileSync } from "node:fs";
import { pino } from "pino";
import { afterEach, describe, expect, it } from "vitest";
import { ManualQrAdapter, manualQrConfigSchema } from "../../src/adapters/manual_qr/manual_qr.js";
import { MoonrakerAdapter, moonrakerConfigSchema } from "../../src/adapters/moonraker/moonraker.js";
import { initialDetector, stepDetector, type DetectorConfig } from "../../src/adapters/smart_plug/cycles.js";
import { SmartPlugAdapter, smartPlugConfigSchema } from "../../src/adapters/smart_plug/smart_plug.js";
import { AdapterOfflineError, type SessionContext } from "../../src/adapters/types.js";
import { LOADS, createMoonrakerEmulator, createShellyGen2Emulator, type Emulator } from "../../src/emulators/index.js";
import { ManualClock } from "../../src/util/clock.js";
import { FIXTURES } from "../helpers/harness.js";
import { ctxFor } from "../helpers/devices.js";

const logger = pino({ level: "silent" });
const emus: Emulator[] = [];
afterEach(async () => {
  for (const e of emus.splice(0)) await e.app.close();
});
async function serve<E extends Emulator>(e: E): Promise<[E, string]> {
  emus.push(e);
  return [e, await e.app.listen({ port: 0, host: "127.0.0.1" })];
}
const faults = (url: string, f: Record<string, boolean>) =>
  fetch(`${url}/__emulator/faults`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
const session = (n: number): SessionContext => ({ sessionId: `s${n}`, assetId: "device-01.testnet", reservationId: BigInt(n), accountId: "alice.testnet", grantedAtChainNs: 0n });

function loadTrace(name: string): Array<{ t: number; w: number }> {
  return readFileSync(`${FIXTURES}traces/${name}.csv`, "utf8")
    .split("\n")
    .filter((l) => /^\d/.test(l))
    .map((l) => {
      const [t, w] = l.split(",").map(Number);
      return { t: t!, w: w! };
    });
}
function replay(name: string, cfg: Partial<DetectorConfig> = {}) {
  const c: DetectorConfig = { activeWatts: 5, minCycleSeconds: 600, idleGraceSeconds: 30, timeScale: 1, maxGapSec: 10, ...cfg };
  let s = initialDetector();
  const ends: number[] = [];
  for (const p of loadTrace(name)) {
    const r = stepDetector(s, c, { atMs: p.t * 1000, watts: p.w });
    s = r.state;
    if (r.cycleEnded) ends.push(Math.round(r.cycleEnded.seconds));
  }
  return { s, ends };
}

describe("cycle detection on synthetic power traces", () => {
  it("two wash cycles with pauses = 2 cycles; the 90 s kettle burst is not a cycle; run_seconds = active time", () => {
    const { s, ends } = replay("washer_two_cycles");
    expect(s.cycles).toBe(2);
    expect(ends).toHaveLength(2);
    for (const e of ends) expect(e).toBeGreaterThanOrEqual(2730);
    expect(s.runSeconds).toBeGreaterThanOrEqual(2 * 2700 + 90 - 10);
    expect(s.runSeconds).toBeLessThanOrEqual(2 * 2700 + 90 + 10);
  });

  it("without an idle grace period the wash pauses split the cycles (why the grace exists)", () => {
    expect(replay("washer_two_cycles", { idleGraceSeconds: 0 }).s.cycles).toBeGreaterThan(2);
  });

  it("a lamp session (laser stand-in) is one cycle with min 60 s; never counted with min 600 s + 1", () => {
    expect(replay("lamp_session", { minCycleSeconds: 60 }).s.cycles).toBe(1);
    expect(replay("lamp_session", { minCycleSeconds: 601 }).s.cycles).toBe(0);
    expect(replay("lamp_session").s.runSeconds).toBeCloseTo(600, -1);
  });

  it("a gap in samples (bridge or Wi-Fi down) is never counted as running time", () => {
    const c: DetectorConfig = { activeWatts: 5, minCycleSeconds: 60, idleGraceSeconds: 0, timeScale: 1, maxGapSec: 10 };
    let s = stepDetector(initialDetector(), c, { atMs: 0, watts: 100 }).state;
    s = stepDetector(s, c, { atMs: 2_000, watts: 100 }).state;
    s = stepDetector(s, c, { atMs: 600_000, watts: 100 }).state;
    expect(s.runSeconds).toBe(2);
  });
});

describe("moonraker adapter failure modes", () => {
  const setup = async () => {
    const clock = new ManualClock();
    const [emu, url] = await serve(createMoonrakerEmulator({ clock, logger, apiKey: "k", initialTotals: { total_filament_used: 318000 } }));
    const ctx = await ctxFor(clock, { MK: "k" });
    const a = new MoonrakerAdapter(moonrakerConfigSchema.parse({ base_url: url, api_key_env: "MK", default_job: "demo_cube.gcode" }), ctx);
    return { clock, emu, url, a, ctx };
  };

  it("wrong API key fails init with an authentication error", async () => {
    const { url, ctx } = await setup();
    const bad = new MoonrakerAdapter(moonrakerConfigSchema.parse({ base_url: url, api_key_env: "MK" }), { ...ctx, env: { MK: "wrong" } });
    await expect(bad.init()).rejects.toThrow(/authentication failed/);
  });

  it("filament_used_mm comes from /server/history/totals", async () => {
    const { a, clock } = await setup();
    await a.init();
    await a.unlock(session(1));
    clock.advance(1_201_000);
    expect(await a.sessionDone(session(1))).toBe(true);
    expect(await a.readMetrics()).toMatchObject({ filament_used_mm: 322000n, jobs_total: 1n, print_seconds: 1200n, nozzle_seconds: 1200n });
  });

  it("job error: session ends, jobs_failed counts once; a failing calibration print does not pass", async () => {
    const { a, url, clock } = await setup();
    await a.init();
    await faults(url, { job_error: true });
    await a.unlock(session(1));
    clock.advance(700_000);
    expect(await a.sessionDone(session(1))).toBe(true);
    expect(await a.sessionDone(session(1))).toBe(true);
    expect((await a.readMetrics()).jobs_failed).toBe(1n);
    await a.lock();
    await faults(url, { job_error: true });
    const v = await a.runVerification({ type: "calibration_print", file: "calibration_cube.gcode", max_minutes: 10 });
    expect(v.passed).toBe(false);
    expect(v.details.final_state).toBe("error");
  });

  it("locking while a print still runs (deadline passed) cancels it", async () => {
    const { a, emu, clock } = await setup();
    await a.init();
    await a.unlock(session(1));
    clock.advance(60_000);
    await a.lock();
    expect(emu.printer.job?.state).toBe("cancelled");
  });

  it("offline: status reports offline, metrics raise AdapterOfflineError", async () => {
    const { a, url } = await setup();
    await a.init();
    await faults(url, { offline: true });
    expect((await a.status()).online).toBe(false);
    await expect(a.readMetrics()).rejects.toBeInstanceOf(AdapterOfflineError);
  });
});

describe("smart_plug adapter specifics", () => {
  const setup = async (cfg: Record<string, unknown> = {}) => {
    const clock = new ManualClock();
    const [emu, url] = await serve(createShellyGen2Emulator({ clock, logger, load: LOADS.lamp_60w! }));
    const a = new SmartPlugAdapter(smartPlugConfigSchema.parse({ vendor: "shelly_gen2", base_url: url, auto_poll: false, ...cfg }), await ctxFor(clock));
    return { clock, emu, url, a };
  };

  it("a stuck relay is an error, never a silent lock", async () => {
    const { a, url } = await setup();
    await a.init();
    await a.unlock(session(1));
    await faults(url, { stuck: true });
    await expect(a.lock()).rejects.toThrow(/relay stuck/);
  });

  it("manual session end (laser stand-in): sessionDone stays false; holder or deadline ends it", async () => {
    const { a, clock } = await setup();
    await a.init();
    await a.unlock(session(1));
    for (let i = 0; i < 300; i++) {
      clock.advance(2_000); // the 2 s poll loop
      await a.pollOnce();
    }
    expect(await a.sessionDone(session(1))).toBe(false);
    await a.lock();
    // Left Riemann sum: the sample taken at unlock is still pre-power, so 300 samples give 598 s.
    expect(await a.readMetrics()).toMatchObject({ energy_wh: 10n, run_seconds: 598n, cycles: 0n });
  });

  it("optional temperature gauge (Gen2 only) per D-410", async () => {
    const off = await setup();
    await off.a.init();
    expect(await off.a.readGauges()).toEqual({});
    const on = await setup({ report_temperature: true });
    await on.a.init();
    expect(await on.a.readGauges()).toEqual({ temperature_c: 28 });
  });

  it("power_profile verification of the lamp stand-in: 40-80 W passes, 100-200 W fails", async () => {
    const { a } = await setup();
    await a.init();
    expect((await a.runVerification({ type: "power_profile", expect: { min_watts: 40, max_watts: 80, seconds: 30 } })).passed).toBe(true);
    const bad = await a.runVerification({ type: "power_profile", expect: { min_watts: 100, max_watts: 200, seconds: 30 } });
    expect(bad.passed).toBe(false);
    expect(bad.details).toMatchObject({ min_w: 60, max_w: 60 });
    expect((await a.status()).locked).toBe(true);
  });
});

describe("manual_qr adapter", () => {
  it("only a steward other than the holder confirms; the handover code must match; uses count on return", async () => {
    const a = new ManualQrAdapter(manualQrConfigSchema.parse({ code_length: 8 }), await ctxFor(new ManualClock()));
    await a.init();
    await a.unlock(session(1));
    const code = ((await a.sessionInfo(session(1))) as { manual_qr: { handover_code: string } }).manual_qr.handover_code;
    expect(code).toMatch(/^[A-Z2-7]{8}$/);
    await expect(a.confirm("s1", "handover", "alice.testnet", code)).rejects.toThrow(/holder/);
    await expect(a.confirm("s1", "handover", "steward.testnet", "WRONG123")).rejects.toThrow(/does not match/);
    await expect(a.confirm("s1", "return", "steward.testnet", null)).rejects.toThrow(/never handed over/);
    await a.confirm("s1", "handover", "steward.testnet", code);
    expect(await a.sessionDone(session(1))).toBe(false);
    await a.confirm("s1", "return", "steward.testnet", null);
    await a.confirm("s1", "return", "steward.testnet", null);
    expect(await a.sessionDone(session(1))).toBe(true);
    expect(await a.readMetrics()).toEqual({ uses: 1n });
  });
});
