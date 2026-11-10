/** Mounts the live printer over its poster: same scene, same camera, so the crossfade is seamless. */
import snapshot from './data/testnet-snapshot.json';
import type { Snapshot } from './lib/chain.ts';
import { createStage } from './three/stage.ts';
import { stateOf } from './three/state.ts';
import type { MachineState } from './three/types.ts';

type Pt = { x: number; y: number };

export function mountHero(el: HTMLElement, onAnchors: (a: Record<string, Pt>) => void) {
  const canvas = document.createElement('canvas');
  if (!canvas.getContext('webgl2')) return null;
  canvas.setAttribute('aria-hidden', 'true');
  el.querySelector('.poster')!.after(canvas);
  const a = (snapshot as Snapshot).assets.find((x) => x.asset_type === 'printer_3d');
  // The hero tells the float and nozzle story; open tasks (with their override labels) live in the app.
  const heroState = (s: MachineState): MachineState => ({ ...s, taskOpen: false });
  const stage = createStage(canvas, { kind: 'printer_3d', state: heroState(stateOf(a)), dpr: Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1.75 : 2) });
  stage.onFrame(() => onAnchors(stage.anchors()));
  stage.renderAt(0);
  requestAnimationFrame(() => el.classList.add('live'));

  let visible = true;
  const sync = () => (visible && !document.hidden ? stage.start() : stage.stop());
  new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; sync(); }).observe(el);
  document.addEventListener('visibilitychange', sync);
  const api = {
    setState: (s: unknown) => stage.setState(heroState(s as MachineState)),
    /** deterministic frame for the video capture */
    renderAt: (t: number) => { stage.stop(); stage.renderAt(t); },
  };
  Object.assign(window, { __hero: api });
  return api;
}
