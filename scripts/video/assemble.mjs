// Assembles video/build/tour.mp4 (scripts/video/tour.mjs) into the two exports: the browser bar (the real URL of each
// page) and the burned-in English captions are overlaid for their time windows, then the end card follows.
//   node scripts/video/assemble.mjs
// This ffmpeg build has neither the `subtitles` nor the `drawtext` filter, so every bar and caption is rendered once as
// a PNG (chrome.html, caption.html) and overlaid. Silent AAC track for player/X compatibility; no music.
import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FPS, H, HERE, OUT, SRT, W, dir, ff, joinClips, newPage, panelsToClip, playwright, probeDuration, rmrf } from './lib.mjs';

const XFADE = 0.5; // into the end card
const END = 4.5; // end card seconds
const build = dir();
const tour = join(build, 'tour.mp4');
const meta = join(build, 'tour.json');
const endPng = join(build, 'end.png');
for (const f of [tour, meta, endPng]) {
  if (!existsSync(f)) {
    console.error(`[video] missing ${f} (run scripts/video/build.sh)`);
    process.exit(1);
  }
}
const { cues, bars } = JSON.parse(readFileSync(meta, 'utf8'));
const tourDur = probeDuration(tour);
dir('..', 'out');

// SRT (committed) from the recorded caption windows.
const stamp = (sec) => {
  const ms = Math.round(sec * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
const srt = cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.chapter ? `${c.chapter}: ` : ''}${c.text}\n`).join('\n');
writeFileSync(SRT, srt);
copyFileSync(SRT, join(OUT, 'commonkit-demo.en.srt'));

// 1. Bar and caption PNGs.
const pngDir = dir('overlays');
const { chromium } = playwright();
const browser = await chromium.launch();
const barPage = await browser.newPage({ viewport: { width: W, height: 56 }, deviceScaleFactor: 1 });
const overlays = [];
for (const [i, b] of bars.entries()) {
  await barPage.goto(`file://${join(HERE, 'chrome.html')}?${new URLSearchParams({ host: b.host, path: b.path })}`);
  const png = join(pngDir, `bar-${String(i).padStart(2, '0')}.png`);
  await barPage.screenshot({ path: png });
  overlays.push({ png, start: b.start, end: b.end, y: 0 });
}
const capPage = await newPage(browser, { viewport: { width: W, height: 150 } });
await capPage.goto(`file://${join(HERE, 'caption.html')}`);
for (const [i, c] of cues.entries()) {
  await capPage.evaluate(([chapter, text]) => {
    document.getElementById('c').textContent = chapter ?? '';
    document.getElementById('t').textContent = text;
  }, [c.chapter, c.text]);
  await capPage.evaluate(() => document.fonts.ready);
  const png = join(pngDir, `cap-${String(i).padStart(2, '0')}.png`);
  await capPage.screenshot({ path: png, omitBackground: true });
  overlays.push({ png, start: c.start, end: c.end, y: H - 150 }); // the caption band under the page
}

// 2. Walkthrough with overlays, then the end card.
const walk = join(build, 'walk.mp4');
let chain = '';
let prev = '[0:v]';
overlays.forEach((o, i) => {
  const label = i === overlays.length - 1 ? '[v]' : `[o${i}]`;
  chain += `${prev}[${i + 1}:v]overlay=0:${o.y}:enable='between(t,${o.start.toFixed(3)},${(o.end - 0.001).toFixed(3)})'${label};`;
  prev = label;
});
ff([
  '-i', tour, ...overlays.flatMap((o) => ['-loop', '1', '-framerate', String(FPS), '-t', tourDur.toFixed(3), '-i', o.png]),
  '-filter_complex', chain.replace(/;$/, ''), '-map', '[v]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an', walk,
]);
const endClip = join(build, 'end.mp4');
panelsToClip([{ png: endPng, dur: END, hold: 0 }], endClip);
const joined = join(build, 'joined.mp4');
const total = joinClips([{ file: walk, dur: tourDur }, { file: endClip, dur: END }], joined, XFADE);

// 3. Master: H.264 High 1080p30 + silent AAC LC.
const master = join(OUT, 'commonkit-demo-1080p.mp4');
ff([
  '-i', joined, '-f', 'lavfi', '-t', total.toFixed(3), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
  '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-preset', 'slow', '-crf', '18',
  '-maxrate', '10M', '-bufsize', '20M', '-c:a', 'aac', '-b:a', '128k', '-t', total.toFixed(3), '-movflags', '+faststart', master,
]);

// 4. X export: 1280×720, 30 fps, H.264 High, AAC LC (limits: ≤ 60 fps, ≤ 140 s, ≤ 512 MB).
const xfile = join(OUT, 'commonkit-demo-x-1280x720.mp4');
ff(['-i', master, '-vf', 'scale=1280:720:flags=lanczos', '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-preset', 'slow', '-b:v', '5M', '-maxrate', '6M', '-bufsize', '12M', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', xfile]);
const xd = probeDuration(xfile);
const xmb = statSync(xfile).size / 1e6;
if (xd > 140 || xmb > 512) throw new Error(`X export over the limits: ${xd.toFixed(1)} s, ${xmb.toFixed(1)} MB`);

// 5. Contact sheet: one frame per caption (middle of its window), plus the end card.
const sheetDir = dir('sheet');
const tiles = [...cues.map((c) => ({ at: (c.start + c.end) / 2, label: `${c.start.toFixed(1)}–${c.end.toFixed(1)} s`, text: c.text })),
  { at: total - 1, label: 'end card', text: '' }].map((t, i) => {
  const png = join(sheetDir, `${String(i).padStart(2, '0')}.png`);
  ff(['-ss', t.at.toFixed(2), '-i', master, '-frames:v', '1', '-vf', 'scale=640:360', png]);
  return { ...t, png };
});
const sheet = await newPage(browser, { viewport: { width: 2040, height: 200 } });
await sheet.goto(`file://${join(HERE, 'caption.html')}`); // file:// origin, so the tiles load
await sheet.setContent(`<!doctype html><style>
  body{margin:0;padding:24px;background:#f5f8fc;font-family:system-ui,sans-serif;color:#0a1526;width:1992px}
  h1{font-size:26px;margin:0 0 16px} .g{display:grid;grid-template-columns:repeat(3,640px);gap:20px 16px}
  img{width:640px;height:360px;display:block;border-radius:6px} p{margin:6px 0 0;font-size:15px;color:#4e5d76}
</style><h1>COMMONKIT demo · ${total.toFixed(1)} s · ${cues.length} captions · built ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</h1>
<div class="g">${tiles.map((t) => `<div><img src="file://${t.png}"><p><b>${t.label}</b></p></div>`).join('')}</div>`);
await sheet.waitForTimeout(400);
await sheet.screenshot({ path: join(OUT, 'commonkit-demo-contact-sheet.png'), fullPage: true });
await browser.close();

for (const f of [walk, endClip, joined]) rmrf(f);
rmrf(pngDir);
rmrf(sheetDir);
console.log(`[video] ${master} (${probeDuration(master).toFixed(1)} s, ${(statSync(master).size / 1e6).toFixed(1)} MB, ${W}×${H})`);
console.log(`[video] ${xfile} (${xd.toFixed(1)} s, ${xmb.toFixed(1)} MB, 1280×720)`);
console.log(`[video] ${SRT} (${cues.length} cues) · contact sheet ${join(OUT, 'commonkit-demo-contact-sheet.png')}`);
