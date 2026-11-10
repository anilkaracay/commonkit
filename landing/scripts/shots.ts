/**
 * Screenshots of the built page (vite preview must be running, or pass a URL).
 * Usage: tsx scripts/shots.ts <name> [--url http://localhost:4180/] [--widths 390,1440] [--full] [--at <selector>] [--query hero=b]
 * Writes screenshots/<name>-<width>.png. Motion is disabled (reducedMotion) unless --motion is passed.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const name = args[0] ?? 'page';
const opt = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const base = opt('url') ?? 'http://localhost:4180/';
const widths = (opt('widths') ?? '390,1440').split(',').map(Number);
const full = args.includes('--full');
const at = opt('at');
const query = opt('query');
const height = Number(opt('height') ?? 0);
const out = resolve(import.meta.dirname, '../screenshots');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
for (const w of widths) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: height || (w < 600 ? 844 : 900) },
    deviceScaleFactor: w < 600 ? 2 : 1,
    reducedMotion: args.includes('--motion') ? 'no-preference' : 'reduce',
  });
  const page = await ctx.newPage();
  await page.goto(base + (query ? `?${query}` : ''), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  if (at) {
    await page.locator(at).first().scrollIntoViewIfNeeded();
    await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'start' }), at);
    await page.waitForTimeout(600);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const file = resolve(out, `${name}-${w}.png`);
  await page.screenshot({ path: file, fullPage: full });
  console.log(file, overflow > 0 ? `HORIZONTAL OVERFLOW ${overflow}px` : 'no overflow');
  await ctx.close();
}
await browser.close();
