/**
 * One screenshot per landing section at 1440 and 390 (vite preview on :4180 by default) into screenshots/.
 * The hero is a viewport shot (poster, no live read); the rest are element shots after their images load.
 * Usage: tsx scripts/sections.ts [--url http://localhost:4180/] [--widths 1440,390,768,1920]
 */
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const base = opt('url') ?? 'http://localhost:4180/';
const widths = (opt('widths') ?? '1440,390').split(',').map(Number);
const out = resolve(import.meta.dirname, '../screenshots');
mkdirSync(out, { recursive: true });
if (!opt('widths')) for (const f of readdirSync(out)) if (f.endsWith('.png')) rmSync(resolve(out, f));

const SECTIONS: [string, string][] = [
  ['02-problem', '.problem'],
  ['03-how', '#how'],
  ['04-scenes', '#scenes'],
  ['05-care', '.care'],
  ['06-money', '#money'],
  ['07-rights', '#rights'],
  ['08-proof', '#proof'],
  ['09-near', '#near'],
  ['10-final', '.final'],
  ['11-footer', '.foot'],
];

const browser = await chromium.launch();
for (const w of widths) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 600 ? 844 : w < 1000 ? 1024 : w > 1600 ? 1080 : 900 }, deviceScaleFactor: w < 600 ? 2 : 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(`${base}?live=0&3d=0`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(out, `01-hero-${w}.png`) });
  // Load every lazy image before the element shots.
  await page.evaluate(async () => {
    for (const img of document.querySelectorAll('img')) img.loading = 'eager';
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  });
  for (const [name, sel] of SECTIONS) {
    const el = page.locator(sel).first();
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await el.screenshot({ path: resolve(out, `${name}-${w}.png`) });
  }
  // The pinned sequence on wide screens: one viewport shot per scene, mid-scene.
  if (w >= 1024) {
    const n = await page.locator('.scene').count();
    for (let i = 0; i < n; i++) {
      await page.evaluate((k) => {
        const el = document.querySelectorAll<HTMLElement>('.scene')[k]!;
        scrollTo(0, scrollY + el.getBoundingClientRect().top - innerHeight * 0.5 + el.offsetHeight * 0.55);
      }, i);
      await page.waitForTimeout(250);
      await page.screenshot({ path: resolve(out, `04-scene-${i + 1}-${w}.png`) });
    }
  } else {
    const n = await page.locator('.scene').count();
    for (let i = 0; i < n; i++) await page.locator('.scene').nth(i).screenshot({ path: resolve(out, `04-scene-${i + 1}-${w}.png`) });
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(`${w}: ${overflow > 0 ? `HORIZONTAL OVERFLOW ${overflow}px` : 'no overflow'}`);
  await ctx.close();
}
await browser.close();
