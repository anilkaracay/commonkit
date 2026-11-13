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

  let shown = -1, shownBeat = -1;
  const paint = (p: number) => {
    const k = Math.floor(p), u = Math.min(1, (p - k) / 0.8);
    const beat = beatAt(SCENES[k]!, u);
    if (k === shown && beat === shownBeat) return;
    shown = k; shownBeat = beat;
    posters.forEach((el, i) => el.classList.toggle('on', i === k));
    marks.forEach((el, i) => el.classList.toggle('on', i === k));
    items.forEach((el, i) => el.querySelectorAll('.beats li').forEach((li, j) => {
      li.classList.toggle('done', i < k || (i === k && j < beat));
      li.classList.toggle('now', i === k && j === beat);
    }));
  };

  let target = 0;
  const onScroll = () => { if (wide.matches) { target = measure(); paint(target); } };
  const setMode = () => { sec.classList.toggle('is-pinned', wide.matches); onScroll(); };
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
