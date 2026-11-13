// Records the browser shots of the demo video at 1920×1080, devicePixelRatio 1:
// landing (built site/ via scripts/serve-site.mjs), the app read live from testnet (one load, client-side
// navigation, no polling loops), and real testnet transactions on testnet.near.rocks (URL shown on screen).
//   node scripts/video/record.mjs [--only s03-reserve,s06-money]
// Output: video/build/shots/<id>.mp4 (exact shot length, no captions). Intermediate PNGs are deleted.
import { join } from 'node:path';
import { FPS, H, HERE, W, args, dir, framesToClip, go, joinClips, newPage, panelsToClip, playwright, rmrf, settle, startSite } from './lib.mjs';
import { PRINTER, SHOTS, TX, XFADE } from './shots.mjs';

const { wants } = args();
const shotDur = (id) => SHOTS.find((s) => s.id === id).dur;
const SHOTS_DIR = dir('shots');
const tmp = (id) => dir('tmp', id);

// Hide the app's "STEP n/21" recording aid; the subtitles carry the context.
const APP_CSS = 'div[aria-live="polite"].fixed { display: none !important; } html { zoom: 1.2; scroll-behavior: auto !important; }';

/** y (page px) of the first text node matching `re`, or null. */
function yOf(page, re) {
  return page.evaluate((src) => {
    const rx = new RegExp(src);
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!rx.test(n.textContent ?? '')) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      const box = r.getBoundingClientRect();
      if (box.height > 0) return box.top + window.scrollY;
    }
    return null;
  }, re.source);
}

async function fullShot(page, png) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  await page.screenshot({ path: png, fullPage: true });
  return png;
}

/** A real testnet tx on NEAR Rocks, with every failed result expanded and the URL pinned on screen. */
async function explorer(browser, hash, png, focus) {
  const page = await newPage(browser);
  const url = `https://testnet.near.rocks/tx/${hash}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.waitForSelector('text=Receipts', { timeout: 60_000 });
  // Expand collapsed nodes of failed results (the error code sits a few levels down).
  for (let i = 0; i < 8; i++) {
    const arrow = page.locator('.bg-red-50 .w-rjv-arrow[style*="-90deg"]').first();
    if (!(await arrow.count())) break;
    await arrow.click();
    await page.waitForTimeout(350);
  }
  // Long strings are shortened with "..."; a click shows the full panic message.
  const shortened = page.locator('.bg-red-50 .w-rjv-value', { hasText: '...' });
  for (let i = 0; i < Math.min(4, await shortened.count()); i++) {
    await shortened.nth(i).click();
    await page.waitForTimeout(300);
  }
  await page.addStyleTag({
    content: `html { zoom: 1.3; } body { padding-top: 46px; }
      #ck-url { position: fixed; top: 0; left: 0; width: 1477px; height: 46px; display: flex; align-items: center; gap: 14px; padding: 0 24px;
        background: #0d1f3c; color: #dce6f4; font: 500 19px/1 ui-monospace, 'SF Mono', Menlo, monospace; z-index: 99; }
      #ck-url b { color: #9cc3ff; font-weight: 600; font-family: -apple-system, system-ui, sans-serif; letter-spacing: .03em; }`,
  });
  await page.evaluate((u) => {
    const bar = document.createElement('div');
    bar.id = 'ck-url';
    bar.innerHTML = `<b>REAL NEAR TESTNET TX</b><span></span>`;
    bar.querySelector('span').textContent = u;
    document.body.prepend(bar);
  }, url);
  await page.waitForTimeout(500);
  const bar = png.replace(/\.png$/, '.bar.png');
  await page.locator('#ck-url').screenshot({ path: bar });
  await page.evaluate(() => document.getElementById('ck-url').remove());
  await fullShot(page, png);
  const y = focus ? await yOf(page, focus) : null;
  await page.close();
  return { png, y, bar };
}

async function hero(browser, base) {
  const id = 's02-problem';
  const frames = tmp(id);
  const page = await newPage(browser, { reducedMotion: 'no-preference' }); // the live 3D never loads under reduced motion
  await page.goto(`${base}/?3d=1&live=0`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => !!window.__hero, null, { timeout: 60_000 });
  await page.waitForTimeout(800);
  const n = Math.round(shotDur(id) * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => window.__hero.renderAt(t), i / FPS);
    await page.screenshot({ path: join(frames, `${String(i).padStart(4, '0')}.png`) });
  }
  await page.close();
  framesToClip(join(frames, '%04d.png'), join(SHOTS_DIR, `${id}.mp4`));
  rmrf(frames);
}

async function openApp(browser, base) {
  const page = await newPage(browser);
  await page.goto(`${base}/app/?demo=1`, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: APP_CSS });
  await page.waitForSelector('article a[href*="/a/"]', { timeout: 180_000 });
  await settle(page);
  return page;
}

// Panel durations inside a shot overlap by `x`, so they add up to the shot length.
const fit = (id, parts, x) => {
  const total = shotDur(id) + x * (parts.length - 1);
  const sum = parts.reduce((s, p) => s + p, 0);
  return parts.map((p) => (p / sum) * total);
};

