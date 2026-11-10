import { z } from "zod";
import { baseFaultsSchema, type EmuClock } from "./common.js";

/**
 * Electrical load behind an emulated plug: a power profile that starts when the relay closes,
 * then a steady `then_watts`. Piecewise constant, so energy is integrated exactly.
 */
export const loadSchema = z.object({
  name: z.string(),
  segments: z.array(z.object({ watts: z.number().nonnegative(), seconds: z.number().positive() })).default([]),
  then_watts: z.number().nonnegative(),
});
export type Load = z.infer<typeof loadSchema>;

/**
 * Presets. `lamp_60w` is the laser-cutter STAND-IN (D-022/D-408): the emulated device never models
 * a laser being on. `washer_cycle` is a wash -> rinse -> spin profile followed by standby, for cycle detection.
 */
export const LOADS: Record<string, Load> = {
  lamp_60w: { name: "desk lamp 60 W (stand-in, emulated)", segments: [], then_watts: 60 },
  washer_cycle: {
    name: "washing machine cycle (emulated)",
    segments: [
      { watts: 2100, seconds: 900 },
      { watts: 350, seconds: 1500 },
      { watts: 550, seconds: 300 },
    ],
    then_watts: 1.5,
  },
  fridge_compressor: {
    name: "fridge compressor duty cycle (emulated)",
    segments: [
      { watts: 120, seconds: 900 },
      { watts: 4, seconds: 1500 },
    ],
    then_watts: 4,
  },
};

export const plugFaultsSchema = baseFaultsSchema.extend({
  /** The relay ignores switch commands (welded contact / firmware hang); the API still answers. */
  stuck: z.boolean().default(false),
});
export type PlugFaults = z.infer<typeof plugFaultsSchema>;

export const VOLTAGE = 230;

/** Relay + load + energy meter + internal temperature. Time is emulated (EmuClock). */
export class PlugCore {
  on = false;
  private onSinceMs = 0;
  /** Energy of finished on-periods, Wh. */
  private committedWh: number;

  constructor(
    private readonly clock: EmuClock,
    readonly load: Load,
    readonly faults: PlugFaults,
    initialWh = 0,
  ) {
    this.committedWh = initialWh;
  }

  /** Returns the previous state. With the `stuck` fault the relay does not move. */
  set(on: boolean): boolean {
    const was = this.on;
    if (this.faults.stuck || on === was) return was;
    const now = this.clock.now();
    if (was) this.committedWh += this.energySince(this.onSinceMs, now);
    this.on = on;
    if (on) this.onSinceMs = now;
    return was;
  }

  /** Instantaneous active power, W. */
  watts(): number {
    if (!this.on) return 0;
    return this.powerAt((this.clock.now() - this.onSinceMs) / 1000);
  }

  /** Cumulative energy, Wh (monotonic). */
  totalWh(): number {
    return this.committedWh + (this.on ? this.energySince(this.onSinceMs, this.clock.now()) : 0);
  }

  /** Internal device temperature, C: ambient 28 C + self-heating with load. */
  temperatureC(): number {
    return Math.round((28 + this.watts() * 0.02) * 10) / 10;
  }

  current(): number {
    return Math.round((this.watts() / VOLTAGE) * 1000) / 1000;
  }

  private powerAt(tSec: number): number {
    let t = 0;
    for (const s of this.load.segments) {
      if (tSec < t + s.seconds) return s.watts;
      t += s.seconds;
    }
    return this.load.then_watts;
  }

  /** Exact integral of the profile from relay-on (fromMs) to toMs, Wh. */
  private energySince(fromMs: number, toMs: number): number {
    const dur = Math.max(0, (toMs - fromMs) / 1000);
    let t = 0;
    let ws = 0;
    for (const s of this.load.segments) {
      const take = Math.max(0, Math.min(s.seconds, dur - t));
      ws += take * s.watts;
      t += s.seconds;
      if (t >= dur) return ws / 3600;
    }
    ws += Math.max(0, dur - t) * this.load.then_watts;
    return ws / 3600;
  }
}
