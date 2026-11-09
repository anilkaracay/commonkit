import { readFile } from "node:fs/promises";
import { pino } from "pino";
import { describe, expect, it } from "vitest";
import { parseScenario } from "../../src/adapters/simulator/scenario.js";
import { SimulatorAdapter } from "../../src/adapters/simulator/simulator.js";
import { AdapterOfflineError, type SessionContext } from "../../src/adapters/types.js";
import { ManualClock } from "../../src/util/clock.js";
import { FIXTURES, tempDir } from "../helpers/harness.js";

const ctx = (n: number): SessionContext => ({
  sessionId: `s${n}`,
  assetId: "sim.testnet",
  reservationId: BigInt(n),
  accountId: "alice.testnet",
  grantedAtChainNs: 0n,
});

async function sim(scenario: string, stateDir?: string, clock = new ManualClock()) {
  const adapter = new SimulatorAdapter(
    { scenario: `scenarios/${scenario}.yaml` },
    { assetId: "sim.testnet", stateDir: stateDir ?? (await tempDir()), clock, logger: pino({ level: "silent" }), configDir: FIXTURES },
  );
  await adapter.init();
  return { adapter, clock };
}

/** Runs one session to completion; returns real ms it took. */
async function runSession(a: SimulatorAdapter, clock: ManualClock, n: number): Promise<number> {
  await a.unlock(ctx(n));
  let ms = 0;
  while (!(await a.sessionDone(ctx(n)))) {
    clock.advance(100);
    ms += 100;
  }
  await a.lock();
  return ms;
}

