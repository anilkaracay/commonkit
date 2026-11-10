"""Subset the three OFL variable fonts for the landing page (run: python3 scripts/subset-fonts.py).

Keeps Basic Latin, Latin-1, the Turkish letters used by member names and the few symbols the page
prints. Output: src/fonts/*.woff2 (committed; OFL 1.1 permits subsetting and redistribution).
"""
import pathlib
from fontTools import subset

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "node_modules" / "@fontsource-variable"
OUT = ROOT / "src" / "fonts"
UNICODES = (
    "U+0020-007E,U+00A0-00FF,U+011E-011F,U+0130-0131,U+015E-015F,U+2013-2014,U+2018-2019,"
    "U+201C-201D,U+2022,U+2026,U+2032,U+2190-2193,U+2197,U+2212,U+2248,U+2260,U+2264-2265,U+00D7,U+2715,U+2713"
)
FONTS = {
    "display.woff2": SRC / "bricolage-grotesque/files/bricolage-grotesque-latin-opsz-normal.woff2",
    "text.woff2": SRC / "instrument-sans/files/instrument-sans-latin-wght-normal.woff2",
    "mono.woff2": SRC / "jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
}
# The fontsource latin files miss the Turkish letters; merge them from the latin-ext file first.
EXT = {k: pathlib.Path(str(v).replace("-latin-", "-latin-ext-")) for k, v in FONTS.items()}

for name, path in FONTS.items():
    for src, tag in ((path, ""), (EXT[name], "-ext")):
        opts = subset.Options()
        opts.flavor = "woff2"
        opts.layout_features = ["kern", "liga", "calt", "tnum", "case", "ss01"]
        opts.name_IDs = ["*"]
        opts.notdef_outline = True
        font = subset.load_font(str(src), opts)
        s = subset.Subsetter(opts)
        s.populate(unicodes=subset.parse_unicodes(UNICODES))
        s.subset(font)
        out = OUT / name.replace(".woff2", f"{tag}.woff2")
        subset.save_font(font, str(out), opts)
        print(out.name, out.stat().st_size)
