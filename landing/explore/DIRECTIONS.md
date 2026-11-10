# COMMONKIT art directions (exploration, 2026-11-10)

Three directions, each rendered as static HTML/CSS with real repo content:
`landing/explore/{a,b,c}/index.html`, three blocks per page (`#hero`, `#flow`, `#card`).
Nothing here touches the production landing or `web/`.

Screenshots: `landing/explore/shots/<a|b|c>-{hero,section,card}-{1440,390}.png` and one contact
sheet per direction, `shots/<a|b|c>-sheet.png`. Regenerate from `landing/` with
`node explore/shoot.mjs` (Playwright 1.64.1, reduced motion), then `python3 explore/sheet.py`.

## Data used (same in all three)

| Figure | Source |
| :--- | :--- |
| printer-01 float 2.6 of 3 NEAR, deposits held 0, open task #1 (bed_level), filament 4.0 of 5 m | `landing/src/data/testnet-snapshot.json` (testnet views read 2026-11-10 09:44 UTC), labelled "snapshot" |
| Demo threshold 5 m (production 330 m, proposal makerlab-ck#16); nozzle_clean 0.5 h (production 200 h, #9) | `evidence/demo-overrides.json` |
| Fee 0.5 + deposit 2 (step 2), refund 2 (step 5, simulated device), float 2.5499 → 3.0499, sweep 0.0499, treasury 5.6511 → 5.7010 (step 6), proposal #10 (step 10), E_SELF_VERIFY and E_NON_TRANSFERABLE (step 17) | `evidence/steps.json` with tx hashes |
| Fee 0.25 NEAR per 30 min, deposit 2 NEAR, float cap 3 NEAR, rights valid 60 days, group makerlab-fab | `profiles/printer_3d.json` |
| Kept alive by Ayşe: tasks #0 (2 rights) and #2 (1 right), verified by Mehmet | snapshot `tasks` |
| Device: moonraker adapter → emulated Moonraker, status "simulation" | README scenario table |

Honesty labels are part of each visual language rather than badges stuck on top: A uses drawing
notes and revision clouds, B uses rubber stamps and stickers, C uses footnotes and a boxed small-caps tag.

---

## A. Drawing set (technical drawing on cyanotype)

**Idea.** The page is a set of engineering sheets for one machine. The printer is drawn as a general
arrangement with numbered balloons. Money appears as *dimensions*: the float is a dimension line
inside the cap, and the overflow is drawn as a pipe out of a vessel.

**Signature motif.** Money as dimension lines, plus the **revision cloud with a Δ marker** for every demo
override (the way drawings mark a change). The sheet border with zone markers (1–8, A–D) and a
title block (part, account, keys, source, sheet n/3) frames each section.

| Token | Hex | Use | Contrast |
| :--- | :--- | :--- | :--- |
| `--ground` | `#0b2740` | Prussian cyanotype page | — |
| `--sheet` | `#0e2f4c` | card / raised sheet | — |
| `--line` | `#e4ecf1` | chalk ink: text and linework | 12.7:1 on ground, 11.5:1 on sheet |
| `--line-2` | `#a9c1d3` | secondary text, dimensions | 8.2:1 / 7.4:1 |
| `--line-3` | `#6f93ad` | construction lines, zone marks (decorative, aria-hidden) | — |
| `--signal` | `#ff6b4e` | red pencil: due, overrides, primary action | 5.4:1 on ground; ground text on it 5.4:1 |

**Type.** Display and text: **Archivo** (variable width; display at wdth 125, text at 100), Omnibus-Type,
SIL OFL 1.1, https://fonts.google.com/specimen/Archivo. Mono: **Martian Mono** (variable width,
narrowed to 75–87.5 for labels), Evil Martians, SIL OFL 1.1,
https://fonts.google.com/specimen/Martian+Mono (source https://github.com/evilmartians/mono).

**Illustration.** Hand-drawn SVG linework only: 1.5 px object lines, 0.8 px construction lines,
dash-dot centre lines, hidden lines for the filament path, 45° section hatching on the printed cube.
One drawing per commons (12 in total) in the same front-elevation style.

