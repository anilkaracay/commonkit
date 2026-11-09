import { describe, expect, it } from "vitest";
import { parseConfig, substituteEnv } from "../src/config.js";

const base = (asset: string) => `
network: testnet
bridge_account: bridge-01.makerlab.testnet
assets:
${asset}`;

describe("bridge config", () => {
  it("substitutes env vars, with defaults, and fails on unset vars", () => {
    expect(substituteEnv("a=${X} b=${Y:-dflt}", { X: "1" })).toBe("a=1 b=dflt");
    expect(() => substituteEnv("${MISSING}", {})).toThrow(/MISSING/);
  });

  it("applies defaults and resolves dirs against the config directory", () => {
    const c = parseConfig(base("  - { asset_id: washer-01.testnet, adapter: simulator }"), "/srv/bridge");
    expect(c.chain).toBe("near");
    expect(c.challenge_ttl_sec).toBe(300);
    expect(c.state_dir).toBe("/srv/bridge/state");
    expect(c.assets[0]?.telemetry_interval_sec).toBe(60);
  });

  it("safety: a dangerous real device needs a labelled stand-in or an explicit presence confirmation", () => {
    const danger = "  - { asset_id: laser-01.testnet, adapter: smart_plug, safety: { dangerous: true } }";
    expect(() => parseConfig(base(danger), "/x")).toThrow(/dangerous device/);
    const standIn = "  - { asset_id: laser-01.testnet, adapter: smart_plug, safety: { dangerous: true, stand_in: 'desk lamp (stand-in)' } }";
    expect(parseConfig(base(standIn), "/x").assets[0]?.safety.stand_in).toBe("desk lamp (stand-in)");
    const sim = "  - { asset_id: laser-01.testnet, adapter: simulator, safety: { dangerous: true } }";
    expect(() => parseConfig(base(sim), "/x")).not.toThrow();
  });

  it("rejects mainnet, bad account ids, duplicate assets and unknown adapters", () => {
    expect(() => parseConfig(base("  - { asset_id: a.testnet, adapter: simulator }").replace("testnet\n", "mainnet\n"), "/x")).toThrow();
    expect(() => parseConfig(base("  - { asset_id: Not_Valid!, adapter: simulator }"), "/x")).toThrow();
    expect(() =>
      parseConfig(base("  - { asset_id: a.testnet, adapter: simulator }\n  - { asset_id: a.testnet, adapter: simulator }"), "/x"),
    ).toThrow(/duplicate/);
    expect(() => parseConfig(base("  - { asset_id: a.testnet, adapter: toaster }"), "/x")).toThrow();
  });
});
