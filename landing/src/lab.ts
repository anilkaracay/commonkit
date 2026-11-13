/** Dev-only studio page for poster stills (scripts/posters.ts).
 *  One machine: ?kind=printer_3d&t=0&dist=&yaw=&pitch=&ty=&fit=&min=&fill=&zoom=&drift=&notask=1
 *  Scroll world: ?world=1&p=1.45 (scene index + progress inside it) */
import snapshot from './data/testnet-snapshot.json';
import type { Snapshot } from './lib/chain.ts';
import { createStage } from './three/stage.ts';
import type { MachineKind } from './three/machines.ts';
import { SCENES } from './three/scenes.ts';
import { stateOf } from './three/state.ts';
import { createWorld } from './three/world.ts';

const q = new URLSearchParams(location.search);
const num = (k: string) => (q.has(k) ? Number(q.get(k)) : undefined);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const snap = snapshot as Snapshot;

if (q.has('world')) {
  const w = createWorld(canvas, SCENES.map((s) => stateOf(snap.assets.find((x) => x.asset_type === s.kind))), 1);
  w.renderAt(num('p') ?? 0, num('t') ?? 1.5);
  Object.assign(window, { __ready: true });
} else {
  const kind = (q.get('kind') ?? 'printer_3d') as MachineKind;
  const s = stateOf(snap.assets.find((x) => x.asset_type === kind));
  const stage = createStage(canvas, {
    kind, state: { ...s, taskOpen: q.get('notask') === '1' ? false : s.taskOpen }, distance: num('dist'), yaw: num('yaw'), pitch: num('pitch'),
    targetY: num('ty'), fit: num('fit'), minDistance: num('min'), fill: num('fill'), zoom: num('zoom'), drift: num('drift'), dpr: num('dpr') ?? 1,
  });
  stage.renderAt(num('t') ?? 0);
  Object.assign(window, { __stage: stage, __ready: true });
}
