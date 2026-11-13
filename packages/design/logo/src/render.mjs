// Render a local HTML file to PNG with the Playwright that the landing package already pins.
// Usage: node render.mjs <in.html> <out.png> [width=1920] [height=1080] [scale=1]
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../../../landing/package.json', import.meta.url));
const { chromium } = require('playwright');

const [input, output, w = '1920', h = '1080', scale = '1'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: Number(scale) });
await page.goto(pathToFileURL(resolve(input)).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(150);
await page.screenshot({ path: output, fullPage: true });
await browser.close();
