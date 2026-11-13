// Assembles video/build/shots/*.mp4 into the two exports, with burned-in English subtitles and a contact sheet.
//   node scripts/video/assemble.mjs
// Subtitles: the SRT (video/commonkit-demo.en.srt) is generated from shots.mjs; this ffmpeg build has neither the
// `subtitles` nor the `drawtext` filter, so each cue is rendered once as a transparent PNG (caption.html, CK Sans)
// and overlaid for its time window. Silent AAC track for player/X compatibility; no music.
import { copyFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { H, HERE, OUT, SRT, W, dir, ff, joinClips, newPage, playwright, probeDuration, rmrf } from './lib.mjs';
import { SHOTS, XFADE, cues, timeline } from './shots.mjs';

const shotsDir = dir('shots');
const capDir = dir('captions');
dir('..', 'out');

const missing = SHOTS.filter((s) => !existsSync(join(shotsDir, `${s.id}.mp4`))).map((s) => s.id);
if (missing.length) {
  console.error(`[video] missing shots: ${missing.join(', ')} (run scripts/video/build.sh)`);
  process.exit(1);
}

const durations = Object.fromEntries(SHOTS.map((s) => [s.id, probeDuration(join(shotsDir, `${s.id}.mp4`))]));
const tl = timeline(durations);
const { list, srt } = cues(durations);
writeFileSync(SRT, srt);
copyFileSync(SRT, join(OUT, 'commonkit-demo.en.srt'));

// 1. Shots joined with short crossfades.
const base = join(dir(), 'base.mp4');
const total = joinClips(SHOTS.map((s) => ({ file: join(shotsDir, `${s.id}.mp4`), dur: durations[s.id] })), base, XFADE);

// 2. Caption PNGs.
const { chromium } = playwright();
const browser = await chromium.launch();
const page = await newPage(browser);
await page.goto(`file://${join(HERE, 'caption.html')}`);
const pngs = [];
for (const [i, c] of list.entries()) {
  await page.evaluate((text) => { document.getElementById('t').textContent = text; }, c.text);
  await page.evaluate(() => document.fonts.ready);
  const png = join(capDir, `${String(i).padStart(2, '0')}.png`);
  await page.screenshot({ path: png, omitBackground: true });
  pngs.push(png);
}

// 3. Master: captions overlaid in their windows, H.264 High 1080p30 + silent AAC LC.
const master = join(OUT, 'commonkit-demo-1080p.mp4');
let chain = '';
let prev = '[0:v]';
list.forEach((c, i) => {
  const label = i === list.length - 1 ? '[v]' : `[c${i}]`;
  chain += `${prev}[${i + 1}:v]overlay=0:0:enable='between(t,${c.start.toFixed(3)},${c.end.toFixed(3)})'${label};`;
  prev = label;
});
ff([
  '-i', base, ...pngs.flatMap((p) => ['-loop', '1', '-framerate', '30', '-t', total.toFixed(3), '-i', p]),
  '-f', 'lavfi', '-t', total.toFixed(3), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
  '-filter_complex', chain.replace(/;$/, ''), '-map', '[v]', '-map', `${pngs.length + 1}:a`,
  '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '30', '-preset', 'slow', '-crf', '18', '-maxrate', '10M', '-bufsize', '20M',
  '-c:a', 'aac', '-b:a', '128k', '-t', total.toFixed(3), '-movflags', '+faststart', master,
]);

// 4. X export: 1280×720, 30 fps, H.264 High, AAC LC (docs/VIDEO_SHOTLIST.md limits: ≤ 60 fps, ≤ 140 s, ≤ 512 MB).
const xfile = join(OUT, 'commonkit-demo-x-1280x720.mp4');
ff(['-i', master, '-vf', 'scale=1280:720:flags=lanczos', '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '30',
  '-preset', 'slow', '-b:v', '5M', '-maxrate', '6M', '-bufsize', '12M', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', xfile]);
const xd = probeDuration(xfile);
const xmb = statSync(xfile).size / 1e6;
if (xd > 140 || xmb > 512) throw new Error(`X export over the limits: ${xd.toFixed(1)} s, ${xmb.toFixed(1)} MB`);

// 5. Contact sheet: one frame from the middle of each shot (with its subtitle), labelled.
const sheetDir = dir('sheet');
const tiles = tl.map((s) => {
  const png = join(sheetDir, `${s.id}.png`);
  const firstCue = s.captions[0];
  const at = firstCue ? s.start + (firstCue[0] + firstCue[1]) / 2 : s.start + s.dur / 2;
  ff(['-ss', at.toFixed(2), '-i', master, '-frames:v', '1', '-vf', 'scale=640:360', png]);
  return { png, id: s.id, start: s.start, dur: s.dur, what: s.what };
});
const sheet = await newPage(browser, { viewport: { width: 2040, height: 200 } });
await sheet.goto(`file://${join(HERE, 'caption.html')}`);
await sheet.setContent(`<!doctype html><style>
  body{margin:0;padding:24px;background:#f5f8fc;font-family:system-ui,sans-serif;color:#0a1526;width:1992px}
  h1{font-size:26px;margin:0 0 16px} .g{display:grid;grid-template-columns:repeat(3,640px);gap:20px 16px}
  img{width:640px;height:360px;display:block;border-radius:6px} b{font-size:17px} p{margin:6px 0 0;font-size:15px;color:#4e5d76}
</style><h1>COMMONKIT demo · ${total.toFixed(1)} s · ${tiles.length} shots · built ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</h1>
<div class="g">${tiles.map((t) => `<div><img src="file://${t.png}"><p><b>${t.id}</b> · ${t.start.toFixed(1)}–${(t.start + t.dur).toFixed(1)} s (${t.dur.toFixed(1)} s)</p><p>${t.what}</p></div>`).join('')}</div>`);
await sheet.waitForTimeout(300);
await sheet.screenshot({ path: join(OUT, 'commonkit-demo-contact-sheet.png'), fullPage: true });
await browser.close();

rmrf(base);
rmrf(capDir);
rmrf(sheetDir);
console.log(`[video] ${master} (${probeDuration(master).toFixed(1)} s, ${(statSync(master).size / 1e6).toFixed(1)} MB, ${W}×${H})`);
console.log(`[video] ${xfile} (${xd.toFixed(1)} s, ${xmb.toFixed(1)} MB, 1280×720)`);
console.log(`[video] ${SRT} (${list.length} cues) · contact sheet ${join(OUT, 'commonkit-demo-contact-sheet.png')}`);
