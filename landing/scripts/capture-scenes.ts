/**
 * 15-second capture of the scroll sequence (pinned 3D stage + captions) at 1440 × 900, 30 fps, deterministic:
 * each frame scrolls the page, then renders the world at the page's own scroll progress.
 * Needs vite preview (default :4180) and ffmpeg. Output: capture/scenarios.mp4
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const base = process.argv[2] ?? 'http://127.0.0.1:4180/';
const fps = 30, secs = 15;
const dir = resolve(import.meta.dirname, '../capture');
const frames = resolve(dir, '.frames-scenes');
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

type W = { __world?: { renderAt(p: number, t: number): void }; __scenesP?: () => number };
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto(`${base}?live=0`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
// (no named helpers inside evaluate: tsx would inject a __name helper the page does not have)
const [y0, y1] = await page.evaluate(() => {
  const s = [...document.querySelectorAll<HTMLElement>('.scene')];
  const first = s[0]!.getBoundingClientRect().top + scrollY, last = s.at(-1)!;
  return [first - innerHeight * 0.5 + 40, last.getBoundingClientRect().top + scrollY + last.offsetHeight - innerHeight * 0.5 - 40];
});
await page.evaluate((y) => scrollTo(0, y), y0);
await page.waitForFunction(() => !!(window as unknown as W).__world, null, { timeout: 60000 });
await page.waitForTimeout(600);
const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x);
for (let i = 0; i < fps * secs; i++) {
  const y = y0 + (y1 - y0) * ease(i / (fps * secs - 1));
  await page.evaluate(async ([yy, t]) => {
    scrollTo(0, yy!);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const w = window as unknown as W;
    w.__world!.renderAt(w.__scenesP!(), t!);
  }, [y, i / fps]);
  await page.screenshot({ path: resolve(frames, `${String(i).padStart(4, '0')}.png`) });
}
await browser.close();
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(fps), '-i', resolve(frames, '%04d.png'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', resolve(dir, 'scenarios.mp4')]);
rmSync(frames, { recursive: true, force: true });
console.log('capture/scenarios.mp4 written');
