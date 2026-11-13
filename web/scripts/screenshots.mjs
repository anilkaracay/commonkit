// Screenshots of every app route at 390 px and 1440 px, read live from testnet.
// Usage: pnpm dev:web (port 5199: `pnpm --filter @commonkit/web exec vite --port 5199`), then
//   pnpm --filter @commonkit/web screenshots [base] [outDir]        ONLY=board,proof to limit
// One browser page per width navigates client-side, so the RPC cache is shared between routes
// (testnet RPC is rate-limited; reloading every route would re-read every view).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = (process.argv[2] ?? 'http://localhost:5199/app').replace(/\/$/, '');
const prefix = new URL(base).pathname.replace(/\/$/, '');
const out = process.argv[3] ?? path.join(here, '..', 'screenshots');
const only = process.env.ONLY?.split(',');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();

async function settle(page) {
  await page.waitForTimeout(400);
  await page.waitForFunction(() => !document.querySelector('[role="status"].animate-pulse'), null, { timeout: 300_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
}

async function go(page, url) {
  await page.evaluate((to) => {
    window.history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, `${prefix}${url}`);
  await settle(page);
}

const strip = (h) => (h ? h.slice(prefix.length) : null);

for (const width of [390, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: width === 390 ? 2 : 1 });
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('article a[href*="/a/"]', { timeout: 180_000 });
  await settle(page);

  // Discover live ids (task, reservation) from the asset pages instead of hard-coding them.
  const assets = await page.$$eval('article a[href*="/a/"]', (as) => as.map((a) => a.getAttribute('href')));
  const pick = (k, i) => strip(assets.find((h) => h.includes(k)) ?? assets[i]);
  const printer = pick('printer', 0);
  const laser = pick('laser', 1);
  const washer = pick('washer', 2);
  let task = null;
  let access = null;
  for (const a of [printer, laser, washer].filter(Boolean)) {
    await go(page, a);
    task ??= strip(await page.$eval('a[href*="/t/"]', (x) => x.getAttribute('href')).catch(() => null));
    access ??= strip(await page.$eval('a[href*="/access/"]', (x) => x.getAttribute('href')).catch(() => null));
  }
  const member = strip(await (async () => {
    await go(page, '/me');
    // Prefer a member who has earned cards (the demo maintainer), else the first one listed.
    const links = await page.$$eval('a[href*="/me?as="]', (xs) => xs.map((x) => [x.getAttribute('href'), x.textContent ?? '']));
    return (links.find(([, t]) => /\bAva\b/.test(t)) ?? links[0])?.[0] ?? null;
  })());

  const routes = [
    ['board', '/'],
    ['community', '/c/makerlab'],
    ['asset-printer', printer],
    ['asset-washer', washer],
    ['reserve', `${laser}/reserve`],
    ['access', access ?? `${laser}/access/0`],
    ...(task ? [['task', task]] : []),
    ['proof', '/proof'],
    ['agent', '/agent'],
    ['pilot', '/pilot'],
    ['me', '/me'],
    ...(member ? [['me-member', member]] : []),
    ['train', '/train'],
    ['approvals', '/approvals'],
    ['not-found', '/nope'],
  ];

  for (const [name, url] of routes) {
    if (!url || (only && !only.includes(name))) continue;
    await go(page, url);
    await page.evaluate(() => window.scrollTo(0, 0));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    await page.screenshot({ path: path.join(out, `${name}-${width}.png`), fullPage: true });
    console.log(`${name}-${width}.png ${url}${overflow ? '  HORIZONTAL OVERFLOW' : ''}`);
  }
  await page.close();
}
await browser.close();
