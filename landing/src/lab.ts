/** Dev-only studio page for poster stills (scripts/posters.ts): ?kind=printer_3d&t=0&dist=&yaw=&pitch=&ty=&fit=&drift= */
import snapshot from './data/testnet-snapshot.json';
import type { Snapshot } from './lib/chain.ts';
import { createStage } from './three/stage.ts';
import type { MachineKind } from './three/machines.ts';
import { stateOf } from './three/state.ts';

const q = new URLSearchParams(location.search);
const num = (k: string) => (q.has(k) ? Number(q.get(k)) : undefined);
const kind = (q.get('kind') ?? 'printer_3d') as MachineKind;
const a = (snapshot as Snapshot).assets.find((x) => x.asset_type === kind);
const stage = createStage(document.getElementById('c') as HTMLCanvasElement, {
  kind, state: stateOf(a), distance: num('dist'), yaw: num('yaw'), pitch: num('pitch'), targetY: num('ty'), fit: num('fit'), minDistance: num('min'), drift: num('drift'), dpr: num('dpr') ?? 1,
});
stage.renderAt(num('t') ?? 0);
Object.assign(window, { __stage: stage, __ready: true });
