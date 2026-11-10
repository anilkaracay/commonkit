# @commonkit/landing

The COMMONKIT project page, served at `/` (the app lives under `/app`). Static HTML rendered at build time from
repo files on the shared design system `@commonkit/design` (D-030); a small script enhances it, mounts the live
three.js printer and reads printer-01 live from testnet. Research, fonts and licenses: `docs/LANDING_RESEARCH.md`.

## Commands

Run from the repo root (or drop `--filter @commonkit/landing` inside `landing/`).

| Command | What it does |
| :--- | :--- |
| `pnpm --filter @commonkit/landing dev` | Dev server on http://localhost:5180 (also serves `lab.html`, the poster studio) |
| `pnpm --filter @commonkit/landing build` | Typecheck, then build to `landing/dist/` (base `/`) |
| `pnpm --filter @commonkit/landing preview` | Serve `dist/` (use `--port 4180` for the scripts below) |
| `pnpm --filter @commonkit/landing test` | Unit tests: formatting, build data, render honesty labels, tokens-only colours |
| `pnpm --filter @commonkit/landing snapshot` | Read the deployed assets' testnet views once (read-only) into `src/data/testnet-snapshot.json`, the labelled fallback |
| `pnpm --filter @commonkit/landing exec tsx scripts/posters.ts` | Poster stills from the three.js scene into `public/posters/` and `src/data/hero-anchors.json` (needs the dev server and `cwebp`) |
| `pnpm --filter @commonkit/landing exec tsx scripts/sections.ts --url http://127.0.0.1:4180/` | One screenshot per section at 1440 and 390 into `screenshots/` (`--widths 768,1920` for more) |
| `pnpm --filter @commonkit/landing exec tsx scripts/og.ts` | Social card `public/og.png` (1200 × 630) and favicons |
| `pnpm --filter @commonkit/landing capture` | 10-second hero recording `capture/hero-10s.mp4` (deterministic frames, needs the preview and ffmpeg) |

## 3D

`src/three/`: one studio (`stage.ts`), one material set (`materials.ts`, colours from `@commonkit/design`), the
printer (`printer.ts`) and the other eleven commons (`machines.ts`), all procedural. The live scene loads only on
the first interaction (or 3 s after load with a fine pointer) and never under `prefers-reduced-motion`; the poster
is the same scene at t = 0, so the swap is invisible. Print motion is simulated and labelled so.

## Data and honesty

- Build-time sources: `deployments/testnet.json`, `evidence/*.json`, `evidence/verify-*.txt`, `profiles/*.json`,
  the README scenario table (statuses, verbatim) and the testnet snapshot. The build fails if one is missing.
- Live reads: printer-01 only, once on load and then at most once a minute while the tab is visible, one request
  at a time, backing off on failure. Never under automation (`navigator.webdriver`) or with `?live=0`.
- Demo thresholds show the production value; a task opened under a demo override says so.
- After new judge steps: run `snapshot`, then `posters` (the 3D state), then `build`.
