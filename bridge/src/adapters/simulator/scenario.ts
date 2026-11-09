import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { MAX_METRICS, MAX_METRIC_NAME } from "../types.js";

/**
 * Simulator scenario file (YAML or JSON). See bridge/README.md "Scenario format".
 *
 * Metric value at simulated time t:
 *   initial
 *   + floor(idle_per_hour * t / 3600)
 *   + sum over finished sessions of their contribution
 *   + partial contribution of the running session (linear curves only)
 */
const metricNameSchema = z
  .string()
  .min(1)
  .max(MAX_METRIC_NAME)
  .regex(/^[a-z][a-z0-9_]*$/, "metric names are snake_case")
  .refine((n) => n !== "simulated", "`simulated` is reserved for the simulation label");

const nonNegInt = z.number().int().nonnegative();

const metricCurveSchema = z.object({
  /** Counter value when the simulated device is first started. */
  initial: nonNegInt.default(0),
  /** Amount one complete session adds. */
  per_session: nonNegInt.default(0),
  /** linear: grows during the session; step: added once when the session completes. */
  curve: z.enum(["linear", "step"]).default("linear"),
  /** Background growth per simulated hour (e.g. standby energy). */
  idle_per_hour: nonNegInt.default(0),
});

const failureSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("session_error"),
    /** 1-based index of the session that fails. */
    session: z.number().int().positive(),
    /** Fraction of the session completed when the error happens. */
    at_fraction: z.number().gt(0).lt(1).default(0.5),
    /** Counters added when the error happens (e.g. jobs_failed: 1). */
    add: z.record(metricNameSchema, nonNegInt).default({}),
  }),
  z.object({
    kind: z.literal("verification_fail"),
    /** 1-based index of the verification run that fails. */
    run: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("offline"),
    /** Simulated seconds since the simulator was first started. */
    from_sec: nonNegInt,
    until_sec: z.number().int().positive(),
  }),
]);

export const scenarioSchema = z
  .object({
    scenario: z.string().min(1).max(64),
    description: z.string().max(500).optional(),
    /** Must be true: a scenario can never describe a real device. */
    simulated: z.literal(true),
    seed: z.number().int().nonnegative(),
    /** Simulated seconds per real second. */
    speed: z.number().positive().max(100_000).default(1),
    metrics: z.record(metricNameSchema, metricCurveSchema),
    session: z.object({
      duration_sec: z.number().int().positive(),
      /** Deterministic +/- jitter on duration, from the seed. */
      jitter_pct: z.number().min(0).max(90).default(0),
    }),
    verification: z
      .object({
        duration_sec: z.number().int().positive().default(60),
        default: z.enum(["pass", "fail"]).default("pass"),
      })
      .default({ duration_sec: 60, default: "pass" }),
    failures: z.array(failureSchema).default([]),
  })
  .superRefine((s, ctx) => {
    const names = Object.keys(s.metrics);
    if (names.length === 0) ctx.addIssue({ code: "custom", message: "at least one metric is required" });
    // +1 for the `simulated` label metric added to every report.
    if (names.length + 1 > MAX_METRICS) {
      ctx.addIssue({ code: "custom", message: `at most ${MAX_METRICS - 1} metrics (one slot is the simulated label)` });
    }
    for (const f of s.failures) {
      if (f.kind === "offline" && f.until_sec <= f.from_sec) {
        ctx.addIssue({ code: "custom", message: "offline.until_sec must be > from_sec" });
      }
      if (f.kind === "session_error") {
        for (const m of Object.keys(f.add)) {
          if (!(m in s.metrics)) ctx.addIssue({ code: "custom", message: `failure adds unknown metric ${m}` });
        }
      }
    }
  });

export type Scenario = z.infer<typeof scenarioSchema>;
export type ScenarioFailure = Scenario["failures"][number];

export function parseScenario(text: string, source: string): Scenario {
  const data: unknown = source.endsWith(".json") ? JSON.parse(text) : parseYaml(text);
  const parsed = scenarioSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`invalid scenario ${source}: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export async function loadScenario(path: string): Promise<Scenario> {
  return parseScenario(await readFile(path, "utf8"), path);
}