async function main() {
  const site = await startSite();
  const { chromium } = playwright();
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const x = 0.35;
  try {
    if (wants('s02-problem')) await hero(browser, site.base);

    const appShots = ['s03-reserve', 's05-task', 's06-money'].filter(wants);
    const app = appShots.length ? await openApp(browser, site.base) : null;

    if (wants('s03-reserve')) {
      const id = 's03-reserve';
      const t = tmp(id);
      await go(app, `/app/a/${PRINTER}?demo=1`);
      const a = await fullShot(app, join(t, 'asset.png'));
      await go(app, `/app/a/${PRINTER}/reserve?demo=1`);
      const r = await fullShot(app, join(t, 'reserve.png'));
      const ex = await explorer(browser, TX.reserve, join(t, 'tx.png'), /reservation_confirmed/);
      const [d1, d2, d3] = fit(id, [3.6, 2.9, 3.5], x);
      panelsToClip([
        { png: a, dur: d1 },
        { png: r, dur: d2 },
        { png: ex.png, dur: d3, from: 0, to: ex.y ? ex.y - 640 : 0, hold: 0.5, overlay: ex.bar },
      ], join(SHOTS_DIR, `${id}.mp4`), { xfade: x });
      rmrf(t);
    }

    if (wants('s05-task')) {
      const id = 's05-task';
      const t = tmp(id);
      await go(app, `/app/t/${PRINTER}/0?demo=1`);
      const png = await fullShot(app, join(t, 'task.png'));
      const cards = await yOf(app, /right-4/);
      panelsToClip([{ png, dur: shotDur(id), from: 0, to: cards ? cards + 260 - H : 10_000, hold: 3.6 }], join(SHOTS_DIR, `${id}.mp4`));
      rmrf(t);
    }

    if (wants('s06-money')) {
      const id = 's06-money';
      const t = tmp(id);
      await go(app, `/app/a/${PRINTER}?demo=1`);
      const png = await fullShot(app, join(t, 'asset.png'));
      const money = await yOf(app, /^Money$/);
      const ex = await explorer(browser, TX.sweep, join(t, 'tx.png'), /swept/);
      const [d1, d2] = fit(id, [4.6, 5.4], x);
      panelsToClip([
        { png, dur: d1, from: money ? money - 140 : 0 },
        { png: ex.png, dur: d2, from: 0, to: ex.y ? ex.y - 300 : 0, hold: 0.5, overlay: ex.bar },
      ], join(SHOTS_DIR, `${id}.mp4`), { xfade: x });
      rmrf(t);
    }
    if (app) await app.close();

    if (wants('s07-norevoke')) {
      const id = 's07-norevoke';
      const t = tmp(id);
      const ex = await explorer(browser, TX.transfer, join(t, 'tx.png'), /E_NON_TRANSFERABLE/);
      if (!ex.y) console.warn('[video] s07: E_NON_TRANSFERABLE not found on the page; check the explorer expansion');
      panelsToClip([{ png: ex.png, dur: shotDur(id), from: 0, to: ex.y ? ex.y - 400 : 0, hold: 1.2, overlay: ex.bar }], join(SHOTS_DIR, `${id}.mp4`));
      rmrf(t);
    }

    if (wants('s09-close')) {
      const id = 's09-close';
      const t = tmp(id);
      // Scroll through the 12-commons section (scroll-driven 3D "scenes" if built, else the "care" grid), frame by frame.
      const page = await newPage(browser, { reducedMotion: 'no-preference' });
      await page.goto(`${site.base}/?3d=1&live=0`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const range = await page.evaluate((h) => {
        const el = document.querySelector('section.scenes') ?? document.querySelector('section.care');
        const r = el.getBoundingClientRect();
        const top = r.top + window.scrollY;
        return { name: el.className, y0: top, y1: Math.max(top, top + r.height - h) };
      }, H);
      for (let y = range.y0; y <= range.y1 + 1; y += H / 2) {
        await page.evaluate((v) => window.scrollTo(0, v), y); // warm lazy posters and 3D once
        await page.waitForTimeout(300);
      }
      await page.waitForLoadState('networkidle').catch(() => {});
      const [d1, d2] = fit(id, [5.2, 3.8], XFADE);
      const n = Math.round(d1 * FPS);
      for (let i = 0; i < n; i++) {
        const p = Math.min(1, Math.max(0, (i / (n - 1) - 0.08) / 0.84));
        const y = range.y0 + (range.y1 - range.y0) * (p * p * (3 - 2 * p));
        await page.evaluate((v) => new Promise((ok) => { window.scrollTo(0, v); requestAnimationFrame(() => requestAnimationFrame(ok)); }), y);
        await page.screenshot({ path: join(t, `f${String(i).padStart(4, '0')}.png`) });
      }
      await page.close();
      console.log(`[video] ${id}: scrolled section.${range.name.split(' ')[0]} (${Math.round(range.y1 - range.y0)} px)`);
      const scroll = framesToClip(join(t, 'f%04d.png'), join(t, 'scroll.mp4'));
      const end = await newPage(browser);
      const q = new URLSearchParams({ site: process.env.VIDEO_SITE_URL ?? 'https://<demo-domain>/app', repo: process.env.VIDEO_REPO_URL ?? 'github.com/<owner>/commonkit' });
      await end.goto(`file://${join(HERE, 'endcard.html')}?${q}`);
      await end.evaluate(() => document.fonts.ready);
      const card = join(t, 'end.png');
      await end.screenshot({ path: card });
      await end.close();
      const still = join(t, 'end.mp4');
      panelsToClip([{ png: card, dur: d2 }], still);
      joinClips([{ file: scroll, dur: d1 }, { file: still, dur: d2 }], join(SHOTS_DIR, `${id}.mp4`), XFADE);
      rmrf(t);
    }
  } finally {
    await browser.close();
    site.close();
  }
  console.log(`[video] browser shots done (${W}×${H}, dpr 1)`);
}

await main();
