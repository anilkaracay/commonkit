# @commonkit/design

The one visual system for the landing (`landing/`) and the app (`web/`), per D-030: light-led blue,
CK Sans (Mona Sans) + Geist Mono, procedural 3D machines, honesty labels designed in. Light only.

## Use

```css
/* CSS entry of a Vite + Tailwind v4 app (web/src/styles/index.css) */
@import 'tailwindcss';
@import '@commonkit/design/all.css';      /* tokens, @font-face, base, ck-* components */
@import '@commonkit/design/tailwind.css'; /* maps the tokens to Tailwind utilities */
```

Without Tailwind (landing): import `all.css` only and write CSS against the `--ck-*` variables.

Preload the headline font in `index.html` (Vite fingerprints it, so take the URL from the package):

```ts
import { fontUrls } from '@commonkit/design';
// <link rel="preload" href={fontUrls.sans} as="font" type="font/woff2" crossorigin>
```

`color` in `src/index.ts` mirrors the CSS primitives for canvas/WebGL code; `pnpm --filter @commonkit/design test`
checks that both agree and that every text pair reaches WCAG AA.

## Tokens (short)

| Role | Token | Value |
| :--- | :--- | :--- |
| Page / alternate band | `--ck-bg` / `--ck-bg-alt` | white / ice-50 `#f5f8fc` |
| Text / secondary / meta | `--ck-text` / `--ck-text-2` / `--ck-text-3` | ink `#0a1526` / slate-600 / slate-500 |
| Action, links, gauge fill | `--ck-accent`, `--ck-fill` | cobalt `#2453e0` |
| Open or due upkeep — **only** | `--ck-due` (text), `--ck-due-fill` (dots, bars) | orange `#b4500f` / `#f07a2a` |
| Deposits held (liability) | `--ck-liability` | navy-700 |
| Errors and refusals — only | `--ck-danger` | red-700 |
| Simulated device label | `.ck-sim` | slate-600 text, outlined square |
| Rare dark surface | `--ck-inverse-bg` | navy-900 |

Type: one family. Headlines `.ck-display` (width 112 %, weight 560, −0.042 em, leading 0.98), section
headlines `--ck-text-4xl`, hero `--ck-text-5xl`; app body 15 px, landing body 17 px; numbers `.ck-num`
(tabular). Geist Mono (`.ck-mono`) only for account ids, tx hashes and code.

Space 4 px base (`--ck-space-*`), radius 4/8/14/20/28 + full (buttons only), three soft shadows, motion
120/200/320/600/900 ms with `--ck-ease-out`.

## Rules

Do

- One filled button per view (`.ck-btn`); everything else is `.ck-link` or `.ck-btn--ghost`.
- One visual per screen; headline ≤ 6 words, one supporting line ≤ 15 words.
- Numbers come from testnet views or `evidence/`; show the read time. Pair every colour signal with text.
- Label simulation where it applies with `.ck-sim` ("Simulated device"), demo thresholds with a
  "Demo threshold" note, illustrative content with "Example".
- Respect `prefers-reduced-motion` (base.css shortens transitions; 3D falls back to its poster).

Don't (D-029)

- No gradient text, glow, glassmorphism/backdrop blur, blurred blobs, dot grids, decorative noise.
- No mono "eyebrow" labels above every section, no pill-badge clutter (one status + one simulation label
  per card at most), no emoji, no sparkle icons, no bento-grid clichés.
- No orange for anything except open/due upkeep; no new hues.
- No stock or AI imagery; machines are the procedural three.js models (or their poster stills).

## Fonts and licenses

| File | Source | License |
| :--- | :--- | :--- |
| `fonts/ck-sans.woff2`, `fonts/ck-sans-tr.woff2` | Mona Sans 2 via `@fontsource-variable/mona-sans` 5.3.0 (github.com/github/mona-sans), instanced wdth 100–112 / wght 400–640, subset Latin + Turkish with fontTools 4.60.2 | SIL OFL 1.1; Reserved Font Name "Mona", so the modified file is named **CK Sans** (`fonts/OFL-mona-sans.txt`) |
| `fonts/geist-mono.woff2` | Geist Mono via `@fontsource-variable/geist-mono` 5.3.0 (github.com/vercel/geist-font), Latin subset | SIL OFL 1.1 (`fonts/OFL-geist-mono.txt`) |
