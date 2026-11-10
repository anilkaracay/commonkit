import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { parseScenario } from "../src/adapters/simulator/scenario.js";
import { gaugesConfigSchema } from "../src/telemetry/gauges.js";

/** scripts/simulate.sh scenarios (D-420): the bridge's own schemas accept every one of them. */
const DIR = fileURLToPath(new URL("../../scenarios/", import.meta.url));

describe("scenarios/<asset_type>.yaml", () => {
  it("one scenario per profile, each valid for the simulator and labelled simulated", async () => {
    const files = (await readdir(DIR)).filter((f) => f.endsWith(".yaml")).sort();
    const profiles = (await readdir(fileURLToPath(new URL("../../profiles/", import.meta.url)))).filter((f) => f.endsWith(".json") && f !== "profile.schema.json");
    expect(files.map((f) => f.replace(".yaml", ""))).toEqual(profiles.map((f) => f.replace(".json", "")).sort());
    for (const f of files) {
      const text = await readFile(DIR + f, "utf8");
      expect(text.split("\n")[0], f).toMatch(/^# SIMULATION\./);
      const s = parseScenario(text, f);
      expect(s.simulated).toBe(true);
      expect(s.scenario).toBe(f.replace(".yaml", ""));
      const sim = (parseYaml(text) as { simulate?: { gauges?: unknown } }).simulate;
      expect(sim, f).toBeDefined();
      if (sim?.gauges) {
        const g = gaugesConfigSchema.parse(sim.gauges);
        for (const gauge of Object.keys(g)) expect(s.metrics[gauge]?.type, `${f}: ${gauge}`).toBe("gauge");
      }
    }
  });
});
