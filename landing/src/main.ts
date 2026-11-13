/** Page behaviour: reveals, callout leaders, the lazy 3D printer and the live testnet read. All optional:
 * without JS the page is complete (poster still + build-time numbers). */
import './styles/main.css';
import posterAnchors from './data/hero-anchors.json';
import { initScenes } from './scenes.ts';

type Pt = { x: number; y: number };
document.documentElement.classList.add('js');

const stage = document.getElementById('stage') as HTMLElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);

/** One elbow leader per callout, from the model anchor (0..1 of the stage) to the label's near edge. */
function drawLeaders(anchors: Record<string, Pt>): void {
  const box = stage.getBoundingClientRect();
  if (!box.width) return;
  for (const label of stage.querySelectorAll<HTMLElement>('.callout')) {
    const k = label.dataset.anchor!;
    const a = anchors[k];
    const path = stage.querySelector<SVGPathElement>(`[data-leader="${k}"]`);
    if (!a || !path) continue;
    const r = label.getBoundingClientRect();
    const left = r.left - box.left, right = r.right - box.left, midY = r.top - box.top + Math.min(r.height / 2, 12);
    const ax = a.x * box.width, ay = a.y * box.height;
    const toLeft = ax > right;
    const ex = toLeft ? right + 10 : left - 10;
    const kx = toLeft ? Math.max(ex + 16, ax - 24) : Math.min(ex - 16, ax + 24);
    const sx = 1000 / box.width, sy = 1000 / box.height;
    path.setAttribute('d', `M${ax * sx},${ay * sy} L${kx * sx},${midY * sy} L${ex * sx},${midY * sy}`);
  }
}
let anchors: Record<string, Pt> = posterAnchors;
drawLeaders(anchors);
addEventListener('resize', () => drawLeaders(anchors), { passive: true });

// Scroll reveals (once), only for content below the first viewport.
const io = new IntersectionObserver((es) => {
  for (const e of es) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}, { rootMargin: '0px 0px -8% 0px' });
for (const el of document.querySelectorAll('.how-step, .care-tile, .tile, .stat, .pass-wrap, .facts li, .near-tiles li'))
  if (el.getBoundingClientRect().top > innerHeight) { el.classList.add('reveal'); io.observe(el); }

initScenes(reduced);

// The spreadsheet plays once when it scrolls into view (reduced motion: final state, no animation).
const sheet = document.getElementById('sheet');
if (sheet && !reduced && sheet.getBoundingClientRect().top > innerHeight * 0.6) {
  sheet.classList.add('pre-cursor', 'pre-edit', 'pre-comment');
  const so = new IntersectionObserver((es) => {
    if (!es[0]?.isIntersecting) return;
    so.disconnect();
    setTimeout(() => sheet.classList.remove('pre-cursor'), 150);
    setTimeout(() => sheet.classList.remove('pre-edit'), 1000);
    setTimeout(() => sheet.classList.remove('pre-comment'), 1900);
  }, { threshold: 0.6 });
  so.observe(sheet);
}

const idle = (cb: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(cb, { timeout: 2500 }) : setTimeout(cb, 1200));

// The 3D printer is the same scene as the poster, so it can arrive late without a visible jump. It loads only
// when motion is welcome: on the first interaction, or (fine pointer only) a few idle seconds after load.
// Phones keep the poster until the visitor touches or scrolls, which saves their battery and main thread.
let hero: { setState(s: unknown): void } | null = null;
if (!reduced && params.get('3d') !== '0') {
  let started = false;
  const EVENTS = ['pointermove', 'pointerdown', 'touchstart', 'scroll', 'keydown', 'wheel'] as const;
  const boot = () => {
    if (started) return;
    started = true;
    for (const ev of EVENTS) removeEventListener(ev, boot);
    void import('./hero3d.ts')
      .then((m) => { hero = m.mountHero(stage, (a) => { anchors = a; drawLeaders(a); }); })
      .catch(() => undefined);
  };
  for (const ev of EVENTS) addEventListener(ev, boot, { once: true, passive: true });
  if (params.get('3d') === '1') boot();
  else if (matchMedia('(pointer: fine)').matches) {
    const later = () => setTimeout(() => idle(boot), 3000);
    if (document.readyState === 'complete') later(); else addEventListener('load', later, { once: true });
  }
}

// Live testnet read of printer-01 (never under automation; the labelled snapshot stays on screen otherwise).
if (!navigator.webdriver && params.get('live') !== '0') {
  const go = () => idle(() => void import('./live.ts').then((m) => m.startLive((s) => hero?.setState(s))).catch(() => undefined));
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
}
