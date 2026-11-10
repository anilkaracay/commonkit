/**
 * Social card public/og.png (1200 × 630) and the favicons, in the D-030 style: white page, ink headline in
 * CK Sans, the printer poster from the live scene. Numbers on the card come from the testnet snapshot.
 * Usage: tsx scripts/og.ts   (run scripts/posters.ts first)
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { color } from '@commonkit/design';
import { loadData } from '../render/data.ts';
import { utcStamp } from '../src/lib/format.ts';

const root = resolve(import.meta.dirname, '..');
const design = resolve(root, '../packages/design');
const b64 = (p: string) => readFileSync(p).toString('base64');
const d = loadData();
const printer = d.snapshot.assets.find((a) => a.asset_type === 'printer_3d')!;
const fixed = (y: string) => { const s = 10n ** 22n, r = (BigInt(y) + s / 2n) / s; return `${r / 100n}.${(r % 100n).toString().padStart(2, '0')}`; };

const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${color.cobalt600}"/><rect x="9" y="9" width="14" height="14" rx="3.5" fill="${color.white}"/></svg>`;
writeFileSync(resolve(root, 'public/favicon.svg'), MARK + '\n');

const fonts = `@font-face{font-family:'CK Sans';src:url(data:font/woff2;base64,${b64(resolve(design, 'fonts/ck-sans.woff2'))}) format('woff2');font-weight:400 640;font-stretch:100% 112%}`;
const card = `<!doctype html><html><head><style>${fonts}
*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;background:${color.white};font-family:'CK Sans';color:${color.ink};display:grid;grid-template-columns:560px 640px;overflow:hidden}
.l{padding:64px 0 56px 72px;display:flex;flex-direction:column}
.mark{font-stretch:112%;font-weight:640;letter-spacing:.09em;font-size:20px}
h1{margin-top:auto;font-stretch:112%;font-weight:560;font-size:72px;line-height:.98;letter-spacing:-.042em}
p{margin-top:24px;font-size:22px;color:${color.slate600}}
.f{margin-top:36px;font-size:16px;color:${color.slate500};display:flex;gap:10px;align-items:center}
.f i{width:10px;height:10px;border:1.6px solid ${color.slate600};border-radius:2px}
img{width:640px;height:640px;margin-top:-10px}
</style></head><body><div class="l"><span class="mark">COMMONKIT</span><h1>Machines that pay their own upkeep.</h1>
<p>Float ${fixed(printer.ledger.float_free)} / ${fixed(printer.ledger.float_cap)} NEAR · keyless · NEAR testnet</p>
<span class="f"><i></i>Simulated device · state read ${utcStamp(d.snapshot.taken_at)}</span></div>
<img src="data:image/webp;base64,${b64(resolve(root, 'public/posters/hero-1200.webp'))}" alt=""></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(card, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: resolve(root, 'public/og.png') });
for (const [file, size] of [['favicon-32.png', 32], ['apple-touch-icon.png', 180]] as const) {
  const p = await browser.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${MARK}`);
  await p.screenshot({ path: resolve(root, 'public', file), omitBackground: true });
  await p.close();
}
await browser.close();
console.log('og.png, favicon.svg, favicon-32.png, apple-touch-icon.png written');
