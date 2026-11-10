/** Page behaviour: reveals, callout leaders, the lazy 3D printer and the live testnet read. All optional:
 * without JS the page is complete (poster still + build-time numbers). */
import posterAnchors from '../posters/anchors.json';

type Pt = { x: number; y: number };
document.documentElement.classList.add('js');

const stage = document.getElementById('stage') as HTMLElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Draws one elbow leader per callout, from the model anchor (0..1 of the stage) to the label's near edge. */
export function drawLeaders(anchors: Record<string, Pt>): void {
  const box = stage.getBoundingClientRect();
  if (!box.width) return;
  for (const label of stage.querySelectorAll<HTMLElement>('.callout')) {
    const k = label.dataset.anchor!;
    const a = anchors[k];
    const path = stage.querySelector<SVGPathElement>(`[data-leader="${k}"]`);
    if (!a || !path) continue;
    const r = label.getBoundingClientRect();
    const left = r.left - box.left, right = r.right - box.left, midY = r.top - box.top + r.height / 2;
    const ax = a.x * box.width, ay = a.y * box.height;
    const toLeft = ax > right;
    const ex = toLeft ? right + 10 : left - 10;
    const kx = toLeft ? Math.max(ex + 16, ax - 24) : Math.min(ex - 16, ax + 24);
    const sx = 1000 / box.width, sy = 1000 / box.height;
    path.setAttribute('d', `M${ax * sx},${ay * sy} L${kx * sx},${midY * sy} L${ex * sx},${midY * sy}`);
  }
}

drawLeaders(posterAnchors);
addEventListener('resize', () => drawLeaders(posterAnchors), { passive: true });

// Scroll reveals (once).
const io = new IntersectionObserver((es) => {
  for (const e of es) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}, { rootMargin: '0px 0px -10% 0px' });
for (const el of document.querySelectorAll('.lineup .tile, .swept, .pass-wrap, .refused li, .acard')) {
  if (el.getBoundingClientRect().top > innerHeight) { el.classList.add('reveal'); io.observe(el); }
}

const params = new URLSearchParams(location.search);
const idle = (cb: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(cb, { timeout: 2500 }) : setTimeout(cb, 1200));

// The 3D printer is the same scene as the poster, so it can arrive late without a visible jump. It loads only
// when motion is welcome: on the first interaction, or (fine pointer only) a few idle seconds after load.
// Phones keep the poster until the visitor touches or scrolls, which saves their battery and main thread.
if (!reduced && params.get('3d') !== '0') {
  let started = false;
  const boot = () => {
    if (started) return;
    started = true;
    for (const ev of EVENTS) removeEventListener(ev, boot);
    void import('./hero3d.ts').then((m) => m.mountHero(stage, drawLeaders)).catch(() => undefined);
  };
  const EVENTS = ['pointermove', 'pointerdown', 'touchstart', 'scroll', 'keydown', 'wheel'] as const;
  for (const ev of EVENTS) addEventListener(ev, boot, { once: true, passive: true });
  if (params.get('3d') === '1') boot();
  else if (matchMedia('(pointer: fine)').matches) {
    const later = () => setTimeout(() => idle(boot), 3000);
    if (document.readyState === 'complete') later(); else addEventListener('load', later, { once: true });
  }
}

// Live testnet read (skipped under automation so screenshots show the labelled snapshot).
if (!navigator.webdriver && params.get('live') !== '0') {
  addEventListener('load', () => idle(() => void import('./live.ts').then((m) => m.refresh()).catch(() => undefined)), { once: true });
}
