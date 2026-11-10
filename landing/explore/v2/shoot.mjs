// Round-2 capture: posters (from the same three.js scene), screenshots, hero video.
// Usage (from landing/, with the v2 dev or preview server on :5191):
//   node explore/v2/shoot.mjs posters | shots | video [base-url]
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const [, , what = 'shots', base = 'http://127.0.0.1:5191/'] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const webp = (src, out, q = 86, w) => execFileSync('cwebp', ['-quiet', '-q', String(q), '-alpha_q', '90', ...(w ? ['-resize', String(w), '0'] : []), src, '-o', out]);

async function studio(query, size) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.goto(`${base}lab.html?${query}`);
  await page.waitForFunction(() => window.__ready === true);
  await page.waitForTimeout(300);
  return page;
}

if (what === 'posters') {
  const dir = path.join(here, 'posters');
  const tmp = path.join(here, 'posters', '.tmp');
  mkdirSync(tmp, { recursive: true });
  // Hero: the printer fitted to a square stage at t = 0 (the live scene starts from the same frame).
  const hero = await studio('kind=printer&t=0', 1200);
  await hero.screenshot({ path: path.join(tmp, 'hero.png'), omitBackground: true });
  const anchors = await hero.evaluate(() => window.__stage.anchors());
  writeFileSync(path.join(dir, 'anchors.json'), JSON.stringify(anchors, null, 2) + '\n');
  await hero.close();
  webp(path.join(tmp, 'hero.png'), path.join(dir, 'hero-1200.webp'));
  webp(path.join(tmp, 'hero.png'), path.join(dir, 'hero-800.webp'), 78, 800);
  webp(path.join(tmp, 'hero.png'), path.join(dir, 'hero-600.webp'), 78, 600);
  // Lineup: one shared camera distance so the machines keep their relative size.
  for (const kind of ['printer', 'laser', 'washer', 'fridge']) {
    const p = await studio(`kind=${kind}&t=1.5&dist=16.5&yaw=-0.55&pitch=0.14&ty=2.2`, 800);
    await p.screenshot({ path: path.join(tmp, `${kind}.png`), omitBackground: true });
    await p.close();
    webp(path.join(tmp, `${kind}.png`), path.join(dir, `${kind}-800.webp`));
  }
  rmSync(tmp, { recursive: true, force: true });
  console.log('posters + anchors written');
}

if (what === 'shots') {
  const out = path.join(here, 'shots');
  mkdirSync(out, { recursive: true });
  const sizes = [{ w: 1440, h: 900, dpr: 1 }, { w: 390, h: 844, dpr: 2 }];
  for (const theme of ['light', 'navy']) {
    for (const s of sizes) {
      const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr });
      await page.goto(`${base}?theme=${theme}&3d=0`);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForLoadState('networkidle');
      const f = (part) => path.join(out, `${theme}-${part}-${s.w}.png`);
      await page.waitForTimeout(300);
      await page.screenshot({ path: f('hero') });
      for (const [part, sel] of [['earn', '#earn'], ['rights', '#rights'], ['card', '#card']]) {
        await page.evaluate((q) => { const el = document.querySelector(q); el.scrollIntoView({ block: 'start' }); document.querySelectorAll('.reveal').forEach((r) => r.classList.add('in')); }, sel);
        await page.waitForTimeout(1100);
        await page.locator(sel).screenshot({ path: f(part) });
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (overflow > 0) console.warn(`${theme} @${s.w}: horizontal overflow ${overflow}px`);
      await page.close();
    }
    console.log('shots', theme);
  }
}

if (what === 'video') {
  // Deterministic frames from the live scene (window.__hero.renderAt), encoded at 30 fps.
  const frames = path.join(here, 'shots', '.frames');
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(`${base}?theme=${process.env.THEME ?? 'light'}&3d=1`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => !!window.__hero, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const fps = 30, secs = 7;
  for (let i = 0; i < fps * secs; i++) {
    await page.evaluate((t) => window.__hero.renderAt(t), i / fps);
    await page.screenshot({ path: path.join(frames, `${String(i).padStart(4, '0')}.png`) });
  }
  await page.close();
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(fps), '-i', path.join(frames, '%04d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', path.join(here, 'shots', 'hero.mp4')]);
  rmSync(frames, { recursive: true, force: true });
  console.log('hero.mp4 written');
}
await browser.close();
