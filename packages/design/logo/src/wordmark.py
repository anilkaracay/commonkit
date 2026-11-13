"""Outline the COMMONKIT wordmark from CK Sans (Mona Sans 2, SIL OFL 1.1) as one SVG path.

Usage: python3 wordmark.py <wdth> <wght> <tracking-units> [out.json]
Prints JSON: {d, width, capHeight} in font units (1000 upm), baseline at y = capHeight, top of caps at y = 0.
Spacing is set by hand (optical pairs below), not by the font's GPOS, because a logo is spaced once, by eye.
"""
import json
import re
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

FONT = Path(__file__).resolve().parents[2] / 'fonts' / 'ck-sans.woff2'
TEXT = 'COMMONKIT'

# Optical pair adjustments in font units, added to the uniform tracking.
# Round-to-straight pairs read looser than straight-to-straight ones, so they are tightened;
# the K's open arms leave air on the right, so K-I is tightened; I-T leaves air under the T bar.
PAIRS = {
    ('C', 'O'): -14,
    ('O', 'M'): -6,
    ('M', 'M'): -2,
    ('M', 'O'): -6,
    ('O', 'N'): -6,
    ('N', 'K'): -4,
    ('K', 'I'): -22,
    ('I', 'T'): -14,
}


def build(wdth: float, wght: float, tracking: float) -> dict:
    font = TTFont(FONT)
    inst = instantiateVariableFont(font, {'wdth': wdth, 'wght': wght})
    cmap = inst.getBestCmap()
    glyphs = inst.getGlyphSet()
    hmtx = inst['hmtx']
    cap = inst['OS/2'].sCapHeight
    pen = SVGPathPen(glyphs)
    x = 0.0
    lsb_first = None
    last_right = 0.0
    for i, ch in enumerate(TEXT):
        name = cmap[ord(ch)]
        adv, lsb = hmtx[name]
        if lsb_first is None:
            lsb_first = lsb
        # Shift so the first glyph's left side bearing is removed (the mark starts at x = 0).
        tp = TransformPen(pen, (1, 0, 0, -1, x - lsb_first, cap))
        glyphs[name].draw(tp)
        rsb_right = x - lsb_first + adv
        last_right = rsb_right
        x += adv + tracking
        if i + 1 < len(TEXT):
            x += PAIRS.get((ch, TEXT[i + 1]), 0)
    # Visible right edge of the T: advance minus its right side bearing.
    t_name = cmap[ord('T')]
    from fontTools.pens.boundsPen import BoundsPen

    bp = BoundsPen(glyphs)
    glyphs[t_name].draw(bp)
    t_rsb = hmtx[t_name][0] - bp.bounds[2]
    width = last_right - t_rsb
    d = re.sub(r'-?\d+\.\d+', lambda m: f'{float(m.group()):.1f}'.rstrip('0').rstrip('.'), pen.getCommands())
    return {'d': d, 'width': round(width, 1), 'capHeight': cap}


if __name__ == '__main__':
    wdth, wght, tracking = (float(a) for a in sys.argv[1:4])
    out = build(wdth, wght, tracking)
    if len(sys.argv) > 4:
        Path(sys.argv[4]).write_text(json.dumps(out))
    else:
        print(json.dumps({k: v for k, v in out.items() if k != 'd'}))
