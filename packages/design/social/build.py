"""Outline the existing CK Sans and Kept mark for crisp, reproducible social assets.
Run python3 packages/design/social/build.py, then node packages/design/social/render.mjs.
FontTools + Brotli are the same local dependencies used by logo/src/wordmark.py.
"""
from pathlib import Path
import re
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = Path(__file__).resolve().parent
BLUE, INK, PAPER = '#2453e0', '#0a1526', '#f5f8fc'
fonts = {}
def text(value, x, baseline, size, color=INK, weight=560, tracking=-.03, width=100):
    key=(weight,width)
    if key not in fonts:
        fonts[key]=instantiateVariableFont(TTFont(ROOT.parent/'fonts/ck-sans.woff2'), {'wght':weight,'wdth':width})
    f=fonts[key]; glyphs=f.getGlyphSet(); cmap=f.getBestCmap(); pen=SVGPathPen(glyphs); cursor=0
    scale=size/f['head'].unitsPerEm
    for ch in value:
        name=cmap[ord(ch)]
        glyphs[name].draw(TransformPen(pen,(scale,0,0,-scale,x+cursor,baseline)))
        cursor += f['hmtx'][name][0]*scale+size*tracking
    d=re.sub(r'-?\d+\.\d+',lambda m:f'{float(m.group()):.3f}'.rstrip('0').rstrip('.'),pen.getCommands())
    return f'<path fill="{color}" d="{d}"/>'
mark=re.search(r'<rect.*</svg>',(ROOT.parent/'logo/concepts/a/symbol.svg').read_text(),re.S).group().replace('</svg>','')
def symbol(x,y,size,color):
    return f'<g fill="{color}" transform="translate({x} {y}) scale({size/48})">{mark}</g>'
def svg(w,h,body,title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img"><title>{title}</title>{body}</svg>'

avatar=svg(1024,1024,f'<rect width="1024" height="1024" fill="{BLUE}"/>'+symbol(224,224,576,'#fff'),'COMMONKIT: four members keeping one shared machine')
(ROOT/'commonkit-avatar.svg').write_text(avatar)
# The left panel is deliberately quiet below y=350: X overlays the circular avatar there.
body=f'<rect width="1500" height="500" fill="{PAPER}"/><rect width="360" height="500" fill="{BLUE}"/>'
body+=symbol(100,86,160,'#fff')
body+=text('COMMONKIT',65,302,30,'#fff',600,.005,112)
body+=text('COMMUNITY-OWNED MACHINES',432,73,15,BLUE,600,.075)
body+=text('Shared things.',425,190,86,INK,600,-.045,112)
body+=text('Kept running.',425,286,86,INK,600,-.045,112)
body+='<path d="M432 338H1416" stroke="#c6d1e1" stroke-width="1"/>'
body+=text('Maintain the tools. Earn the access.',432,392,29,INK,520,-.018)
body+=text('commonkit.cayvox.com',432,454,18,'#4e5d76',400,0)
body+=text('Built on NEAR',1262,454,18,'#4e5d76',400,0)
(ROOT/'commonkit-x-header.svg').write_text(svg(1500,500,body,'COMMONKIT — Shared things. Kept running. Maintain the tools. Earn the access.'))
print('Outlined avatar and X header written')