**Proposed page structure.**
1. Sheet 01, General arrangement: headline, the drawn printer with five balloons, a notes list, title block.
2. Sheet 02, Money schematic: member → float vessel (cap line) → overflow to the DAO treasury →
   proposal; a separate hatched deposit vessel with a dashed refund line.
3. Sheet 03, Upkeep loop: a sequence drawing (telemetry → agent → claim → bridge test → independent
   verifier → rights) with the refusals drawn as blocked paths.
4. Sheet 04, Bill of materials: the contracts, code hash, 0 keys, the 12 profiles as a parts list.
5. Revision table: evidence steps as revisions, each with a tx link.
6. Title block footer with Open app / Proof.

**Why it fits.** "The machine has its own account" becomes literal: the account is a part on the
drawing, with tolerances (cap) and notes (simulated). Engineering drawings read as precise and
checkable, which is the honesty story.

**Risks.** Dark blue full-page is heavy for the app and close to "blueprint" cliché; the app would need a
light drafting-paper variant to stay readable at 1080p demos. Drawing-heavy SVGs take real time for
12 commons. Small mono text inside SVGs gets tiny at 390 px (mobile needs its own vertical drawings,
as done for the schematic).

---

## B. Service tag (inspection tags on aluminium)

**Idea.** Every machine in a workshop wears a tag. The hero is the printer's own service record
hanging on a string, with signature lines (done by / verified by), a perforated stub for the reward,
and a rating plate with the machine's profile values. "How it works" is four tags hung on a rail:
Reserve, Unlock, Upkeep, Earn, each a real testnet step with its tx.

**Signature motif.** The **punched-hole tag with a rubber stamp**: chamfered top corners, a reinforced hole,
a perforated tear-off stub, and orange stamps ("SIMULATED", "DEMO THRESHOLD") roughened with an SVG
turbulence filter. Meters are counted **segments**, never gradients.

| Token | Hex | Use | Contrast |
| :--- | :--- | :--- | :--- |
| `--ground` | `#e4e3de` | brushed-aluminium page | — |
| `--ground-2` | `#d4d3cd` | recessed panel, rating plate | — |
| `--stock` | `#fbfaf7` | tag card stock | — |
| `--ink` | `#141414` | print | 14.3:1 on ground, 12.3:1 on panel |
| `--ink-2` | `#4a4a46` | secondary print | 6.9:1 on ground, 8.5:1 on stock |
| `--rule` | `#b9b8b1` | form rules (decorative) | — |
| `--signal` | `#ff5a1f` | safety orange, fills only (bands, due chip, meter end) | ink on it 5.9:1 |
| `--signal-ink` | `#a3370b` | orange as text, stamps | 6.5:1 on stock, 5.3:1 on ground |

**Type.** Display: **Big Shoulders** (opsz + wght) and **Big Shoulders Stencil** for the wordmark,
serials and stamps, Patric King for the City of Chicago, SIL OFL 1.1,
https://fonts.google.com/specimen/Big+Shoulders and https://fonts.google.com/specimen/Big+Shoulders+Stencil.
Text: **Atkinson Hyperlegible Next**, Braille Institute, SIL OFL 1.1,
https://fonts.google.com/specimen/Atkinson+Hyperlegible+Next. Mono: **Spline Sans Mono**, SIL OFL 1.1,
https://fonts.google.com/specimen/Spline+Sans+Mono.

**Illustration.** No pictures of machines needed; the objects are the paper artefacts themselves
(tags, stubs, stickers, stamps, rating plate, screws, a steel rail). All CSS plus one SVG filter.

**Proposed page structure.**
1. Hero: headline, rating plate (profile values), the hanging service record of printer-01.
2. "Every use leaves a tag": four tags on a rail (Reserve, Unlock, Upkeep, Earn) with tx links,
   refusals printed in signal ink.
3. "Where the fee goes": a till receipt (fee, deposit held, swept to treasury), torn at the cap line.
4. The 12 commons as a pegboard of tags, each stamped with its README status
   (simulation / profile example only).
5. "Nobody can take it back": the right as a stub with the council's refused attempt stamped VOID on
   the attempt, not on the right.
6. Proof: the verify.sh checks as an inspection checklist with ticks, then Open the app.

