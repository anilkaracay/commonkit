// Records the demo video as one continuous browser walkthrough (D-038): the landing page, a click on "Open the app",
// then the real app pages read live from NEAR testnet, plus two real testnet transactions on testnet.near.rocks.
// A visible cursor moves to everything that is clicked, and every click is a real click. The browser bar (URL) and the
// captions are overlaid by assemble.mjs from the timeline this script writes.
//   node scripts/video/tour.mjs
// Output: video/build/tour.mp4 (1920×1080: 56 px bar, page, 150 px caption band), video/build/tour.json (captions, URLs),
// video/build/end.png (end card). Frames are piped straight into ffmpeg (no PNGs on disk).
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isIP } from 'node:net';
import { FPS, HERE, dir, playwright, settle, startSite } from './lib.mjs';
import { CHAPTERS, PRINTER, TX } from './story.mjs';

const BAR = 56; // browser bar height in the final frame
const BAND = 150; // caption band under the page
const VIEW = { width: 1280, height: 583 }; // Larger readable UI: 1.5× → 1920px wide; page fitted to 874px
const PAGE_H = 1080 - BAR - BAND;
const BUILD = dir();
const OUT = join(BUILD, 'tour.mp4');
const GAP = 0.35; // breath between narration lines
const VOICE = JSON.parse(readFileSync(join(BUILD, 'voice/durations.json'), 'utf8')); // scripts/video/voice.py

// Cursor and highlight, drawn in the page so screenshots include them. Re-created after every full navigation.
const OVERLAY_JS = `(() => {
  const el = (id, html, css) => {
    let e = document.getElementById(id);
    if (!e) { e = document.createElement('div'); e.id = id; e.innerHTML = html; e.style.cssText = css; document.documentElement.appendChild(e); }
    return e;
  };
  window.__ckCursor = (x, y, ring) => {
    const c = el('ck-cursor',
      '<span></span><svg width="24" height="28" viewBox="0 0 24 28"><path d="M2 2v20.5l5.6-5.2 4.2 9 3.8-1.7-4.1-8.8H19z" fill="#0a1526" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>',
      'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;will-change:transform');
    c.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    const r = c.querySelector('span');
    r.style.cssText = 'position:absolute;left:-17px;top:-17px;width:34px;height:34px;border-radius:50%;border:3px solid #2453e0;'
      + 'opacity:' + (ring > 0 ? (1 - ring).toFixed(3) : 0) + ';transform:scale(' + (0.4 + ring * 0.9).toFixed(3) + ')';
  };
  window.__ckMark = (box, a) => {
    const m = el('ck-mark', '', 'position:absolute;z-index:2147483646;pointer-events:none;border:3px solid #2453e0;border-radius:8px;'
      + 'box-shadow:0 0 0 7px rgba(36,83,224,.12)');
    if (!box) { m.style.opacity = 0; return; }
    Object.assign(m.style, { left: box.x - 8 + 'px', top: box.y - 6 + 'px', width: box.w + 16 + 'px', height: box.h + 12 + 'px', opacity: a });
  };
})();`;

const ease = (p) => p * p * (3 - 2 * p);

class Recorder {
  constructor(page, base) {
    this.page = page;
    this.base = base;
    this.frame = 0;
    this.cursor = { x: VIEW.width * 0.86, y: VIEW.height * 0.82 };
    this.ring = 0;
    this.mark = null;
    this.cues = [];
    this.bars = [];
    this.tick = null; // per-frame hook (the landing's 3D renders a deterministic frame)
    this.ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-vf', `scale=1920:${PAGE_H}:flags=lanczos,pad=1920:1080:0:${BAR}:color=0xf5f8fc,drawbox=x=0:y=${BAR + PAGE_H}:w=1920:h=1:color=0xd9dfe8:t=fill,setsar=1`,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
  }

  get t() {
    return this.frame / FPS;
  }

  async draw() {
    if (this.tick) await this.tick(this.frame);
    await this.page.evaluate(([c, ring, mark]) => {
      window.__ckCursor?.(c.x, c.y, ring);
      if (mark) window.__ckMark?.(mark.box, mark.a);
      else window.__ckMark?.(null, 0);
    }, [this.cursor, this.ring, this.mark]);
    return this.page.screenshot({ type: 'jpeg', quality: 93 });
  }

  async emit(buf, n = 1) {
    for (let i = 0; i < n; i++) {
      if (!this.ff.stdin.write(buf)) await once(this.ff.stdin, 'drain');
    }
    this.frame += n;
  }

