/** Typed view of the build-time picks (virtual:ck-data) and the machine state the 3D reacts to. */
import raw from 'virtual:ck-data';
import type { MachineKind, MachineState } from './three/models.ts';
import { headlineRule, ratio, threshold, type Asset, type CkData } from './format.ts';

export const data = raw as unknown as CkData;
export const KIND: Record<MachineKind, string> = { printer: 'printer_3d', laser: 'laser_cutter', washer: 'washer', fridge: 'community_fridge' };
export const asset = (k: MachineKind): Asset => data.assets.find((a) => a.kind === KIND[k])!;

export function machineState(k: MachineKind, a: Asset = asset(k)): MachineState {
  const r = headlineRule(a);
  return {
    float: ratio(a.floatFree, a.floatCap),
    wear: Math.min(1, Number(r.dueValue) / Math.max(1, threshold(r))),
    due: r.due,
    taskOpen: a.rules.some((x) => x.openTask !== null),
    inService: a.inService,
  };
}
