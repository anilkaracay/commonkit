// Research helper: opens reference pages read-only and measures first-viewport typography and text/visual ratio.
// Usage (from landing/): node explore/v2/research.mjs <outdir>
import { chromium } from 'playwright';
const out = process.argv[2];
const urls = [
  'https://www.apple.com/macbook-air/',
  'https://www.apple.com/airpods-pro/',
  'https://linear.app/',
  'https://stripe.com/',
  'https://vercel.com/',
  'https://teenage.engineering/products/op-xy',
  'https://nothing.tech/',
  'https://www.raycast.com/',
];
const browser = await chromium.launch();
for (const [i, url] of urls.entries()) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${out}/${i}.png` });
    const m = await page.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0; };
      const pick = (el) => { const s = getComputedStyle(el); return { text: el.innerText.slice(0, 80), size: s.fontSize, weight: s.fontWeight, track: s.letterSpacing, lh: s.lineHeight, family: s.fontFamily.slice(0, 50), color: s.color }; };
      const heads = [...document.querySelectorAll('h1,h2,h3,p')].filter(vis).slice(0, 6).map(pick);
      // biggest text element in the first viewport
      let big = null, max = 0;
      for (const el of document.querySelectorAll('body *')) { if (!vis(el) || !el.childNodes.length) continue; const t=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()); if(!t) continue; const fs = parseFloat(getComputedStyle(el).fontSize); if (fs > max) { max = fs; big = pick(el); } }
      let media = 0; for (const el of document.querySelectorAll('img,video,canvas,svg,picture')) { if (!vis(el)) continue; const r = el.getBoundingClientRect(); const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0); const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0); if (w > 40 && h > 40) media += w * h; }
      const words = document.body.innerText.split(/\s+/).length;
      const range = document.createRange(); let fold = 0; const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) { if (!n.textContent.trim()) continue; range.selectNodeContents(n); const r = range.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0 && r.width) fold += n.textContent.trim().split(/\s+/).length; }
      return { big, heads, mediaShare: Math.min(1, media / (innerWidth * innerHeight)).toFixed(2), wordsAboveFold: fold, pageHeight: document.documentElement.scrollHeight, words };
    });
    console.log(JSON.stringify({ url, ...m }));
  } catch (e) { console.log(JSON.stringify({ url, error: String(e).slice(0, 120) })); }
  await page.close();
}
await browser.close();
