/**
 * Records a 10-second hero capture (motion on, live reads off: the page shows its labelled testnet snapshot)
 * into capture/hero-raw.webm (then converted to capture/hero-10s.mp4 with ffmpeg). The built page must be served (vite preview, default :4180).
 */
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.env.LANDING_URL ?? 'http://localhost:4180/';
const dir = resolve(import.meta.dirname, '../capture');
const tmp = resolve(dir, 'tmp');
mkdirSync(tmp, { recursive: true });
const size = { width: 1600, height: 900 };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: size, recordVideo: { dir: tmp, size }, reducedMotion: 'no-preference' });
const page = await ctx.newPage();
const t0 = Date.now();
await page.goto(`${url}?live=0`, { waitUntil: 'load' });
await page.waitForTimeout(2600); // headline, cards and ruler settle
const cta = page.locator('.hero .btn-primary').first();
const box = await cta.boundingBox();
if (box) {
  await page.mouse.move(box.x - 60, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6, { steps: 25 }); // magnetic CTA
  await page.waitForTimeout(900);
  await page.mouse.move(box.x + box.width + 300, box.y - 200, { steps: 20 });
}
for (let y = 0; y <= 520; y += 8) {
  await page.evaluate((v) => window.scrollTo(0, v), y);
  await page.waitForTimeout(16);
}
await page.waitForTimeout(Math.max(0, 10_000 - (Date.now() - t0)));
await ctx.close();
await browser.close();
const [file] = readdirSync(tmp).filter((f) => f.endsWith('.webm'));
if (!file) throw new Error('no video recorded');
renameSync(resolve(tmp, file), resolve(dir, 'hero-raw.webm'));
rmSync(tmp, { recursive: true, force: true });
console.log('wrote capture/hero-raw.webm; convert: ffmpeg -ss 0.4 -t 10 -i capture/hero-raw.webm -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart capture/hero-10s.mp4');
