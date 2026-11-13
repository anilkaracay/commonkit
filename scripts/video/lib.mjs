// Shared helpers for the demo-video pipeline (scripts/video/build.sh).
// Paths, the Playwright loader, a static server for the site snapshot, and ffmpeg clip builders.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const HERE = join(ROOT, 'scripts/video');
export const BUILD = join(ROOT, 'video/build'); // intermediate files (gitignored)
export const OUT = join(ROOT, 'video/out'); // final renders (gitignored)
export const SRT = join(ROOT, 'video/commonkit-demo.en.srt'); // committed
export const W = 1920;
export const H = 1080;
export const FPS = 30;

export const dir = (...p) => {
  const d = join(BUILD, ...p);
  mkdirSync(d, { recursive: true });
  return d;
};

// Playwright is a dev dependency of landing/ and web/; resolve it from there (no new dependency).
export function playwright() {
  const req = createRequire(join(ROOT, 'landing/package.json'));
  return req('playwright');
}

export async function newPage(browser, extra = {}) {
  return browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: 'reduce', ...extra });
}

export function args(argv = process.argv.slice(2)) {
  const opt = (k) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const flag = (k) => argv.includes(`--${k}`);
  const only = opt('only')?.split(',').filter(Boolean) ?? null;
  return { opt, flag, only, wants: (id) => !only || only.includes(id) };
}

/** Serves the built site/ with scripts/serve-site.mjs (run `pnpm build:site` first). Resolves to { base, close }. */
export async function startSite(port = 4391) {
  if (!existsSync(join(ROOT, 'site/index.html')) || !existsSync(join(ROOT, 'site/app/index.html'))) {
    throw new Error('site/ is missing: run `pnpm build:site` first (scripts/video/build.sh does)');
  }
  const child = spawn(process.execPath, [join(ROOT, 'scripts/serve-site.mjs'), String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => {
    child.stdout.on('data', (d) => /localhost/.test(String(d)) && ok());
    child.on('exit', (c) => fail(new Error(`serve-site exited ${c}`)));
  });
  return { base: `http://127.0.0.1:${port}`, close: () => child.kill() };
}

export function ff(argv) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: ['ignore', 'inherit', 'inherit'] });
}

export function probeDuration(file) {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
}

const X264 = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS)];

/**
 * A clip from still panels. Each panel: { png, dur, from?, to? } where `png` is a W-wide image of any height; the
 * crop window moves from y=`from` to y=`to` (eased, smoothstep) over the panel, so tall full-page screenshots give
 * a slow, deterministic scroll; `overlay` pins a PNG strip at the top. Panels are joined with hard cuts, or short crossfades (`xfade` seconds) if given.
 */
export function panelsToClip(panels, out, { xfade = 0 } = {}) {
  const parts = panels.map((p, i) => {
    const file = out.replace(/\.mp4$/, `.p${i}.mp4`);
    const hImg = pngSize(p.png).h;
    const from = Math.max(0, Math.min(p.from ?? 0, hImg - H));
    const to = Math.max(0, Math.min(p.to ?? from, hImg - H));
    const hold = p.hold ?? 0.6; // seconds still before the scroll starts and after it ends
    const d = p.dur;
    const span = Math.max(0.01, d - 2 * hold);
    const prog = `clip((t-${hold})/${span},0,1)`;
    const y = to === from ? `${from}` : `${from}+(${to - from})*(3*pow(${prog},2)-2*pow(${prog},3))`;
    const vf = [`crop=${W}:${H}:0:'${y}'`, `scale=${W}:${H}`, 'setsar=1', `fps=${FPS}`].join(',');
    if (p.overlay) {
      // A strip pinned on top of the scrolling panel (the explorer URL bar).
      const fc = `[0:v]${vf}[bg];[bg][1:v]overlay=0:0:format=auto[v]`;
      ff(['-loop', '1', '-framerate', String(FPS), '-t', String(d), '-i', p.png, '-loop', '1', '-framerate', String(FPS), '-t', String(d), '-i', p.overlay,
        '-filter_complex', fc, '-map', '[v]', ...X264, '-an', file]);
    } else {
      ff(['-loop', '1', '-framerate', String(FPS), '-t', String(d), '-i', p.png, '-vf', vf, ...X264, '-an', file]);
    }
    return { file, dur: d };
  });
  const total = joinClips(parts, out, xfade);
  for (const p of parts) rmSync(p.file, { force: true });
  return total;
}

/** Joins clips with crossfades (xfade > 0) or concat. Returns the total duration. */
export function joinClips(parts, out, xfade = 0) {
  if (parts.length === 1) {
    ff(['-i', parts[0].file, '-c', 'copy', out]);
    return parts[0].dur;
  }
  const inputs = parts.flatMap((p) => ['-i', p.file]);
  if (!xfade) {
    const f = parts.map((_, i) => `[${i}:v]`).join('') + `concat=n=${parts.length}:v=1:a=0[v]`;
    ff([...inputs, '-filter_complex', f, '-map', '[v]', ...X264, '-an', out]);
    return parts.reduce((s, p) => s + p.dur, 0);
  }
  let chain = '';
  let prev = '[0:v]';
  let t = parts[0].dur;
  for (let i = 1; i < parts.length; i++) {
    const label = i === parts.length - 1 ? '[v]' : `[x${i}]`;
    chain += `${prev}[${i}:v]xfade=transition=fade:duration=${xfade}:offset=${(t - xfade).toFixed(3)}${label};`;
    t += parts[i].dur - xfade;
    prev = label;
  }
  ff([...inputs, '-filter_complex', chain.replace(/;$/, ''), '-map', '[v]', ...X264, '-an', out]);
  return t;
}

/** Frames (png sequence at FPS) to a clip. */
export function framesToClip(pattern, out) {
  ff(['-framerate', String(FPS), '-i', pattern, '-vf', `scale=${W}:${H},setsar=1`, ...X264, '-an', out]);
  return out;
}

export function pngSize(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

export const rmrf = (p) => rmSync(p, { recursive: true, force: true });

/** Wait until the app shows no loading skeletons and the network is quiet (one load per route, no polling). */
export async function settle(page, extraMs = 900) {
  await page.waitForTimeout(400);
  await page
    .waitForFunction(() => !document.querySelector('[role="status"].animate-pulse'), null, { timeout: 120_000 })
    .catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(extraMs);
}

/** Client-side navigation inside the app, so the RPC cache is shared between routes (FastNEAR rate limits). */
export async function go(page, to) {
  await page.evaluate((u) => {
    window.history.pushState({}, '', u);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, to);
  await settle(page);
}
