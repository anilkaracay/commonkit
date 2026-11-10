/** Mounts the live printer over its poster. Same scene, same camera, so the swap is seamless. */
import { createStage } from './three/stage.ts';
import { machineState } from './data.ts';
import type { MachineState } from './three/models.ts';

type Pt = { x: number; y: number };

export function mountHero(el: HTMLElement, onAnchors: (a: Record<string, Pt>) => void) {
  const canvas = document.createElement('canvas');
  if (!canvas.getContext('webgl2')) return null;
  canvas.setAttribute('aria-hidden', 'true');
  el.querySelector('.poster')!.after(canvas);
  const stage = createStage(canvas, { kind: 'printer', state: machineState('printer'), dpr: Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1.75 : 2) });
  stage.onFrame(() => onAnchors(stage.anchors()));
  stage.renderAt(0);
  requestAnimationFrame(() => el.classList.add('live'));

  let visible = true;
  const sync = () => (visible && !document.hidden ? stage.start() : stage.stop());
  new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; sync(); }).observe(el);
  document.addEventListener('visibilitychange', sync);
  const api = {
    setState: (s: MachineState) => stage.setState(s),
    /** deterministic frame for the video capture */
    renderAt: (t: number) => { stage.stop(); stage.renderAt(t); },
  };
  Object.assign(window, { __hero: api });
  window.dispatchEvent(new Event('ck:hero'));
  return api;
}
