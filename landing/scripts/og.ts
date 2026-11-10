/**
 * Renders the social card (public/og.png, 1200 × 630) and the favicon PNGs from the built CSS and the same
 * build-time data as the page. Run after `vite build`: tsx scripts/og.ts
 */
import { chromium } from 'playwright';
import { readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadData } from '../render/data.ts';
import { art, LOGO_MARK } from '../render/art.ts';
import { machineCard } from '../src/lib/cards.ts';

const root = resolve(import.meta.dirname, '..');
const assets = resolve(root, 'dist/assets');
const css = readdirSync(assets).find((f) => /^style-.*\.css$/.test(f) || /^index-.*\.css$/.test(f));
if (!css) throw new Error('run vite build first');
const d = loadData();
const a = d.snapshot.assets.find((x) => x.asset_type === 'printer_3d')!;
const p = d.profiles.find((x) => x.asset_type === 'printer_3d')!;
const card = machineCard(a, {
  titles: Object.fromEntries(p.rules.map((r) => [r.rule_id, r.title])),
  rightValidityDays: p.right_validity_days,
  icon: art('printer', ''),
  live: false,
  at: d.snapshot.taken_at,
});

const og = `<!doctype html><html data-hero="a"><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/${css}">
<style>
  body { width: 1200px; height: 630px; overflow: hidden; margin: 0; }
  .og { position: relative; height: 630px; padding: 48px 64px 72px; display: grid; grid-template-columns: 1fr 390px; gap: 40px; align-items: center;
    background: radial-gradient(rgba(240,236,227,.09) 1px, transparent 1.2px) 0 0 / 26px 26px, radial-gradient(60% 70% at 78% 50%, rgba(232,169,72,.22), transparent 70%), var(--ink-0); }
  .og .brand { margin: 0 0 34px; font-size: 22px; } .og .mark { width: 34px; height: 34px; }
  .og h1 { font-size: 60px; } .og h1 .line { text-wrap: nowrap; }
  .og .sub { margin-top: 24px; font-size: 20px; color: var(--fg-2); max-width: 30ch; }
  .og .og-foot { position: absolute; left: 64px; bottom: 34px; font: 500 15px var(--f-mono); color: var(--fg-3); }
  .og .mcard { transform: rotate(-2deg); } .og .mcard-foot { display: none; }
</style></head><body>
<div class="og"><div><div class="brand">${LOGO_MARK}<span>COMMONKIT</span></div>
<h1 class="display"><span class="line">Shared things that pay</span><span class="line grad">for their own upkeep.</span></h1>
<p class="sub">Every shared machine gets its own keyless NEAR account. Its fees fund its upkeep.</p></div>
<div>${card}</div><p class="og-foot">NEAR testnet · simulated assets · built at NEAR HACKATHON 2026</p></div></body></html>`;

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0d0e10"/>${LOGO_MARK.replace(/<svg[^>]*>|<\/svg>/g, '')
  .replace('class="mark-tag"', 'fill="#e8a948"')
  .replace('class="mark-hole"', 'fill="#0d0e10"')
  .replace('class="mark-line"', 'stroke="#1a1205" stroke-width="1.8" stroke-linecap="round" fill="none"')}</svg>`;
writeFileSync(resolve(root, 'public/favicon.svg'), favicon + '\n');

// The built page must be served (vite preview, default :4180) so the CSS and font URLs resolve.
const origin = process.env.LANDING_URL ?? 'http://localhost:4180/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(origin);
await page.setContent(og, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
await page.screenshot({ path: resolve(root, 'public/og.png') });
for (const [size, name] of [[32, 'favicon-32.png'], [180, 'apple-touch-icon.png']] as const) {
  const fp = await browser.newPage({ viewport: { width: size, height: size } });
  await fp.setContent(`<style>body{margin:0}svg{width:${size}px;height:${size}px;display:block}</style>${favicon}`);
  await fp.screenshot({ path: resolve(root, `public/${name}`), omitBackground: true });
}
await browser.close();
console.log('wrote public/og.png, favicon.svg, favicon-32.png, apple-touch-icon.png');