**Why it fits.** Maintenance tags are how real workshops track upkeep, and `web/DESIGN.md` already
frames assets as equipment tags, so landing and app share one language (light, paper and ink). The
honesty labels are stamps by nature, which makes "SIMULATED" look designed rather than apologetic.
It is the furthest from crypto-neon of the three.

**Risks.** Rotated elements and the stamp filter must stay legible (stamps sit at 5.3–6.5:1, but the
roughening must never eat glyphs; keep it mild and give every stamp a plain-text equivalent). The
condensed uppercase display can turn into a poster if overused; keep it to headlines and band
labels. Tag shapes rely on `clip-path`, so focus rings and drop shadows need care. Manila-like stock
must stay white-ish so it does not drift back to the rejected cream.

---

## C. Public ledger (editorial)

**Idea.** The page reads like the annual report of a single machine. A masthead and dateline state
where and when the figures were read. The hero sets the headline in a serif next to an account
extract of printer-01 with Float and Deposits held in separate columns, running balances, a red
double-ruled total, and a struck-through refused entry (the council trying to move Ayşe's right).

**Signature motif.** **Footnoted figures and red-ink rules**: every number carries a footnote to its tx,
totals get a red double underline, refusals are struck through with the error code beneath.

| Token | Hex | Use | Contrast |
| :--- | :--- | :--- | :--- |
| `--paper` | `#f9f9f6` | page (neutral white, not cream) | — |
| `--paper-2` | `#f0f2f3` | shaded liability column, sim row | — |
| `--ink` | `#0e1a2b` | navy ink | 16.6:1 |
| `--ink-2` | `#4b5566` | secondary | 7.1:1 on paper, 6.7:1 on paper-2 |
| `--rule` | `#cdd5de` | ledger ruling (decorative) | — |
| `--red` | `#8e1c2e` | red ink: totals, refusals, due, footnote marks | 8.5:1 |

**Type.** Display and figures: **Newsreader** (optical sizes 6–72, italics), Production Type, SIL OFL 1.1,
https://fonts.google.com/specimen/Newsreader, with lining tabular figures. Text: **Public Sans**, U.S.
Web Design System, SIL OFL 1.1, https://fonts.google.com/specimen/Public+Sans. Mono: **Fragment Mono**,
SIL OFL 1.1, https://fonts.google.com/specimen/Fragment+Mono.

**Illustration.** Almost none: typography, tables and rules carry the page. If needed, small
engraving-style line vignettes of each commons as chapter heads.

**Proposed page structure.**
1. Masthead, dateline (read time), headline + italic second clause, two-column lede with a red
   initial, account extract.
2. Part I, "The books of one machine": four big figures (0.5, 2, 3, 0.0499) as numbered paragraphs,
   with a sources column and the custody equation.
3. Part II, "Who keeps it alive": the upkeep story as a dated entry list (telemetry, task, claim,
   verification, rights) with the two refusals struck through.
4. Part III, "Twelve commons, one contract": a table of profiles with the README status column verbatim.
5. Appendix: verify.sh checks as a table; colophon with fonts and data sources; Open the app.

**Why it fits.** "Public ledger" is literally what the product is. Tables of real figures make the honesty
rules visible, the separate deposits column shows the custody invariant at a glance, and it is the
lightest to build and the fastest page (no illustrations).

**Risks.** Least physical of the three: the "shared machine, workshop" warmth must come from copy.
Editorial serif + white can read as a fintech or Stripe Press homage if the table work is not
exceptional. Wide tables need a careful mobile layout (here the extract keeps 4 columns at 390 px).

---

## Recommendation

**B, Service tag.** It has the one idea that belongs only to COMMONKIT (machines in a shared workshop
wear service tags, and ours are signed on chain), it carries the honesty labels as stamps instead of
disclaimers, and it gives landing and app one light visual language that already matches the
"equipment tag" model in `web/DESIGN.md`. Borrow two things from C: the account-extract table with
separate Float / Deposits held columns for the money section, and footnoted tx references.

Before production: self-host the chosen fonts via Fontsource and subset them, record them in
`docs/LANDING_RESEARCH.md`, and run Lighthouse at 390 px. These explore pages load fonts from Google
Fonts for speed of iteration only.
