// Screenshots for the art-direction exploration.
// Usage (from landing/): node explore/shoot.mjs [a b c]
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['a', 'b', 'c'];
const sizes = [
  { w: 1440, h: 900, dpr: 1 },
  { w: 390, h: 844, dpr: 2 },
];

const browser = await chromium.launch();
for (const d of dirs) {
  for (const s of sizes) {
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr, reducedMotion: 'reduce' });
    await page.goto('file://' + path.join(here, d, 'index.html'));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const out = (part) => path.join(here, 'shots', `${d}-${part}-${s.w}.png`);
    await page.screenshot({ path: out('hero') });
    await page.locator('#flow').screenshot({ path: out('section') });
    await page.locator('#card').screenshot({ path: out('card') });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (overflow > 0) console.warn(`${d} @${s.w}: horizontal overflow ${overflow}px`);
    await page.close();
  }
  console.log('shot', d);
}
await browser.close();
