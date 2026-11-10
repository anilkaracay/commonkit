/**
 * Writes test/fixtures/traces/*.csv: SYNTHETIC power traces (no hardware exists, D-022), sampled every
 * 2 s with seeded noise. They model what a plug sees: dips during wash pauses, a short kettle burst,
 * standby draw. `pnpm --filter @commonkit/bridge exec tsx test/gen-power-traces.ts` regenerates them.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let seed = 1914;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

type Seg = [watts: number, seconds: number];
function trace(name: string, note: string, segs: Seg[]): void {
  const lines = [`# SYNTHETIC power trace (generated, not recorded from hardware): ${note}`, "t_sec,watts"];
  let t = 0;
  for (const [w, s] of segs) {
    for (let i = 0; i < s; i += 2, t += 2) {
      const noise = w > 5 ? (rnd() - 0.5) * w * 0.06 : rnd() * 0.4;
      lines.push(`${t},${Math.max(0, Math.round((w + noise) * 10) / 10)}`);
    }
  }
  writeFileSync(fileURLToPath(new URL(`./fixtures/traces/${name}.csv`, import.meta.url)), lines.join("\n") + "\n");
}

const wash: Seg[] = [[2100, 600], [3, 16], [2050, 300], [400, 900], [2.5, 20], [380, 600], [600, 300]];
trace("washer_two_cycles", "two wash cycles with short pauses, standby between, then a 90 s kettle burst", [
  [1.5, 120], ...wash, [1.5, 300], ...wash, [1.5, 200], [1800, 90], [1.5, 120],
]);
trace("lamp_session", "60 W lamp (laser stand-in) on for 10 min", [[0, 60], [60, 600], [0, 60]]);
