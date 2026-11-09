import { pino } from "pino";
import { describe, expect, it } from "vitest";
import { Bridge } from "../src/bridge.js";
import { FakeChainClient } from "../src/chain/fake.js";
import { parseConfig } from "../src/config.js";
import { GaugeTracker } from "../src/telemetry/gauges.js";
import { ManualClock } from "../src/util/clock.js";
import { FIXTURES, tempDir } from "./helpers/harness.js";

describe("GaugeTracker: gauges -> monotonic counters (D-410)", () => {
  it("samples_above / samples_below count samples past a limit", async () => {
    const t = new GaugeTracker("f.testnet", await tempDir(), {
      temperature_c: [
        { derive: "samples_above", limit: 8, counter: "temp_high_samples" },
        { derive: "samples_below", limit: 1, counter: "temp_low_samples" },
      ],
    });
    await t.load();
    for (const v of [4, 9, 12, 7, 0.5]) await t.sample({ temperature_c: v });
    expect(t.counters()).toEqual({ temp_high_samples: 2n, temp_low_samples: 1n });
  });

  it("decrease_sum adds drops (scaled), increase_count counts refills; persists across restart", async () => {
    const dir = await tempDir();
    const cfg = {
      fuel_level: [
        { derive: "decrease_sum" as const, counter: "fuel_used_dl", scale: 10 },
        { derive: "increase_count" as const, counter: "refills", min_step: 5 },
      ],
    };
    const a = new GaugeTracker("t.testnet", dir, cfg);
    await a.load();
    for (const v of [60, 52.5, 40, 80, 79]) await a.sample({ fuel_level: v });
    expect(a.counters()).toEqual({ fuel_used_dl: 210n, refills: 1n });
    const b = new GaugeTracker("t.testnet", dir, cfg);
    await b.load();
    expect(b.counters()).toEqual({ fuel_used_dl: 210n, refills: 1n });
    await b.sample({ fuel_level: 70 }); // continues from the persisted last value (79)
    expect(b.counters().fuel_used_dl).toBe(300n);
  });

  it("rejects non-finite device values (zod)", async () => {
    const t = new GaugeTracker("f.testnet", await tempDir(), {});
    await t.load();
    await expect(t.sample({ temperature_c: Number.NaN })).rejects.toThrow(/invalid gauges/);
  });
});

describe("community fridge end to end: raw gauge never reaches the chain", () => {
  it("reports temp_high_samples on chain, shows temperature_c only in events", async () => {
    const stateDir = await tempDir();
    const config = parseConfig(
      `
network: testnet
bridge_account: bridge-01.makerlab.testnet
chain: fake
state_dir: ${stateDir}
evidence_dir: ${await tempDir()}
assets:
  - asset_id: fridge-01.street.testnet
    adapter: simulator
    adapter_config: { scenario: scenarios/community_fridge.yaml }
    telemetry_interval_sec: 60
    gauges:
      temperature_c: [{ derive: samples_above, limit: 8, counter: temp_high_samples }]
`,
      FIXTURES,
      {},
    );
    const clock = new ManualClock();
    const chain = new FakeChainClient();
    const bridge = new Bridge({ config, chain, logger: pino({ level: "silent" }), clock, chainClockMaxAgeMs: 0 });
    await bridge.init();
    const id = "fridge-01.street.testnet";
    expect(await bridge.telemetry.tickOnce(id)).toBe("reported");
    clock.advance(120_000); // simulated 02:00: door left ajar, 12 C
    expect(await bridge.telemetry.tickOnce(id)).toBe("reported");
    clock.advance(60_000);
    await bridge.telemetry.tickOnce(id);
    const onChain = (await chain.getTelemetry(id)).metrics;
    expect(onChain).not.toHaveProperty("temperature_c");
    expect(onChain.temp_high_samples).toBe(2n);
    expect(onChain).toMatchObject({ uses: 140n, door_opens: 410n, simulated: 1n });
    const reported = bridge.bus.history().filter((e) => e.type === "telemetry_reported");
    expect((reported[1]?.data.gauges as Record<string, number>).temperature_c).toBeGreaterThan(8);
    expect(reported.every((e) => e.simulated)).toBe(true);
    await bridge.stop();
  });

  it("config rejects duplicate derived counter names", () => {
    expect(() =>
      parseConfig(
        `
network: testnet
bridge_account: b.testnet
assets:
  - asset_id: f.testnet
    adapter: simulator
    gauges:
      a_c: [{ derive: samples_above, limit: 1, counter: x }]
      b_c: [{ derive: samples_below, limit: 1, counter: x }]
`,
        "/x",
        {},
      ),
    ).toThrow(/unique/);
  });
});