  /** Keep the current picture for `sec` (one screenshot, repeated, unless a per-frame hook animates the page). */
  async hold(sec) {
    const n = Math.round(sec * FPS);
    if (this.tick) for (let i = 0; i < n; i++) await this.emit(await this.draw());
    else await this.emit(await this.draw(), n);
  }

  async move(x, y, sec = 0.7) {
    const from = { ...this.cursor };
    const n = Math.max(1, Math.round(sec * FPS));
    for (let i = 1; i <= n; i++) {
      const p = ease(i / n);
      this.cursor = { x: from.x + (x - from.x) * p, y: from.y + (y - from.y) * p };
      await this.emit(await this.draw());
    }
  }

  async scrollTo(y, sec = 1) {
    const from = await this.page.evaluate(() => window.scrollY);
    const max = await this.page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    const to = Math.max(0, Math.min(y, max));
    const n = Math.max(1, Math.round(sec * FPS));
    for (let i = 1; i <= n; i++) {
      await this.page.evaluate((v) => window.scrollTo(0, v), from + (to - from) * ease(i / n));
      await this.emit(await this.draw());
    }
  }

  /** Move to the element, show a click ring, then really click it. `wait` runs after the click (not recorded). */
  async click(locator, { wait, dx = 0.5, dy = 0.5, sec = 0.8 } = {}) {
    await locator.scrollIntoViewIfNeeded();
    const b = await locator.boundingBox();
    if (!b) throw new Error(`[video] nothing to click: ${locator}`);
    const x = b.x + b.width * dx;
    const y = b.y + b.height * dy;
    await this.move(x, y, sec);
    await this.hold(0.15);
    for (let i = 1; i <= 9; i++) {
      this.ring = i / 9;
      await this.emit(await this.draw());
    }
    this.ring = 0;
    await this.page.mouse.click(x, y);
    if (wait) await wait();
    await this.overlays();
  }

  async overlays() {
    await this.page.evaluate(OVERLAY_JS);
    this.setBar();
  }

  setBar() {
    const u = new URL(this.page.url());
    const local = u.origin === this.base;
    for (const k of ['3d', 'live', 'demo']) u.searchParams.delete(k);
    const host = local ? (process.env.VIDEO_HOST ?? u.host) : u.host;
    const path = u.pathname + (u.searchParams.size ? `?${u.searchParams}` : '');
    const last = this.bars.at(-1);
    if (last && last.host === host && last.path === path) return;
    if (last) last.end = this.t;
    this.bars.push({ start: this.t, end: null, host, path });
  }

  /** Wait until the narration of the current line has finished (plus a short breath). */
  async settleVoice() {
    const last = this.cues.at(-1);
    if (!last || last.end !== null) return;
    const until = last.start + last.voiceDur + GAP;
    if (this.t < until) await this.hold(until - this.t);
  }

  /** Start a caption + narration line once the previous one has been spoken; the previous caption ends here. */
  async say(key, line, chapter = null) {
    await this.settleVoice();
    console.log(`[video] ${key} at ${this.t.toFixed(1)} s`);
    const last = this.cues.at(-1);
    if (last && last.end === null) last.end = this.t;
    const voiceDur = VOICE[key];
    if (voiceDur === undefined) throw new Error(`[video] no narration for ${key}: run scripts/video/voice.py (build.sh does)`);
    this.cues.push({ start: this.t, end: null, text: line.text, chapter, voice: key, voiceDur });
  }

  /** Let the narration finish, then clear the caption (before leaving a page). */
  async quiet() {
    await this.settleVoice();
    const last = this.cues.at(-1);
    if (last && last.end === null) last.end = this.t;
  }

  async finish() {
    await this.quiet();
    const last = this.bars.at(-1);
    if (last) last.end = this.t;
    this.ff.stdin.end();
    await once(this.ff, 'exit');
    return { fps: FPS, duration: this.t, cues: this.cues, bars: this.bars };
  }
}

/** Document-space box of the first visible text node matching `re` (the explorer has no stable selectors). */
function textBox(page, re) {
  return page.evaluate((src) => {
    const rx = new RegExp(src);
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!rx.test(n.textContent ?? '')) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      const b = r.getBoundingClientRect();
      if (b.height > 0) return { x: b.left + window.scrollX, y: b.top + window.scrollY, w: b.width, h: b.height };
    }
    return null;
  }, re.source);
}

