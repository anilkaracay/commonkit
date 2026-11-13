/** The "real world" scroll sequence: one scene per commons, each driven by its profile rule and, where it
 * exists, the judge step that ran on testnet. `apply(u)` maps scene progress u ∈ [0, 1] to the machine state
 * the 3D shows; `steps` are the caption beats (their `at` is where in u each beat starts). */
import type { MachineKind } from './machines.ts';
import type { MachineState } from './types.ts';

export interface SceneDef {
  kind: MachineKind;
  steps: { at: number }[];
  apply(u: number, base: MachineState): MachineState;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));

export const SCENES: SceneDef[] = [
  {
    // printer-01, judge steps 7–8: nozzle time crosses the (demo) rule, the agent opens task #0, Ayşe cleans, Mehmet verifies.
    kind: 'printer_3d',
    steps: [{ at: 0 }, { at: 0.3 }, { at: 0.52 }, { at: 0.74 }],
    apply(u, b) {
      const wear = u < 0.3 ? lerp(b.wear, 1, u / 0.3) : u < 0.52 ? 1 : 0;
      return { ...b, wear, due: u >= 0.28 && u < 0.52, taskOpen: u >= 0.3 && u < 0.74, active: u < 0.3 || u >= 0.74 };
    },
  },
  {
    // washer-01, judge step 19: a fault report, out of service, verified repair, back in service.
    kind: 'washer',
    steps: [{ at: 0 }, { at: 0.28 }, { at: 0.52 }, { at: 0.76 }],
    apply(u, b) {
      return { ...b, taskOpen: u >= 0.28 && u < 0.76, inService: u < 0.28 || u >= 0.76, active: u < 0.28 || u >= 0.76 };
    },
  },
  {
    // laser-01, judge steps 11–13: refused without laser_safety, trained by Ayşe, approved by Mehmet, plug on.
    kind: 'laser_cutter',
    steps: [{ at: 0 }, { at: 0.3 }, { at: 0.52 }, { at: 0.74 }],
    apply(u, b) {
      return { ...b, inService: u >= 0.74, active: u >= 0.74 };
    },
  },
  {
    // fridge-01, judge step 20: weekly_clean refused before the interval, opened by the agent after it (demo 1 h).
    kind: 'community_fridge',
    steps: [{ at: 0 }, { at: 0.36 }, { at: 0.64 }],
    apply(u, b) {
      const wear = lerp(0.35, 1, u / 0.36);
      return { ...b, wear, due: wear >= 1, taskOpen: u >= 0.64 };
    },
  },
  {
    // Example only: the emergency_generator profile (monthly test run; fuel_refill, receipt-backed, capped at 1 NEAR).
    kind: 'emergency_generator',
    steps: [{ at: 0 }, { at: 0.3 }, { at: 0.52 }, { at: 0.74 }],
    apply(u, b) {
      const fuel = u < 0.3 ? lerp(0.62, 0.22, u / 0.3) : u < 0.52 ? 0.22 : 0.95;
      return { ...b, float: 0.6, wear: fuel, due: fuel < 0.3, taskOpen: u >= 0.3 && u < 0.74, active: u < 0.3 };
    },
  },
];

/** Index of the caption beat that is current at scene progress u. */
export const beatAt = (s: SceneDef, u: number): number => s.steps.reduce((k, st, i) => (u >= st.at ? i : k), 0);
