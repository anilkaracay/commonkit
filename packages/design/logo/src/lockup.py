"""Assemble a horizontal lockup (symbol + outlined wordmark) as a standalone SVG.

Usage: python3 lockup.py <symbol.svg> <out.svg> <symbol-fill> <word-fill> [size-ratio=1.5] [gap-units=15] [wdth=112] [wght=600] [tracking=70]
size-ratio: symbol height / cap height. gap-units: space between symbol and wordmark in 48-grid units of the symbol.
The symbol is centred on the cap height. Output is in font units (1000 upm), cropped to the ink.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from wordmark import build  # noqa: E402

sym_path, out, sym_fill, word_fill = sys.argv[1:5]
ratio = float(sys.argv[5]) if len(sys.argv) > 5 else 1.5
gap_u = float(sys.argv[6]) if len(sys.argv) > 6 else 15
wdth, wght, tr = (float(v) for v in (sys.argv[7:10] if len(sys.argv) > 9 else (112, 600, 70)))

wm = build(wdth, wght, tr)
H = wm['capHeight']
S = round(H * ratio)
k = S / 48
gap = gap_u * k
body = re.search(r'<svg[^>]*>(.*)</svg>', Path(sym_path).read_text(), re.S).group(1)
rects = '\n    '.join(re.findall(r'<rect [^>]*/>', body))
top = (H - S) / 2  # symbol centred on caps; negative = symbol rises above cap line
y0 = min(0, top)
height = max(H, top + S) - y0
width = S + gap + wm['width']
f = lambda v: f'{v:.1f}'.rstrip('0').rstrip('.')
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {f(y0)} {f(width)} {f(height)}" width="{f(width / 10)}" height="{f(height / 10)}">
  <title>COMMONKIT</title>
  <g fill="{sym_fill}" transform="translate(0 {f(top)}) scale({k:.5f})">
    {rects}
  </g>
  <path fill="{word_fill}" transform="translate({f(S + gap)} 0)" d="{wm['d']}"/>
</svg>
'''
Path(out).write_text(svg)
print(f'{out}: symbol {S}u, gap {f(gap)}u, wordmark {wm["width"]}u, total {f(width)} x {f(height)}')
