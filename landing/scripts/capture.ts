/**
 * 10-second hero recording: deterministic frames from the live three.js scene (window.__hero.renderAt), 30 fps,
 * encoded with ffmpeg into capture/hero-10s.mp4. Needs vite preview (default :4180) and ffmpeg.
 * Usage: tsx scripts/capture.ts [--url http://127.0.0.1:4180/] [--width 1440] [--height 900]
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const base = opt('url') ?? 'http://127.0.0.1:4180/';
const w = Number(opt('width') ?? 1440), h = Number(opt('height') ?? 900);
const fps = 30, secs = 10;
const dir = resolve(import.meta.dirname, '../capture');
const frames = resolve(dir, '.frames');
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
await page.goto(`${base}?3d=1&live=0`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => !!(window as unknown as { __hero?: unknown }).__hero, null, { timeout: 60000 });
await page.waitForTimeout(800);
for (let i = 0; i < fps * secs; i++) {
  await page.evaluate((t) => (window as unknown as { __hero: { renderAt(t: number): void } }).__hero.renderAt(t), i / fps);
  await page.screenshot({ path: resolve(frames, `${String(i).padStart(4, '0')}.png`) });
}
await browser.close();
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(fps), '-i', resolve(frames, '%04d.png'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', resolve(dir, 'hero-10s.mp4')]);
rmSync(frames, { recursive: true, force: true });
console.log('capture/hero-10s.mp4 written');
