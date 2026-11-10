/**
 * One screenshot per landing section at 390 and 1440 (vite preview on :4180 by default).
 * The sticky how-it-works section is captured once per active step (viewport shots).
 * Usage: tsx scripts/sections.ts [--url http://localhost:4180/] [--motion]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const urlArg = args.indexOf('--url');
const base = urlArg >= 0 ? args[urlArg + 1]! : 'http://localhost:4180/';
const out = resolve(import.meta.dirname, '../screenshots');
mkdirSync(out, { recursive: true });

const SECTIONS: [string, string][] = [
  ['01-nav', '.nav'],
  ['02-hero', '.hero'],
  ['03-ticker', '.ticker'],
  ['04-problem', 'section[aria-labelledby="problem-title"]'],
  ['05-idea', '.idea'],
  ['07-care', '#upkeep'],
  ['08-money', '.money'],
  ['09-why', '#why'],
  ['10-agent', '.agent'],
  ['11-near', '.near'],
  ['12-proof', '#proof'],
  ['13-final', '.final'],
  ['13-footer', '.foot'],
];

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

const browser = await chromium.launch();
for (const w of [390, 1440]) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: w < 600 ? 844 : 900 },
    deviceScaleFactor: w < 600 ? 2 : 1,
    reducedMotion: args.includes('--motion') ? 'no-preference' : 'reduce',
  });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await settle(page);
  for (const [name, sel] of SECTIONS) {
    if (name === '02-hero') await page.addStyleTag({ content: '.nav{visibility:hidden}' });
    const el = page.locator(sel).first();
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await el.screenshot({ path: resolve(out, `${name}-${w}.png`) });
  }
  // sticky steps: one viewport shot per step (desktop); the whole section on phones
  await page.addStyleTag({ content: '.nav{visibility:visible}' });
  if (w >= 900) {
    for (let i = 0; i < 4; i++) {
      await page.evaluate((k) => {
        const t = document.querySelectorAll('.step-text')[k] as HTMLElement;
        window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - window.innerHeight / 2 + t.offsetHeight / 2);
      }, i);
      await page.waitForTimeout(700);
      await page.screenshot({ path: resolve(out, `06-how-step${i + 1}-${w}.png`) });
    }
  } else {
    await page.locator('#how').screenshot({ path: resolve(out, `06-how-${w}.png`) });
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(w, overflow > 0 ? `HORIZONTAL OVERFLOW ${overflow}px` : 'no horizontal overflow');
  await ctx.close();
}
await browser.close();
