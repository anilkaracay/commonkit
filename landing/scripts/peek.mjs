// Dev helper: screenshot one URL of the running dev server. node explore/v2/peek.mjs <path> <out.png> [w] [h] [dpr] [theme]
import { chromium } from 'playwright';
const [, , p, out, w = '1200', h = '900', dpr = '1', scheme = 'light'] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr, colorScheme: scheme, reducedMotion: process.env.RM ? 'reduce' : 'no-preference' });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('pageerror:', String(e).slice(0, 400)));
await page.goto('' + (process.env.BASE ?? 'http://127.0.0.1:5180/') + '' + p, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true || document.readyState === 'complete', null, { timeout: 30000 });
await page.waitForTimeout(800);
await page.screenshot({ path: out, fullPage: process.env.FULL === '1', omitBackground: process.env.ALPHA === '1' });
console.log(await page.evaluate(() => (window.__stage ? JSON.stringify(window.__stage.anchors()) : 'no stage')));
await browser.close();
