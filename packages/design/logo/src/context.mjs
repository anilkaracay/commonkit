// Mock-only in-context captures: the live landing nav, the app header and the video end card, with the
// text wordmark swapped for a concept lockup inside the browser page. No repo file outside logo/ is changed.
// Usage: node context.mjs <concept-dir> <out-dir> [site=http://localhost:4391]
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../../../landing/package.json', import.meta.url));
const { chromium } = require('playwright');

const [dir, out, site = 'http://localhost:4391'] = process.argv.slice(2);
const lockup = await readFile(join(dir, 'lockup.svg'), 'utf8');
const endcard = resolve(new URL('../../../../scripts/video/endcard.html', import.meta.url).pathname);

const browser = await chromium.launch();
const shot = async (url, viewport, swap, clip, file) => {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
  await page.evaluate(swap, lockup);
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(out, file), clip });
  await page.close();
};

// Landing nav: the mark is 15 px caps; the lockup's cap height is matched to it (cap = 1/1.5 of the symbol).
await shot(
  `${site}/`,
  { width: 1440, height: 900 },
  (svg) => {
    const a = document.querySelector('header .mark');
    a.innerHTML = svg;
    const s = a.querySelector('svg');
    s.removeAttribute('width');
    s.style.cssText = 'height:17px;width:auto;display:block';
    a.style.cssText = 'display:flex;align-items:center;letter-spacing:0';
  },
  { x: 0, y: 0, width: 1440, height: 560 },
  'landing.png',
);

// App header: the lockup replaces the 15 px COMMONKIT text; the quiet "testnet" tag stays.
await shot(
  `${site}/app/`,
  { width: 1440, height: 900 },
  (svg) => {
    const a = document.querySelector('header a[aria-label="COMMONKIT board"]');
    const span = a.querySelector('span');
    const holder = document.createElement('span');
    holder.innerHTML = svg;
    const s = holder.querySelector('svg');
    s.removeAttribute('width');
    s.style.cssText = 'height:17px;width:auto;display:block;transform:translateY(3px)';
    span.replaceWith(holder);
  },
  { x: 0, y: 0, width: 1440, height: 420 },
  'app.png',
);

// Video end card (1920 x 1080): the 30 px tracked caps become a 46 px tall lockup.
await shot(
  pathToFileURL(endcard).href + '?site=demo%20link&repo=repository%20link',
  { width: 1920, height: 1080 },
  (svg) => {
    const m = document.querySelector('.mark');
    m.innerHTML = svg;
    const s = m.querySelector('svg');
    s.removeAttribute('width');
    s.style.cssText = 'height:46px;width:auto;display:block';
  },
  { x: 0, y: 0, width: 1920, height: 1080 },
  'endcard.png',
);
await browser.close();
