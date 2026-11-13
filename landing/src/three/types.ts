import type { Group, Object3D } from 'three';

/** The real state a machine shows (from get_ledger / get_rule_status / get_service_status). */
export interface MachineState {
  /** float_free / float_cap */
  float: number;
  /** due_value / threshold of the machine's headline Metric rule */
  wear: number;
  due: boolean;
  /** an upkeep task is open (get_rule_status open_task) */
  taskOpen: boolean;
  inService: boolean;
  /** running right now (drum turning, engine under load); undefined = idle motion as usual */
  active?: boolean;
}

export interface Machine {
  group: Group;
  anchors: Record<string, Object3D>;
  /** deterministic in t (seconds): posters and the video capture step t */
  update(t: number): void;
  setState(s: MachineState): void;
}

export const IDLE: MachineState = { float: 0.5, wear: 0.3, due: false, taskOpen: false, inService: true };
