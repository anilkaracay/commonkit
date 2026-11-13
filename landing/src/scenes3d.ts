/** Mounts the scroll world over the scene posters and eases it toward the scroll position (rAF while visible). */
import snapshot from './data/testnet-snapshot.json';
import type { Snapshot } from './lib/chain.ts';
import { SCENES } from './three/scenes.ts';
import { stateOf } from './three/state.ts';
import { createWorld } from './three/world.ts';

export function mountWorld(section: HTMLElement, box: HTMLElement, target: () => number) {
  const canvas = document.createElement('canvas');
  if (!canvas.getContext('webgl2')) return null;
  box.appendChild(canvas);
  const snap = snapshot as Snapshot;
  const bases = SCENES.map((s) => stateOf(snap.assets.find((a) => a.asset_type === s.kind)));
  const world = createWorld(canvas, bases);
  let cur = target(), raf = 0, visible = true, t0 = performance.now();
  world.renderAt(cur, 0);
  requestAnimationFrame(() => box.classList.add('live'));
  const loop = (now: number) => {
    // Same scroll progress as the captions: ease small steps, snap when the 3D would lag by more than half a scene.
    const tgt = target();
    cur = Math.abs(tgt - cur) > 0.5 ? tgt : cur + (tgt - cur) * 0.18;
    world.renderAt(cur, (now - t0) / 1000);
    raf = requestAnimationFrame(loop);
  };
  const sync = () => { cancelAnimationFrame(raf); if (visible && !document.hidden) { t0 = performance.now() - 0; raf = requestAnimationFrame(loop); } };
  new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; sync(); }).observe(section);
  document.addEventListener('visibilitychange', sync);
  const api = { renderAt: (p: number, t: number) => { cancelAnimationFrame(raf); visible = false; world.renderAt(p, t); } };
  Object.assign(window, { __world: api });
  return api;
}
