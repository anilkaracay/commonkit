/** Studio page for posters and checks: ?kind=printer&dist=18&yaw=-0.5&t=0&shift=0 */
import { createStage } from './three/stage.ts';
import type { MachineKind } from './three/models.ts';
import { machineState } from './data.ts';

const q = new URLSearchParams(location.search);
const num = (k: string) => (q.has(k) ? Number(q.get(k)) : undefined);
const kind = (q.get('kind') ?? 'printer') as MachineKind;
const stage = createStage(document.getElementById('c') as HTMLCanvasElement, {
  kind, state: machineState(kind), distance: num('dist'), yaw: num('yaw'), pitch: num('pitch'), shiftX: num('shift'), dpr: num('dpr'), targetY: num('ty'),
});
stage.renderAt(num('t') ?? 0);
Object.assign(window, { __stage: stage, __ready: true });