describe("simulator adapter", () => {
  it("is deterministic for a seed: same session durations and metrics on two runs", async () => {
    const a = await sim("washer");
    const b = await sim("washer");
    const da = [await runSession(a.adapter, a.clock, 1), await runSession(a.adapter, a.clock, 2)];
    const db = [await runSession(b.adapter, b.clock, 1), await runSession(b.adapter, b.clock, 2)];
    expect(da).toEqual(db);
    expect(await a.adapter.readMetrics()).toEqual(await b.adapter.readMetrics());
  });

  it("speed scales simulated time: a 45 min cycle at speed 60 takes ~45 real seconds (+/- jitter)", async () => {
    const { adapter, clock } = await sim("washer");
    const ms = await runSession(adapter, clock, 1);
    expect(ms).toBeGreaterThanOrEqual(40_500);
    expect(ms).toBeLessThanOrEqual(49_600);
  });

  it("step metrics count only completed sessions; linear metrics grow during the session", async () => {
    const { adapter, clock } = await sim("washer");
    const m0 = await adapter.readMetrics();
    expect(m0.cycles).toBe(27n);
    expect(m0.simulated).toBe(1n);
    await adapter.unlock(ctx(1));
    clock.advance(20_000);
    const mid = await adapter.readMetrics();
    expect(mid.cycles).toBe(27n);
    expect(mid.run_seconds! > m0.run_seconds!).toBe(true);
    // Locked early: partial run time counts, the cycle does not.
    await adapter.lock();
    const early = await adapter.readMetrics();
    expect(early.cycles).toBe(27n);
    await runSession(adapter, clock, 2);
    expect((await adapter.readMetrics()).cycles).toBe(28n);
  });

  it("session_error injection: 3rd print fails half-way, adds jobs_failed, no jobs_total", async () => {
    const { adapter, clock } = await sim("printer_3d");
    const full = await runSession(adapter, clock, 1);
    await runSession(adapter, clock, 2);
    const before = await adapter.readMetrics();
    const failed = await runSession(adapter, clock, 3);
    const after = await adapter.readMetrics();
    expect(failed).toBeLessThan(full);
    expect(after.jobs_total).toBe(before.jobs_total);
    expect(after.jobs_failed).toBe(before.jobs_failed! + 1n);
  });

  it("verification_fail injection fails run 2 only; hashes differ per run and are stable", async () => {
    const { adapter } = await sim("printer_3d");
    const r1 = await adapter.runVerification({ type: "simulated" });
    const r2 = await adapter.runVerification({ type: "simulated" });
    const r3 = await adapter.runVerification({ type: "simulated" });
    expect([r1.passed, r2.passed, r3.passed]).toEqual([true, false, true]);
    expect(new Set([r1.detailsHash, r2.detailsHash, r3.detailsHash]).size).toBe(3);
    expect(r1.details.simulated).toBe(true);
    const again = await sim("printer_3d");
    expect((await again.adapter.runVerification({ type: "simulated" })).detailsHash).toBe(r1.detailsHash);
  });

  it("offline window: status offline, readMetrics throws AdapterOfflineError, then recovers", async () => {
    const { adapter, clock } = await sim("washer");
    clock.advance((36_000 / 60) * 1000); // simulated 10:00 at speed 60
    expect((await adapter.status()).online).toBe(false);
    await expect(adapter.readMetrics()).rejects.toBeInstanceOf(AdapterOfflineError);
    await expect(adapter.unlock(ctx(1))).rejects.toBeInstanceOf(AdapterOfflineError);
    clock.advance((900 / 60) * 1000);
    expect((await adapter.status()).online).toBe(true);
    await adapter.readMetrics();
  });

  it("persists sessions across restart: a running session survives and is still unlocked", async () => {
    const stateDir = await tempDir();
    const clock = new ManualClock();
    const first = await sim("washer", stateDir, clock);
    await first.adapter.unlock(ctx(1));
    clock.advance(10_000);
    const second = await sim("washer", stateDir, clock);
    expect((await second.adapter.status()).locked).toBe(false);
    expect(await second.adapter.sessionDone(ctx(1))).toBe(false);
    while (!(await second.adapter.sessionDone(ctx(1)))) clock.advance(1000);
    await second.adapter.lock();
    expect((await second.adapter.readMetrics()).cycles).toBe(28n);
  });

  it("gauges: fridge warms with door openings, cools when idle, scenario spike, clamped", async () => {
    const { adapter, clock } = await sim("community_fridge");
    expect((await adapter.readGauges()).temperature_c).toBe(4);
    expect(await adapter.readMetrics()).not.toHaveProperty("temperature_c");
    await runSession(adapter, clock, 1);
    const warmer = (await adapter.readGauges()).temperature_c!;
    expect(warmer).toBeGreaterThan(4);
    clock.advance(60_000); // 1 simulated hour at speed 60: cools by 2 C, never below min 3
    expect((await adapter.readGauges()).temperature_c).toBeCloseTo(Math.max(3, warmer - 2), 1);
    clock.advance(((7200 - 3600) / 60) * 1000); // simulated 02:00 -> door left ajar
    expect((await adapter.readGauges()).temperature_c).toBeCloseTo(12, 0);
  });

  it("gauges: fuel drops per session and a passed verification restores the tank (verification.sets)", async () => {
    const { adapter, clock } = await sim("tractor");
    expect((await adapter.readGauges()).fuel_level).toBe(60);
    await runSession(adapter, clock, 1);
    await runSession(adapter, clock, 2);
    const low = (await adapter.readGauges()).fuel_level!;
    expect(low).toBeLessThan(30);
    const v = await adapter.runVerification({ type: "simulated" });
    expect(v.passed).toBe(true);
    expect(v.details.gauges_restored).toEqual({ fuel_level: 80 });
    expect((await adapter.readGauges()).fuel_level).toBe(80);
  });

  it("scenario validation: must be simulated, `simulated` metric name is reserved", async () => {
    const text = await readFile(`${FIXTURES}scenarios/washer.yaml`, "utf8");
    expect(() => parseScenario(text.replace("simulated: true", "simulated: false"), "x.yaml")).toThrow(/simulated/);
    expect(() => parseScenario(text.replace("cycles:", "simulated:"), "x.yaml")).toThrow(/metrics\.simulated/);
    const fridge = await readFile(`${FIXTURES}scenarios/community_fridge.yaml`, "utf8");
    expect(() => parseScenario(fridge.replace("metric: temperature_c", "metric: uses"), "x.yaml")).toThrow(/not a gauge/);
    expect(() => parseScenario(fridge.replace("initial: 4,", "initial: 40,"), "x.yaml")).toThrow(/min <= initial <= max/);
    expect(() => parseScenario(JSON.stringify({ scenario: "x", simulated: true, seed: 1, metrics: {}, session: { duration_sec: 1 } }), "x.json")).toThrow(
      /at least one metric/,
    );
  });
});
