"""Write the one-page review sheet for a logo concept (HTML; render.mjs turns it into the PNG).

Usage: python3 review.py <concept-dir> <context-dir> <out.html>
<context-dir> holds landing.png, app.png, endcard.png (from context.mjs, 2x) and fav16.png (favicon at 1x).
"""
import re
import sys
from pathlib import Path

concept, ctx, out = (Path(p).resolve() for p in sys.argv[1:4])
fonts = Path(__file__).resolve().parents[2] / 'fonts'


def inner(name: str) -> str:
    svg = (concept / name).read_text()
    return re.sub(r'<title>.*?</title>|<!--.*?-->', '', svg, flags=re.S)


def sized(name: str, h: int) -> str:
    return re.sub(r'width="[^"]*" height="[^"]*"', f'height="{h}" style="width:auto;display:block"', inner(name), count=1)


def fav(color: str) -> str:
    d = re.search(r' d="([^"]+)"', inner('favicon.svg')).group(1)
    return f'<svg viewBox="0 0 16 16" width="16" height="16" style="display:block;flex:none"><path fill="{color}" d="{d}"/></svg>'


# Construction drawing: symbol on its 48-unit grid, 8 px per unit, a faint line every 3-unit module.
U = 8
grid = ''.join(
    f'<line x1="{i * 3 * U}" y1="0" x2="{i * 3 * U}" y2="{48 * U}"/><line x1="0" y1="{i * 3 * U}" x2="{48 * U}" y2="{i * 3 * U}"/>'
    for i in range(17)
)
rects = re.findall(r'<rect [^>]*/>', inner('symbol.svg'))
sym_big = ''.join(rects)

