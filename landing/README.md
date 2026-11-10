# @commonkit/landing

The COMMONKIT project page, served at `/` (the app lives under `/app`). Static HTML rendered at build time from
repo files; a small script enhances it and reads printer-01 live from testnet. Decisions: D-901, D-902, D-903.
Research, fonts and licenses: `docs/LANDING_RESEARCH.md`.

## Commands

Run from the repo root (or drop `--filter @commonkit/landing` inside `landing/`).

| Command | What it does |
| :--- | :--- |
| `pnpm --filter @commonkit/landing dev` | Dev server on http://localhost:5180 |
| `pnpm --filter @commonkit/landing build` | Typecheck, then build to `landing/dist/` (base `/`) |
| `pnpm --filter @commonkit/landing preview` | Serve `dist/` on http://localhost:4180 (needed by shots, og and capture) |
| `pnpm --filter @commonkit/landing test` | Unit tests: formatting, hero card wording, build data, WCAG AA contrast |
| `pnpm --filter @commonkit/landing typecheck` | `tsc --noEmit` |
| `pnpm --filter @commonkit/landing snapshot` | Read the deployed assets' testnet views once (read-only) into `src/data/testnet-snapshot.json`, the labelled fallback |
| `pnpm --filter @commonkit/landing exec tsx scripts/shots.ts <name> [--query hero=b] [--full]` | Viewport or full-page screenshots at 390 and 1440 into `screenshots/` |
| `pnpm --filter @commonkit/landing exec tsx scripts/sections.ts` | One screenshot per section at 390 and 1440 into `screenshots/` |
| `pnpm --filter @commonkit/landing exec tsx scripts/og.ts` | Social card `public/og.png` (1200 × 630) and favicons |
| `pnpm --filter @commonkit/landing capture` | 10-second hero recording into `capture/hero-raw.webm` (convert to `capture/hero-10s.mp4` with the ffmpeg line it prints) |
| `python3 scripts/subset-fonts.py` | Re-subset the three OFL fonts into `src/fonts/` |

## Data and honesty

- Build-time sources: `deployments/testnet.json`, `evidence/*.json`, `evidence/verify-*.txt`, `profiles/*.json`,
  the README scenario table (tile statuses, verbatim), `contracts/commons/src` (quoted lines with numbers) and
  `agent/src/limits-demo.ts` (planned agent refusals until `evidence/agent-limits.json` exists).
- Live reads: printer-01 only, once on load and then at most once a minute while the tab is visible, one request
  at a time, backing off with jitter on HTTP 429. Never under automation (`navigator.webdriver`) or with `?live=0`;
  the labelled snapshot stays on screen instead.
- A threshold that differs from the profile file is shown as a demo threshold with the DAO proposal that set it
  (from the evidence labels) and the production value.
- After new judge steps: run `snapshot` once, then `build`, so the fallback and the evidence-driven parts update.
