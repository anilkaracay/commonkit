"""Compose original vector brand assets over the original, text-free device scene.
No generated lettering or raster retouching: the scene is preserved byte for byte.
"""
from pathlib import Path
from base64 import b64encode
import re
import sys
from build import ROOT, text, svg, fonts

def width(value,size,weight=560,tracking=-.03,stretch=100):
    # text() initializes the same font instance used by outlined lettering.
    text(value,0,0,size,weight=weight,tracking=tracking,width=stretch)
    f=fonts[(weight,stretch)]; cmap=f.getBestCmap();scale=size/f['head'].unitsPerEm
    return sum(f['hmtx'][cmap[ord(c)]][0]*scale+size*tracking for c in value)-size*tracking

def centered(value,baseline,size,color='#0a1526',weight=560,tracking=-.03,stretch=112):
    w=width(value,size,weight,tracking,stretch)
    assert w<540, (value,w)
    return text(value,323-w/2,baseline,size,color,weight,tracking,stretch)

background = sys.argv[1] if len(sys.argv)>1 else 'commonkit-devices-background.png'
name = sys.argv[2] if len(sys.argv)>2 else 'commonkit-x-header-final'
image=b64encode((ROOT/background).read_bytes()).decode()
body=f'<image href="data:image/png;base64,{image}" x="0" y="0" width="1500" height="500"/>'
lock=(ROOT.parent/'logo/concepts/a/lockup-nav.svg').read_text()
# Nested SVG preserves the approved wordmark and its original mark geometry.
lock=re.sub(r' width="[^"]+" height="[^"]+"','',lock,count=1)
lock=lock.replace('<svg ','<svg x="133" y="57" width="380" height="47" ',1)
body+=lock
body+=centered('Shared things.',196,64,weight=560,tracking=-.04)
body+=centered('Kept running.',267,64,weight=560,tracking=-.04)
body+=centered('Book access. Fund upkeep. Earn usage rights.',321,20,'#33415a',520,-.015,100)
# Nominative technology credit: exact official N asset, clear space, no recoloring.
near=(ROOT.parent/'assets/near/near-mark.svg').read_bytes()
body+=text('Built on',228,374,17,'#4e5d76',400,0)
body+=f'<image href="data:image/svg+xml;base64,{b64encode(near).decode()}" x="307" y="353" width="25.2" height="24"/>'
body+=text('NEAR',346,375,25,'#11181c',600,.015)
art = svg(1500,500,body,'COMMONKIT — Shared things. Kept running. Built on NEAR.')
(ROOT/f'{name}.svg').write_text(art)
foreground = re.sub(r'<image href="data:image/png;base64,[^"]+"[^>]+/>', '', art, count=1)
html='<!doctype html><meta charset="utf-8"><title>COMMONKIT final cover</title><style>*{box-sizing:border-box}html,body{margin:0;width:1500px;height:500px;overflow:hidden}.scene{position:absolute;inset:0;width:1500px;height:500px}svg{position:absolute;inset:0;width:1500px;height:500px}svg svg{position:initial}</style>'+f'<img class="scene" src="{background}" alt="">'+foreground
(ROOT/f'{name}.html').write_text(html)
print('Final vector composition ready; original scene and official logos preserved')