html = f'''<!doctype html><html><head><meta charset="utf-8"><style>
@font-face {{ font-family: 'CK Sans'; src: url('{fonts}/ck-sans.woff2') format('woff2'); font-weight: 400 640; font-stretch: 100% 112%; }}
@font-face {{ font-family: 'Geist Mono'; src: url('{fonts}/geist-mono.woff2') format('woff2'); font-weight: 100 900; }}
:root {{ --ink:#0a1526; --navy:#0d1f3c; --cobalt:#2453e0; --ice:#f5f8fc; --ice1:#eaf0f8; --line:#dce3ee; --t2:#4e5d76; --t3:#5b6a83; }}
* {{ box-sizing: border-box; margin: 0; }}
body {{ width: 1920px; background: #fff; color: var(--ink); font-family: 'CK Sans', system-ui; padding: 56px 64px 64px; }}
header {{ display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 36px; }}
h1 {{ font-size: 34px; font-weight: 600; font-stretch: 108%; letter-spacing: -0.02em; }}
h1 span {{ color: var(--t3); font-weight: 450; }}
.note {{ font-size: 15px; color: var(--t3); }}
.top {{ display: grid; grid-template-columns: 560px 1fr; gap: 40px; }}
.panel {{ border-radius: 20px; background: var(--ice); position: relative; overflow: hidden; }}
.label {{ position: absolute; left: 24px; top: 20px; font-size: 13.5px; color: var(--t3); letter-spacing: .01em; }}
.construct {{ height: 640px; display: grid; place-items: center; }}
.construct svg {{ overflow: visible; }}
.construct .g line {{ stroke: #c6d1e1; stroke-width: 1; }}
.dim {{ font-family: 'Geist Mono'; font-size: 12px; fill: var(--t2); }}
.dimline {{ stroke: var(--t2); stroke-width: 1; }}
.idea {{ margin-top: 22px; font-size: 21px; line-height: 1.38; max-width: 540px; }}
.idea b {{ font-weight: 600; }}
.idea p + p {{ margin-top: 10px; font-size: 16px; color: var(--t2); line-height: 1.5; }}
.right {{ display: grid; grid-template-rows: 250px 250px 1fr; gap: 24px; }}
.lock {{ display: grid; place-items: center; }}
.white {{ background: #fff; border: 1px solid var(--line); }}
.dark {{ background: var(--navy); }}
.dark .label {{ color: #a9b9d3; }}
.row {{ display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }}
.sizes {{ display: flex; align-items: flex-end; justify-content: center; gap: 34px; padding: 56px 28px 0; height: 100%; align-content: center; flex-wrap: wrap; }}
.sizes figure {{ display: grid; gap: 10px; justify-items: start; }}
.sizes figcaption {{ font-family: 'Geist Mono'; font-size: 12px; color: var(--t3); }}
.px {{ image-rendering: pixelated; width: 64px; height: 64px; outline: 1px solid var(--line); }}
.tabs {{ padding: 56px 24px 0; display: grid; gap: 16px; align-content: center; height: 100%; }}
.strip {{ border-radius: 12px 12px 0 0; padding: 8px 10px 0; display: flex; gap: 6px; align-items: flex-end; height: 50px; }}
.tab {{ height: 40px; width: 300px; border-radius: 10px 10px 0 0; display: flex; align-items: center; gap: 10px; padding: 0 14px; font: 13.5px system-ui; white-space: nowrap; overflow: hidden; }}
.tab.off {{ width: 200px; opacity: .65; }}
.tab .x {{ margin-left: auto; opacity: .5; }}
.strip.l {{ background: #dfe5ee; }} .strip.l .tab {{ background: #fff; color: #1f2937; }} .strip.l .tab.off {{ background: transparent; }}
.strip.d {{ background: #202124; }} .strip.d .tab {{ background: #35363a; color: #e8eaed; }} .strip.d .tab.off {{ background: transparent; }}
.dot {{ width: 16px; height: 16px; border-radius: 50%; background: #9aa3af; flex: none; }}
h2 {{ font-size: 15px; font-weight: 520; color: var(--t3); margin: 44px 0 16px; }}
.ctx {{ display: grid; grid-template-columns: 600px 600px 1fr; gap: 24px; }}
.shot {{ height: 380px; border-radius: 16px; border: 1px solid var(--line); background-repeat: no-repeat; }}
.cap {{ font-size: 13.5px; color: var(--t3); margin-top: 10px; }}
</style></head><body>
<header>
  <h1>COMMONKIT logo <span>· Concept A, “Kept”</span></h1>
  <p class="note">For review. Mock placements only; nothing is integrated yet.</p>
</header>
<section class="top">
  <div>
    <div class="panel construct"><span class="label">Construction · 48-unit grid, 3-unit module</span>
      <svg width="{48 * U}" height="{48 * U}" viewBox="0 0 {48 * U} {48 * U}">
        <g class="g">{grid}</g>
        <g transform="scale({U})" fill="var(--cobalt)" fill-opacity=".92">{sym_big}</g>
        <g class="dimline"><line x1="{-22}" y1="0" x2="-22" y2="{9 * U}"/><line x1="-26" y1="0" x2="-18" y2="0"/><line x1="-26" y1="{9 * U}" x2="-18" y2="{9 * U}"/>
          <line x1="-22" y1="{12 * U}" x2="-22" y2="{36 * U}"/><line x1="-26" y1="{12 * U}" x2="-18" y2="{12 * U}"/><line x1="-26" y1="{36 * U}" x2="-18" y2="{36 * U}"/>
          <line x1="{12 * U}" y1="{48 * U + 22}" x2="{36 * U}" y2="{48 * U + 22}"/>
          <line x1="{36 * U}" y1="{48 * U + 14}" x2="{39 * U}" y2="{48 * U + 14}"/></g>
        <text class="dim" x="-30" y="{4.5 * U + 4}" text-anchor="end">9</text>
        <text class="dim" x="-30" y="{24 * U + 4}" text-anchor="end">24</text>
        <text class="dim" x="{24 * U}" y="{48 * U + 40}" text-anchor="middle">held square 24 = half the mark</text>
        <text class="dim" x="{37.5 * U}" y="{48 * U + 10}" text-anchor="middle">3</text>
      </svg>
    </div>
    <div class="idea"><p><b>Four identical parts keep one machine.</b> Each bar is a member, the same shape turned four times, with no one at the head. Together they go around the shared machine in the middle, the way upkeep comes back around.</p>
    <p>The only geometry is a 3-unit module, so the mark is pixel-exact at 16 and 32 px. Wordmark: CK Sans (Mona Sans, OFL) at width 112, weight 600, spaced by hand and outlined.</p></div>
  </div>
  <div class="right">
    <div class="panel lock white"><span class="label">Primary lockup</span>{sized('lockup.svg', 84)}</div>
    <div class="panel lock dark"><span class="label">On navy #0d1f3c</span>{sized('lockup-white.svg', 84)}</div>
    <div class="row">
      <div class="panel"><span class="label">Symbol sizes · 16 and 24 use hinted drawings</span>
        <div class="sizes">
          <figure>{sized('symbol-blue.svg', 64)}<figcaption>64</figcaption></figure>
          <figure>{sized('symbol-blue.svg', 32)}<figcaption>32</figcaption></figure>
          <figure>{sized('symbol-24.svg', 24)}<figcaption>24</figcaption></figure>
          <figure>{fav('#2453e0')}<figcaption>16</figcaption></figure>
          <figure><img class="px" src="{ctx}/fav16.png" alt=""><figcaption>16 at 1×, ×4</figcaption></figure>
          <figure>{sized('app-icon.svg', 64)}<figcaption>app tile</figcaption></figure>
        </div>
      </div>
      <div class="panel"><span class="label">Favicon in a browser tab (mock)</span>
        <div class="tabs">
          <div class="strip l"><div class="tab">{fav('#2453e0')}<span>COMMONKIT — machines that pay…</span><span class="x">✕</span></div><div class="tab off"><span class="dot"></span>New Tab</div></div>
          <div class="strip d"><div class="tab">{fav('#9cc3ff')}<span>COMMONKIT — machines that pay…</span><span class="x">✕</span></div><div class="tab off"><span class="dot"></span>New Tab</div></div>
        </div>
      </div>
    </div>
  </div>
</section>
<h2>In context · real pages captured in a browser with the wordmark swapped (mock, 1:1 at 1440 px)</h2>
<section class="ctx">
  <div><div class="shot" style="background-image:url('{ctx}/landing.png');background-size:1440px auto;background-position:-64px -6px"></div><p class="cap">Landing nav and hero</p></div>
  <div><div class="shot" style="background-image:url('{ctx}/app.png');background-size:1440px auto;background-position:-64px -2px"></div><p class="cap">App header (/app)</p></div>
  <div><div class="shot" style="background-image:url('{ctx}/endcard.png');background-size:676px auto;background-position:0 0"></div><p class="cap">Video end card (scaled from 1920 × 1080)</p></div>
</section>
</body></html>
'''
out.write_text(html)
print(out)
