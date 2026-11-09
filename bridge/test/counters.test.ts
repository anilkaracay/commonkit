import { describe, expect, it } from "vitest";
import { CounterStore } from "../src/telemetry/counters.js";
import { tempDir } from "./helpers/harness.js";

describe("CounterStore (monotonic, persisted)", () => {
  it("passes increasing values through unchanged", async () => {
    const c = new CounterStore("a.testnet", await tempDir());
    await c.load();
    expect((await c.apply({ cycles: 1n })).metrics).toEqual({ cycles: 1n });
    expect((await c.apply({ cycles: 5n })).metrics).toEqual({ cycles: 5n });
  });

  it("a device reset raises an offset so the series never decreases", async () => {
    const c = new CounterStore("a.testnet", await tempDir());
    await c.load();
    await c.apply({ energy_wh: 1000n });
    const reset = await c.apply({ energy_wh: 10n });
    expect(reset.metrics.energy_wh).toBe(1000n);
    expect(reset.adjustments).toEqual([{ metric: "energy_wh", raw: 10n, previous: 1000n, newOffset: 990n }]);
    expect((await c.apply({ energy_wh: 15n })).metrics.energy_wh).toBe(1005n);
  });

  it("survives a restart (state file) including offsets and reported values", async () => {
    const dir = await tempDir();
    const a = new CounterStore("a.testnet", dir);
    await a.load();
    await a.apply({ cycles: 30n });
    await a.apply({ cycles: 2n }); // offset 28
    await a.markReported({ cycles: 30n });
    const b = new CounterStore("a.testnet", dir);
    await b.load();
    expect((await b.apply({ cycles: 3n })).metrics.cycles).toBe(31n);
    expect(b.differsFromReported({ cycles: 30n })).toBe(false);
    expect(b.differsFromReported({ cycles: 31n })).toBe(true);
  });

  it("seedFromChain: never starts below the on-chain value after local state loss", async () => {
    const c = new CounterStore("a.testnet", await tempDir());
    await c.load();
    await c.seedFromChain({ cycles: 40n });
    expect((await c.apply({ cycles: 27n })).metrics.cycles).toBe(40n);
    expect((await c.apply({ cycles: 28n })).metrics.cycles).toBe(41n);
  });

  it("rejects invalid adapter output (zod): negative, bad name, too many metrics", async () => {
    const c = new CounterStore("a.testnet", await tempDir());
    await c.load();
    await expect(c.apply({ cycles: -1n })).rejects.toThrow(/invalid metrics/);
    await expect(c.apply({ "Bad-Name": 1n })).rejects.toThrow(/invalid metrics/);
    const many = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`m${i}`, 1n]));
    await expect(c.apply(many)).rejects.toThrow(/invalid metrics/);
  });
});
