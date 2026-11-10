/**
 * Poster stills from the live three.js scene (LCP image, reduced-motion view, the twelve-machine grid).
 * Needs the dev server (pnpm dev, http://127.0.0.1:5180/) for lab.html. Requires `cwebp` (libwebp).
 * Usage: tsx scripts/posters.ts [--url http://127.0.0.1:5180/] [--only printer_3d,washer]
 * Writes public/posters/*.webp and src/data/hero-anchors.json (where the callout leaders point on the poster).
 */
import { chromium, type Page } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CARE_ORDER } from '../render/render.ts';

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const base = opt('url') ?? 'http://127.0.0.1:5180/';
const only = opt('only')?.split(',');
const out = resolve(import.meta.dirname, '../public/posters');
const tmp = resolve(out, '.tmp');
mkdirSync(tmp, { recursive: true });
const webp = (src: string, dst: string, q: number, w?: number) =>
  execFileSync('cwebp', ['-quiet', '-q', String(q), '-alpha_q', '90', '-m', '6', ...(w ? ['-resize', String(w), '0'] : []), src, '-o', dst]);

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
async function studio(query: string, size: number, height = size): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: size, height }, deviceScaleFactor: 1 });
  await page.goto(`${base}lab.html?${query}`);
  await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout: 60000 });
  await page.waitForTimeout(300);
  return page;
}

if (!only || only.includes('hero')) {
  const hero = await studio('kind=printer_3d&t=0&notask=1', 1200);
  const png = resolve(tmp, 'hero.png');
  await hero.screenshot({ path: png, omitBackground: true });
  const anchors = await hero.evaluate(() => (window as unknown as { __stage: { anchors(): unknown } }).__stage.anchors());
  writeFileSync(resolve(import.meta.dirname, '../src/data/hero-anchors.json'), JSON.stringify(anchors, null, 2) + '\n');
  await hero.close();
  webp(png, resolve(out, 'hero-1200.webp'), 84);
  webp(png, resolve(out, 'hero-800.webp'), 78, 800);
  webp(png, resolve(out, 'hero-600.webp'), 78, 600);
  console.log('hero');
}
// Optical correction so airy silhouettes (printer frame, bike) and bulky boxes (fridge, charger) read alike.
const ZOOM: Record<string, number> = { printer_3d: 0.8, cargo_bike: 0.82, tractor: 0.95, microscope: 0.95, community_fridge: 1.12, ev_charger: 1.18, washer: 1.06, gpu_server: 1.08, tool_library_ladder: 1.06, rehearsal_room: 1.02, laser_cutter: 1.02, emergency_generator: 1 };
for (const kind of CARE_ORDER) {
  if (only && !only.includes(kind)) continue;
  const p = await studio(`kind=${kind}&t=1.5&yaw=-0.55&pitch=0.16&fill=0.6&zoom=${ZOOM[kind] ?? 1}&drift=0`, 640);
  const png = resolve(tmp, `${kind}.png`);
  await p.screenshot({ path: png, omitBackground: true });
  await p.close();
  webp(png, resolve(out, `m-${kind}-640.webp`), 82);
  console.log(kind);
}
// Close-ups for "how it works": the status lens and screen (unlock), the print head and nozzle (upkeep).
const CLOSE: [string, string][] = [
  ['how-reserve', 'kind=printer_3d&t=3.1&notask=1&ty=2.2&dist=15.5&yaw=-0.78&pitch=0.18&drift=0'],
  ['how-earn', 'kind=printer_3d&t=4.4&notask=1&ty=1.55&dist=8.4&yaw=0.42&pitch=0.22&drift=0'],
  ['how-unlock', 'kind=printer_3d&notask=1&t=2.2&ty=0.9&dist=8.2&yaw=-0.18&pitch=0.3&drift=0'],
  ['how-upkeep', 'kind=printer_3d&notask=1&t=0&ty=2.25&dist=7.6&yaw=-0.3&pitch=0.12&drift=0'],
];
for (const [name, q] of CLOSE) {
  if (only && !only.includes(name)) continue;
  const p = await studio(q, 960, 720);
  const png = resolve(tmp, `${name}.png`);
  await p.screenshot({ path: png, omitBackground: true });
  await p.close();
  webp(png, resolve(out, `${name}-960.webp`), 82);
  console.log(name);
}
rmSync(tmp, { recursive: true, force: true });
await browser.close();
