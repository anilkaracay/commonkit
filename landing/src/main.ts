/** Progressive enhancement for the static page: reveals, scroll progress, sticky steps, filters, live data. */
import './styles/main.css';
import { relTime } from './lib/format.ts';

const doc = document.documentElement;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T & Element>(sel)] as T[];

// ---------- reveal on view, play-once animations ----------
const seen = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target as HTMLElement;
      el.classList.add('in');
      if (el.hasAttribute('data-play')) el.classList.add('played');
      seen.unobserve(el);
    }
  },
  { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
);
$$('[data-reveal], [data-play]').forEach((el) => seen.observe(el));

// ---------- nav background, dot-grid parallax, scroll-linked progress ----------
const nav = document.querySelector<HTMLElement>('.nav');
const dots = document.querySelector<HTMLElement>('.dots');
const progressEls = $$('[data-progress]');
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const y = window.scrollY;
    nav?.classList.toggle('scrolled', y > 8);
    if (reduced) return;
    dots?.style.setProperty('--par', `${(-y * 0.06).toFixed(1)}px`);
    const vh = window.innerHeight;
    for (const el of progressEls) {
      const r = el.getBoundingClientRect();
      // 0 when the element's top enters the bottom of the viewport, 1 when its centre reaches 40 % height
      const p = Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.6 + r.height * 0.5)));
      el.style.setProperty('--p', p.toFixed(3));
      if (el.classList.contains('loop')) lightNodes(el, p);
    }
  });
}
function lightNodes(el: HTMLElement, p: number) {
  $$('.loop-node', el).forEach((n, i) => n.classList.toggle('lit', p * 4 >= i + 0.15));
}
if (!reduced) progressEls.forEach((el) => el.style.setProperty('--p', '0'));
else progressEls.forEach((el) => el.classList.contains('loop') && lightNodes(el, 1));
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ---------- sticky how-it-works ----------
const steps = $$('.step');
if (steps.length) {
  steps[0]?.classList.add('active');
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const step = (e.target as HTMLElement).closest('.step');
        steps.forEach((s) => s.classList.toggle('active', s === step));
      }
    },
    { rootMargin: '-45% 0px -45% 0px' },
  );
  steps.forEach((s) => {
    const t = s.querySelector('.step-text');
    if (t) io.observe(t);
  });
}

// unlock demo: deny → allow, repeating while visible
const unlock = document.querySelector<HTMLElement>('[data-unlock]');
if (unlock) {
  if (reduced) unlock.classList.add('on');
  else {
    let timer = 0;
    const cycle = () => {
      unlock.classList.remove('on');
      unlock.classList.add('deny');
      timer = window.setTimeout(() => {
        unlock.classList.remove('deny');
        unlock.classList.add('on');
        timer = window.setTimeout(cycle, 3200);
      }, 1700);
    };
    new IntersectionObserver(([e]) => {
      window.clearTimeout(timer);
      if (e?.isIntersecting) cycle();
      else unlock.classList.add('on');
    }).observe(unlock);
  }
}

// ---------- commons filter ----------
const chips = $$<HTMLButtonElement>('[data-chip]');
const tiles = $$('.tile');
const note = document.querySelector<HTMLElement>('[data-chip-note]');
chips.forEach((chip) =>
  chip.addEventListener('click', () => {
    const k = chip.dataset.chip ?? 'all';
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    let shown = 0;
    tiles.forEach((t) => {
      const hit = k === 'all' || (t.dataset.kinds ?? '').split(' ').includes(k);
      t.classList.toggle('dim', !hit);
      if (hit) shown++;
      $$('.rules li', t).forEach((li) => li.classList.toggle('hit', k !== 'all' && li.dataset.kind === k));
    });
    if (note) note.textContent = k === 'all' ? '' : `${shown} of ${tiles.length} commons have a rule of this kind.`;
  }),
);

// ---------- number tickers ----------
if (!reduced) {
  const nio = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target as HTMLElement;
      nio.unobserve(el);
      const target = el.dataset.count ?? '';
      const dec = target.includes('.') ? target.split('.')[1]!.length : 0;
      const end = Number(target);
      if (!Number.isFinite(end) || end === 0) continue;
      const final = el.textContent ?? '';
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / 1100);
        const v = end * (1 - Math.pow(1 - k, 3));
        el.textContent = k < 1 ? v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : final;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  });
  $$('[data-count]').forEach((el) => nio.observe(el));
}

// ---------- magnetic CTAs (fine pointers only) ----------
if (!reduced && window.matchMedia('(pointer: fine)').matches) {
  $$('.magnetic').forEach((btn) => {
    btn.addEventListener('pointermove', (ev) => {
      const r = btn.getBoundingClientRect();
      btn.style.setProperty('--mx', `${((ev.clientX - r.left - r.width / 2) * 0.18).toFixed(1)}px`);
      btn.style.setProperty('--my', `${((ev.clientY - r.top - r.height / 2) * 0.3).toFixed(1)}px`);
    });
    btn.addEventListener('pointerleave', () => {
      btn.style.setProperty('--mx', '0px');
      btn.style.setProperty('--my', '0px');
    });
  });
}

// ---------- relative times in the ticker ----------
const refreshTimes = () => $$<HTMLTimeElement>('time[datetime]').forEach((t) => (t.textContent = relTime(t.dateTime)));
refreshTimes();
window.setInterval(refreshTimes, 60_000);

// ---------- live testnet data, after first paint ----------
const startLive = () => import('./live.ts').then((m) => m.startLive()).catch(() => undefined);
if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(startLive, { timeout: 2500 });
else window.setTimeout(startLive, 1200);

doc.classList.add('ready');
