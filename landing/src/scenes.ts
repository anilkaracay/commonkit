/** The real-world sequence: on wide screens the stage is pinned and follows the scroll (posters swap; the live
 * 3D world loads lazily). On phones and tablets the scenes are a plain stacked list with their own posters. */
import { beatAt, SCENES } from './three/scenes.ts';

export function initScenes(reduced: boolean): void {
  const sec = document.getElementById('scenes');
  const box = sec?.querySelector<HTMLElement>('.stage-box');
  if (!sec || !box) return;
  const items = [...sec.querySelectorAll<HTMLElement>('.scene')];
  const posters = [...sec.querySelectorAll<HTMLElement>('.stage-poster')];
  const marks = [...sec.querySelectorAll<HTMLElement>('.scene-progress li')];
  const wide = matchMedia('(min-width: 1024px)');

  /** p = scene index + progress inside it, measured at the middle of the viewport. */
  const measure = (): number => {
    const mid = innerHeight * 0.5;
    let k = 0;
    items.forEach((el, i) => { if (el.getBoundingClientRect().top <= mid) k = i; });
    const r = items[k]!.getBoundingClientRect();
    return k + Math.max(0, Math.min(0.999, (mid - r.top) / r.height));
  };

  const outcomes = [...sec.querySelectorAll<HTMLElement>('.outcome-stage')];
  const steps = items.map((el) => [...el.querySelectorAll<HTMLElement>('.tl-step')]);
  let shown = -1;
  /** Scroll-synced timeline: beats switch by progress inside the scene, connectors draw continuously. */
  const paint = (p: number) => {
    const k = Math.floor(p), u = Math.min(1, (p - k) / 0.8);
    const def = SCENES[k]!, beat = beatAt(def, u), last = def.steps.length - 1;
    if (k !== shown) {
      shown = k;
      posters.forEach((el, i) => el.classList.toggle('on', i === k));
      marks.forEach((el, i) => el.classList.toggle('on', i === k));
    }
    const live = sec.classList.contains('is-live');
    // The outcome card shows on the final beat and leaves before the camera glides to the next machine.
    outcomes.forEach((el, i) => el.classList.toggle('show', i === k && p - k < 0.8 && (!live || beat === last)));
    if (!live) return;
    steps.forEach((list, i) => list.forEach((li, j) => {
      const at = SCENES[i]!.steps;
      const seg = i < k ? 1 : i > k ? 0 : j < beat ? 1 : j > beat || !at[j + 1] ? 0 : Math.max(0, Math.min(1, (u - at[j]!.at) / (at[j + 1]!.at - at[j]!.at)));
      const done = i < k || (i === k && (j < beat || (j === last && u >= Math.min(1, at[last]!.at + 0.12))));
      li.classList.toggle('done', done);
      li.classList.toggle('now', i === k && j === beat && !done);
      const v = seg.toFixed(3);
      if (li.style.getPropertyValue('--seg') !== v) li.style.setProperty('--seg', v);
    }));
  };

  let target = 0;
  const onScroll = () => { if (wide.matches) { target = measure(); paint(target); } };
  const setMode = () => {
    sec.classList.toggle('is-pinned', wide.matches);
    // Reduced motion and narrow screens keep every timeline complete (no scroll-synced states).
    sec.classList.toggle('is-live', wide.matches && !reduced);
    if (!sec.classList.contains('is-live')) steps.flat().forEach((li) => { li.classList.remove('done', 'now'); li.style.removeProperty('--seg'); });
    onScroll();
  };
  wide.addEventListener('change', setMode);
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  setMode();
  Object.assign(window, { __scenesP: () => target });

  // Live 3D: wide screens, fine pointer, motion welcome; loads when the section is one viewport away.
  if (reduced || !matchMedia('(pointer: fine)').matches || new URLSearchParams(location.search).get('3d') === '0') return;
  const io = new IntersectionObserver((es) => {
    if (!es.some((e) => e.isIntersecting) || !wide.matches) return;
    io.disconnect();
    void import('./scenes3d.ts').then((m) => m.mountWorld(sec, box, () => target)).catch(() => undefined);
  }, { rootMargin: '100% 0px' });
  io.observe(sec);
}
