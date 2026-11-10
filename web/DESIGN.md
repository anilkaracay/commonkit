# COMMONKIT web — design direction

One design system for landing and app (D-030): `@commonkit/design` (`packages/design`) provides the tokens,
fonts (CK Sans = Mona Sans subset, Geist Mono for ids and hashes), base styles, `ck-*` components and the
Tailwind v4 theme. The app imports it in `src/styles/index.css` and adds only app knobs (`.wrap`, `.panel`,
`.display`, `.key-num`, `.mono-id`, `.field`, `.code`). There is no second token set. Light only.

**Visual first, little text.** The machine is the hero: every asset card and asset page leads with the
poster still of its 3D model (`src/assets/machines/*.webp`, cropped 4:3 from `landing/explore/v2/posters`;
other asset types fall back to their line icon on the same ice tile). Big numbers carry the story; captions
stay one line.

## Character of an asset

| Element | What it says | Component |
| :--- | :--- | :--- |
| Machine card | poster, name, keyless account id, status, float meter, most-due rule | `AssetCard` |
| Asset page header | poster, name, story line, float vs cap and deposits as big figures, Reserve | `MachineVisual`, `MoneyFigures` |
| Upkeep dial | the rule closest to its trigger as a 240° arc that stops at the end of its track; "Due now" in words | `UpkeepGauge`, `RuleBars` |
| Money | float, rewards reserved and in-flight payouts on one scale with the cap marked; deposits separate, in navy | `KasaBar` |
| Who keeps me alive | initials, name, upkeep count, rights earned | `KeepersList` |
| Out of service | red band; Reserve disabled; Report a fault | `OutOfServiceBand` |

## Colour rules

- White and ice surfaces, ink type, blue-tinted greys. Cobalt for actions, links, gauge fills, pass marks.
- Orange (`due`, `due-fill`) only for upkeep that is due or has a task open.
- Red (`danger`) only for refusals, faults and out of service.
- Navy (`liability`) for deposits: members' money, never revenue.
- No hatching, no dashed cards, no pills. Status is a dot plus words (`Mark`); a card or header carries at
  most two marks (status + SIMULATED), checked by tests via `[data-mark]`.

## Honesty in pixels

- `SIMULATED` label (outlined square, small caps, slate) on every card, row and card tile a simulator or
  emulated device produces, with the device kind on asset pages.
- `demo threshold` label next to any rule lowered by DAO proposal, with the production value on the asset page.
- `MOCK DATA` banner whenever the mock source is active.
- Chain visible, not noisy: a small `tx ↗` link at the end of important rows; `/proof` runs the same checks as
  `scripts/verify.sh` as a calm checklist.

## Type and numbers

CK Sans 400–640 at 100 % width for text, 112 % width for display headings; Geist Mono only for account ids,
hashes, file names and code. Every amount, count and table uses tabular figures (`.num`, `.key-num`).

## Framing

- Mobile first at 390 px: single column, no horizontal scroll (`pnpm --filter @commonkit/web screenshots`
  flags overflow on every route).
- 1440 / 1920: content capped at 1240 px plus gutters; four machine cards across at ≥ 1280 px.
- `?demo=1`: wallet chrome hidden, key numbers ×1.35 (`--ck-key-scale`), a "STEP n/21" overlay from the
  evidence file; `?step=n` or the `[` `]` keys pick the step.
