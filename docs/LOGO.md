# COMMONKIT logo

Status: concept for the owner's review (2026-11-13). Nothing is integrated: the landing, app, video and favicons still use the text wordmark.

## What makes the best marks work (short research)

Web pages were read as data. Quotes are from the linked pages.

1. Paul Rand: a logo identifies, it does not explain. "A logo doesn't sell (directly), it identifies." Its meaning comes "from the quality of the thing it symbolizes, not the other way around." So one idea is enough, and drawing quality matters more than how much story it carries. ([Rand, *Logos, Flags, and Escutcheons*, 1991](https://www.paulrand.design/writing/articles/1991-logos-flags-and-escutcheons.html))
2. Rand: "Simplicity is difficult to achieve, yet worth the effort." A mark should still reproduce at any size.
3. Chermayeff & Geismar & Haviv: look for "the simplest and most appropriate and memorable solution". A mark needs one unusual "hook" to be remembered, and its form should stay simple. ([Haviv interview, Logo Design Love](https://www.logodesignlove.com/sagi-haviv-interview); [Print, "To Abstract or Not Abstract?"](https://www.printmag.com/featured/to-abstract-or-not-abstract/))
4. Mastercard (Pentagram): the identity was reduced to the core geometry so it works on screens and devices. Afterwards 81 % of people recognised the symbol without the name. One geometric gesture, owned for decades, became the brand. ([Pentagram, Mastercard](https://www.pentagram.com/work/mastercard))
5. Vercel: show the full logo where there is room and the symbol alone in tight spaces. Pick black or white by background, keep the artwork intact, and use the symbol's height as clear space. ([Vercel brand](https://vercel.com/geist/brands))
6. Linear: the wordmark is more recognisable than the logomark, so the wordmark leads wherever space allows. Colour is restrained (a desaturated blue) and needs "plenty of space". ([Linear brand](https://linear.app/brand))
7. Stripe: the wordmark comes in only a few colours: "Do not use any other color for the wordmark." ([Stripe brand assets](https://stripe.com/newsroom/brand-assets))
8. Apple app-icon guidance (paraphrased, the page did not render as text): one focal point, no text, legible at the smallest size. ([Apple HIG, App icons](https://developer.apple.com/design/human-interface-guidelines/app-icons))
9. What we took from this: one idea and one geometry, drawn monochrome first. The mark is checked at 16 px before any large rendering. One brand blue, and a lockup with a fixed size ratio and fixed clear space.

## Concept A, "Kept" (the one concept put forward)

**Idea:** four identical parts keep one machine. Each bar is a member, the same shape turned four times with no one at the head. They go around the shared machine in the middle, the way upkeep comes back around. The four parts are one shape repeated, which echoes "same code everywhere". The pinwheel arrangement also tiles, so many machines can form one pattern later.

- Grid: 48 units with a 3-unit module. Bars are 9 × 36, gaps are 3, and the held square is 24 (half the mark). Corner radius is 2. Every value is a multiple of 3, so the master lands on whole pixels at 16 px (module 1 px) and 32 px (module 2 px). The 24 px size has its own hinted drawing (bars 4, gaps 2, square 12), because the master would fall on half pixels there.
- Optical notes: the held square is half the mark, not the arithmetic 20/48 we tried first, because the surrounding mass made a smaller square look timid at 20 px. Bars and square share one radius so the system reads as engineered. Larger radii (2.5 and 3 were tried) made the mark look soft and toy-like. Bars turn clockwise.
- Wordmark: CK Sans (Mona Sans 2, SIL OFL 1.1) at width 112, weight 600, tracking 70/1000 em, outlined to paths. Spacing is by hand, not GPOS. C–O −14, O–M −6, M–M −2, M–O −6, O–N −6, N–K −4, K–I −22 and I–T −14 units on top of the tracking (see `packages/design/logo/src/wordmark.py`). Outlining OFL glyphs into a logo is artwork, not a redistribution of the font.
- Lockup: the symbol is 1.5 × cap height, centred on the caps, with a 15-unit gap (bar + 2 gaps). Clear space should be the held square (half the symbol).
- Colour: symbol in cobalt `#2453e0` with the wordmark in ink `#0a1526` on white (6.2:1 and 18.3:1). Everything goes white on navy `#0d1f3c` (16.4:1). The mono version is all ink. The favicon is cobalt and switches to sky `#9cc3ff` in dark browser chrome via `prefers-color-scheme`.
- Files: `packages/design/logo/concepts/a/` contains `symbol*.svg`, `symbol-24.svg`, `favicon.svg`, `app-icon.svg`, `wordmark.svg` and `lockup{,-mono,-white}.svg`. The review sheet is `packages/design/logo/review/concept-a.png`.
- Rebuild: run `python3 src/lockup.py …`, then `node src/context.mjs concepts/a <tmp>` (needs `pnpm serve:site` on port 4391), then `python3 src/review.py …` and `node src/render.mjs … 1920 1080 2`.

## Directions explored and dropped

About twenty sketches on the same grid were dropped, so that one strong concept could go forward.

- **Ring with a square in its gap** (a "C" closed by the kit): close to Coinbase's mark, a circle with a square notch in a blue disc. Too crypto.
- **Disc with a square hole** (cash coin: round outside, square inside): the motif is already used by ICBC, China Construction Bank, Bank of China and Huaxia Bank ([primaltrek](https://primaltrek.com/blog/2013/02/10/chinese-coins-and-bank-logos/)).
- **Ring split into two "hands" around a square:** reads as a target, a record button or a token icon.
- **Bench with a machine, open kit box, stacked bars:** these read as UI icons (desk, archive, menu).
- **Two interlocking L's, corner brackets:** these read as crop marks or a "copy" icon. L-shapes turned four times also come too close to a swastika, so bars stay straight with no bends.

## Similarity check (concept A)

- A web search for pinwheel and four-rectangle square marks found no identical mark ([logofav pinwheel examples](https://logofav.com/style/pinwheel-logo-examples); [whatthelogo "square and lines"](https://whatthelogo.com/logo/square-and-lines/31608)). The closest relatives are:
  - Chase: four trapezoids around an empty square, forming an octagon. Ours is square, has a solid held centre and uses straight bars.
  - Adobe Connect: four tilted squares.
- Risk: at 16–20 px the gaps close and the mark reads as a "framed square", close to a window or maximise icon. That is why the 16 px drawing keeps 1 px gaps.
- It does not resemble the NEAR mark, which is a stylised N.

## One more iteration would

- Test a 2-tone version (bars cobalt, held square ink) in the app header only. Try one bar in the orange "due" accent as a live state when upkeep is due (app only, never the logo itself).
- Space the wordmark at nav size (15–17 px) separately: tracking 90 for small sizes, 70 for display.
- Run a trademark-database search (USPTO, EUIPO) before any public use, not just a web search.
