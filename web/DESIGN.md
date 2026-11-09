# COMMONKIT web — design direction

**Equipment tag.** Every shared machine in a workshop wears a paper tag: a name, a number, a note about
when it was last serviced. The app draws each asset as that tag, a *nameplate*, so a visitor looks at a
machine, not a table.

## Character of an asset

| Element | What it says | Component |
| :--- | :--- | :--- |
| Nameplate | name, keyless account id, live status, kind of machine | `AssetCard`, asset page header |
| Upkeep dial | how close the most-due rule is to its trigger (Metric, Schedule or Report), what is left, open task | `UpkeepGauge`, `RuleBars` |
| Kasa | float against its cap (above the cap is hatched red: it goes to the DAO), deposits as a separate slate, hatched liability bar on the same scale | `KasaBar` |
| Who keeps me alive | people whose upkeep or training was rewarded, with rights earned | `KeepersList` |
| Out of service | red band; Reserve disabled; Report a fault | `OutOfServiceBand` |

## Tokens (`src/styles/tokens.css`)

- **Paper and ink**: warm paper `#f3efe6`, ink `#1d1b16`, two muted inks, hairline rules. Dark mode inverts to
  `#14130f` / `#f0ebdf` (system preference, or the footer toggle).
- **One living accent**: moss `--ck-alive` for healthy, float, earned rights.
- **Signals**: safety amber `--ck-due-fill` for upkeep due; vermilion `--ck-danger` for faults, out of service,
  credentials; slate `--ck-liability` for deposits (members' money, never revenue).
- **Simulation is a blueprint**: blue `--ck-sim`, dashed border and diagonal hatching (`.tag-sim`) plus the
  `SIMULATED` badge on every card, row and card tile that a simulator asset produces.
- **Type**: Bricolage Grotesque (display, characterful), Instrument Sans (body, calm), JetBrains Mono (amounts,
  account ids, hashes; tabular numbers). Self-hosted via Fontsource, so recordings never depend on a CDN.
- **Shape**: 14 px tag radius, soft single shadow, 4 px spacing grid (Tailwind defaults).

## Chain visible, not noisy

A small dotted `tx` link sits at the end of important rows. Mock hashes render as `tx·mock` and link nowhere.
Full detail lives on `/proof`, which runs the same eleven checks as `scripts/verify.sh`.

## Honesty in pixels

- `MOCK DATA` banner (amber, sticky) whenever the mock source is active, so no screenshot can pass mock
  numbers off as testnet.
- Simulated assets are always hatched and badged; the scenario matrix has a Status column
  (real hardware / simulation / profile example only) taken from each profile's `meta.status`.

## Framing

- Mobile first at 390 px: single column, no horizontal scroll (checked with a headless browser on every route).
- 1080p: content capped at 72 rem, two-column sections, dial and kasa side by side.
- `?demo=1`: wallet chrome hidden, key numbers ×1.35 (`--ck-key-scale`), a "STEP n/21" overlay from the
  evidence file; `?step=n` or the `[` `]` keys pick the step.