async function boxOf(locator) {
  return locator.evaluate((el) => {
    const b = el.getBoundingClientRect();
    return { x: b.left + window.scrollX, y: b.top + window.scrollY, w: b.width, h: b.height };
  });
}

const heading = (page, name) => page.getByRole('heading', { name, exact: true }).first();

/** A real testnet tx on NEAR Rocks with its failed results expanded; returns the box of `focus`. */
async function openTx(rec, hash, focus) {
  const { page } = rec;
  await page.goto(`https://testnet.near.rocks/tx/${hash}`, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.waitForSelector('text=Receipts', { timeout: 60_000 });
  for (let i = 0; i < 8; i++) {
    const arrow = page.locator('.bg-red-50 .w-rjv-arrow[style*="-90deg"]').first();
    if (!(await arrow.count())) break;
    await arrow.click();
    await page.waitForTimeout(350);
  }
  const shortened = page.locator('.bg-red-50 .w-rjv-value', { hasText: '...' });
  for (let i = 0; i < Math.min(4, await shortened.count()); i++) {
    await shortened.nth(i).click();
    await page.waitForTimeout(300);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await rec.overlays();
  const box = await textBox(page, focus);
  if (!box) throw new Error(`[video] ${focus} not found on the explorer page for ${hash}`);
  return box;
}

async function back(rec, ready) {
  await rec.page.goBack({ waitUntil: 'domcontentloaded' });
  await ready();
  await settle(rec.page);
  await rec.overlays();
}

async function appReady(page, selector) {
  await page.waitForSelector(selector, { timeout: 180_000 });
  await settle(page);
}

async function fadeMark(rec, box, sec = 0.4) {
  const n = Math.round(sec * FPS);
  for (let i = 1; i <= n; i++) {
    rec.mark = { box, a: i / n };
    await rec.emit(await rec.draw());
  }
}

async function main() {
  const remote = process.env.VIDEO_BASE_URL;
  if (remote && new URL(remote).protocol !== 'https:') throw new Error('VIDEO_BASE_URL must use HTTPS');
  const site = remote ? { base: new URL(remote).origin, close() {} } : await startSite();
  // Optional verified public DNS result when the recording host still caches NXDOMAIN.
  // Only resolution changes; HTTPS certificate validation stays enabled.
  const dnsAddress = process.env.VIDEO_DNS_ADDRESS;
  if (dnsAddress && (!remote || !isIP(dnsAddress))) throw new Error('VIDEO_DNS_ADDRESS requires a hosted URL and an IP address');
  const { chromium } = playwright();
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist',
    ...(dnsAddress ? [`--host-resolver-rules=MAP ${new URL(site.base).hostname} ${dnsAddress}`] : []),
  ] });
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1.5, reducedMotion: 'no-preference' });
  await context.addInitScript(OVERLAY_JS);
  const page = await context.newPage();
  const rec = new Recorder(page, site.base);
  const C = CHAPTERS;
  const line = (ch, i, titleOf = null) => rec.say(`${ch}-${i}`, C[ch].lines[i], titleOf ? C[titleOf].title : null);

  try {
    // Show the product action immediately. No wallet signature is staged.
    await page.goto(`${site.base}/app/a/${PRINTER}/reserve/`, { waitUntil: 'networkidle' });
    await appReady(page, 'fieldset button');
    await rec.overlays();
    await rec.hold(0.2);
    await line('book', 0, 'book');
    await page.getByRole('spinbutton', { name: 'Slots', exact: true }).fill('2');
    await rec.click(page.locator('fieldset button:not([disabled])').nth(3), { sec: 0.6 });
    const total = page.getByText('Attached exactly').first();
    await rec.scrollTo((await boxOf(total)).y - 270, 0.6);
    await rec.quiet();
    const booked = await openTx(rec, TX.reserve, /reservation_confirmed/);
    await rec.scrollTo(booked.y - 140, 0.3);
    await line('book', 1, 'book');
    await fadeMark(rec, booked, 0.25);
    await rec.quiet();
    rec.mark = null;

    // The rule opens work; another member approves it.
    await back(rec, () => page.waitForSelector('fieldset button', { timeout: 120_000 }));
    await rec.click(page.locator(`main a[href$="/a/${PRINTER}"]`).first(), { sec: 0.6, wait: () => appReady(page, 'text=Upkeep') });
    await line('upkeep', 0, 'upkeep');
    const upkeep = await boxOf(heading(page, 'Upkeep'));
    await rec.scrollTo(upkeep.y - 90, 0.8);
    await line('upkeep', 1, 'upkeep');
    const tasks = await boxOf(heading(page, 'Tasks'));
    await rec.scrollTo(tasks.y - 90, 0.7);
    await rec.click(page.locator(`a[href$="/t/${PRINTER}/0"]`).first(), { sec: 0.6, wait: () => appReady(page, 'text=Why the machine asked') });
    await line('task', 0, 'task');
    const progress = await boxOf(heading(page, 'Progress'));
    await rec.scrollTo(progress.y - 90, 0.7);
    const approved = page.getByText('Approved by an independent verifier').first();
    const approvalBox = await boxOf(approved);
    await fadeMark(rec, approvalBox, 0.25);
    await rec.quiet();
    rec.mark = null;
    await line('earn', 0, 'earn');
    const earned = await boxOf(heading(page, 'Cards earned'));
    await rec.scrollTo(earned.y - 80, 0.7);
    await rec.quiet();

    // Close the economic loop: an earned right removes the usage fee, not the deposit.
    const redeemed = await openTx(rec, TX.redeem, /reservation_confirmed/);
    await rec.scrollTo(redeemed.y - 100, 0.3);
    await line('redeem', 0, 'redeem');
    await fadeMark(rec, redeemed, 0.25);
    await rec.quiet();
    rec.mark = null;
    await back(rec, () => page.waitForSelector('text=Cards earned', { timeout: 120_000 }));
    const consumed = page.getByRole('figure', { name: 'Usage right right-3, Consumed', exact: true });
    await consumed.scrollIntoViewIfNeeded();
    await line('redeem', 1, 'redeem');
    await fadeMark(rec, await boxOf(consumed), 0.25);
    await rec.quiet();
    rec.mark = null;

    // Machine-level budget, then a separate unmistakable governance beat.
    await rec.click(page.locator(`main a[href$="/a/${PRINTER}"]`).first(), { sec: 0.6, wait: () => appReady(page, 'text=Operating float') });
    await line('money', 0, 'money');
    const money = await boxOf(heading(page, 'Money'));
    await rec.scrollTo(money.y - 90, 0.8);
    await line('money', 1, 'money');
    const swept = page.getByText('Swept to DAO', { exact: true }).first();
    await fadeMark(rec, await boxOf(swept), 0.25);
    await rec.quiet();
    rec.mark = null;
    await page.goto(`${site.base}/app/c/makerlab/`, { waitUntil: 'networkidle' });
    await appReady(page, 'text=opened by the machine');
    await rec.overlays();
    const proposal = page.locator('li').filter({ has: page.getByText('#10', { exact: true }) }).filter({ hasText: 'opened by the machine' }).first();
    await proposal.scrollIntoViewIfNeeded();
    await line('proposal', 0, 'proposal');
    await fadeMark(rec, await boxOf(proposal), 0.25);
    await line('proposal', 1, 'proposal');
    await rec.quiet();
    rec.mark = null;

    await rec.scrollTo(0, 0.6);
    await rec.click(page.locator('header a', { hasText: /^Proof$/ }).first(), { sec: 0.6, wait: () => appReady(page, 'text=checks pass') });
    await line('proof', 0, 'proof');
    await rec.hold(0.2);
    await line('proof', 1, 'proof');
    await rec.quiet();

    const timeline = await rec.finish();
    writeFileSync(join(BUILD, 'tour.json'), `${JSON.stringify(timeline, null, 2)}\n`);

    // End card (full frame, no browser bar).
    const end = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const q = new URLSearchParams({ site: process.env.VIDEO_SITE_URL ?? 'commonkit.cayvox.com', repo: process.env.VIDEO_REPO_URL ?? 'github.com/anilkaracay/commonkit' });
    await end.goto(`file://${join(HERE, 'endcard.html')}?${q}`);
    await end.evaluate(() => document.fonts.ready);
    await end.screenshot({ path: join(BUILD, 'end.png') });
    console.log(`[video] tour recorded: ${timeline.duration.toFixed(1)} s, ${timeline.cues.length} captions, ${timeline.bars.length} URLs`);
  } catch (error) {
    await page.screenshot({ path: join(BUILD, 'recording-error.png'), fullPage: true }).catch(() => {});
    console.error(`[video] failed at ${page.url()}`);
    throw error;
  } finally {
    await browser.close();
    site.close();
  }
}

await main();
