import { z } from "zod";

/**
 * Pure power-trace interpretation (BRIDGE §4.3), so it can be tested against recorded traces.
 *   run_seconds: time spent above `activeWatts` (left Riemann sum between samples; gaps longer
 *                than maxGapSec are not counted, so an offline period never becomes "running")
 *   cycles:      active -> idle transitions where the active phase lasted >= minCycleSeconds; an
 *                idle dip shorter than idleGraceSeconds (pause between wash and spin) does not end it
 */
export interface DetectorConfig {
  activeWatts: number;
  minCycleSeconds: number;
  idleGraceSeconds: number;
  /** Device seconds per local second (emulated devices only; 1 for real ones). */
  timeScale: number;
  maxGapSec: number;
}

export const detectorStateSchema = z.object({
  lastAtMs: z.number().nullable(),
  lastActive: z.boolean(),
  activeSinceMs: z.number().nullable(),
  idleSinceMs: z.number().nullable(),
  runSeconds: z.number().nonnegative(),
  cycles: z.number().int().nonnegative(),
});
export type DetectorState = z.infer<typeof detectorStateSchema>;

export const initialDetector = (): DetectorState => ({
  lastAtMs: null,
  lastActive: false,
  activeSinceMs: null,
  idleSinceMs: null,
  runSeconds: 0,
  cycles: 0,
});

export function stepDetector(
  s: DetectorState,
  cfg: DetectorConfig,
  sample: { atMs: number; watts: number },
): { state: DetectorState; cycleEnded: { seconds: number } | null } {
  const next = { ...s };
  const active = sample.watts > cfg.activeWatts;
  const sec = (ms: number) => (ms / 1000) * cfg.timeScale;
  if (s.lastAtMs !== null && sample.atMs > s.lastAtMs) {
    const dt = sec(sample.atMs - s.lastAtMs);
    if (s.lastActive && dt <= cfg.maxGapSec) next.runSeconds += dt;
  }
  let cycleEnded: { seconds: number } | null = null;
  if (active) {
    if (next.activeSinceMs === null) next.activeSinceMs = sample.atMs;
    next.idleSinceMs = null;
  } else if (next.activeSinceMs !== null) {
    if (next.idleSinceMs === null) next.idleSinceMs = sample.atMs;
    if (sec(sample.atMs - next.idleSinceMs) >= cfg.idleGraceSeconds) {
      const seconds = sec(next.idleSinceMs - next.activeSinceMs);
      if (seconds >= cfg.minCycleSeconds) {
        next.cycles += 1;
        cycleEnded = { seconds };
      }
      next.activeSinceMs = null;
      next.idleSinceMs = null;
    }
  }
  next.lastAtMs = sample.atMs;
  next.lastActive = active;
  return { state: next, cycleEnded };
}
