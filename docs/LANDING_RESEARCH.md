# Landing page research (Lane G)

Owner: landing designer. Date of research: 2026-11-10. All pages were opened in headless Chromium
(Playwright 1.64.1) at 1440 × 900 and read as data only; nothing below copies their text, art or palette.

## 1. Structure reference: forktrades.xyz (the human's previous project)

Opened 2026-11-10, full page 10,866 px at 1440 wide.

| Technique | What we take | What we do not take |
| :--- | :--- | :--- |
| Near-black page with a faint dot grid, one soft colour glow behind the hero product card | Deep ink + dot grid; our glow is brass (upkeep), never purple | Its palette, logo, illustrations, avatars, copy |
| Product card in the hero, fed by real chain data, plus an "Example" label on illustrative pieces | printer-01 machine card read from testnet views, task card behind it | Its card layout (ours is an equipment tag) |
| Activity ticker directly under the hero | Ticker of real testnet txs from `evidence/*.json` with explorer links | — |
| Big rounded light panel for "the problem", with a chat thread where the important reply is buried | Paper panel, chat thread about a broken printer, the fix highlighted, marked "Example" | Its names, avatars, message text |
| Sticky step-by-step "how it works" | Sticky 4-step with a live-feeling visual per step | — |
| "Why onchain": an editable database row next to an immutable contract excerpt with checks | Database row an admin deletes vs. the real `nft.rs` lines, with checks linking to /app/proof | — |
| Measured numbers only, with their source and date | Only numbers from testnet views, `evidence/` or measured tests (D-214) | — |
| Huge outlined wordmark in the footer | Outlined COMMONKIT wordmark | — |

Lesson from the capture: its sticky visuals were blank in a full-page screenshot, so our sticky section
renders a complete static frame first and only animates on top (also the reduced-motion version).

## 2. Top-tier references (opened 2026-11-10)

| URL | Techniques (2–3) | Why it fits COMMONKIT |
| :--- | :--- | :--- |
| https://stripe.com | Live counter in the hero ("GDP running on Stripe"); two-tone headline where the second clause is lighter; tight logo row as proof | A live number in the first viewport is the fastest trust signal; we use live testnet views instead of a marketing counter |
| https://linear.app | The real product UI as the hero image, dimmed and cropped; muted, short subline; nav with one filled CTA | Our hero card is real app data, not a mock-up |
| https://vercel.com | Extreme restraint: one object, lots of air, one black CTA + one ghost CTA | Two CTAs only: "Open COMMONKIT" and "See how it works" |
| https://raycast.com | Dark page, one saturated light source behind the headline, glassy nav pill | One warm brass light behind the machine card, nothing else glows |
| https://resend.com | Serif-like high-contrast display at huge size with a single 3D object; very small body copy | Large display type carries the page; illustrations stay line-only |
| https://teenage.engineering | The object is the hero, lit like a product photo; tiny technical labels around it | "The machine has its own account": the machine (drawn) wears its own tag |
| https://oxide.computer | Hardware company that looks like a ledger: mono labels ("FIG. 1"), terminal panel, hairline grid | Mono figure labels, terminal replay for the bounded agent |
| https://fly.io | Consistent hand-drawn illustration world; serif italic accent line | One consistent illustration style for all 12 commons |
| https://posthog.com | Personality through drawn objects and honest, plain copy; desktop-like panels | Plain copy, no hype; drawn objects carry warmth |
| https://family.co | Playful objects orbiting a centred headline; motion on hover only | Commons illustrations react on hover, never loop forever |
| https://tailscale.com | Calm, light, centred; small product cards under the hero | Light paper panels for the two "argument" sections |
| https://mercury.com | Warm, almost photographic atmosphere around a simple promise | Warmth without photos: paper texture and brass light |
| https://cursor.com | Warm paper background, product window layered over a painting | Layered cards (task card behind the machine card) |
| https://rauno.me | Interaction craft: one bold shape, precise micro-interactions | Magnetic CTA, careful hover states, nothing gratuitous |
| https://arc.net | One-message page, centred, big type, single CTA | Final CTA section: one sentence, one button |

Directories browsed for current patterns (2026-11-10): https://www.awwwards.com, https://godly.website,
https://land-book.com, https://www.lapa.ninja — common traits of the strongest current pages: dark first
viewport with one real product object, a light "argument" panel, a sticky explainer, a live data strip,
and a giant footer wordmark. We follow those traits and keep everything else quiet.

## 3. Choices

### Rendering and motion

| Option | Version checked | License | Decision |
| :--- | :--- | :--- | :--- |
| Vanilla TypeScript + Vite 8.3.5 (static HTML rendered at build time, JS only enhances) | 8.3.5 (already in lockfile) | MIT | **Chosen**: best LCP/CLS, no framework runtime, works without JS |
| GSAP + ScrollTrigger | 3.15.1 | GSAP Standard "no charge" license (https://gsap.com/standard-license) | Not used: ~70 kB for effects we can do with IntersectionObserver + one rAF loop |
| Lenis smooth scroll | 1.3.27 | MIT | Not used: hijacks native scroll, hurts a11y and INP for little gain |
| Motion (motion.dev) | 14.11.1 | MIT | Not used: no React here; CSS transitions + Web Animations cover our needs |
| CSS scroll-driven animations (`animation-timeline`) | — | — | Not relied on (not in every engine); our scroll progress is a small rAF loop |

Motion inventory: scroll reveals (IntersectionObserver), SVG path drawing tied to scroll progress (loop
diagram, sankey), number tickers, magnetic primary CTA (pointer: fine only), dot-grid parallax (transform
only), ticker marquee (CSS, pauses on hover/focus), chat thread typing, lamp switching on in "Unlock".
`prefers-reduced-motion: reduce` turns all of it into the final static frame.

### Fonts (self-hosted, subset with fontTools 4.60.2, preloaded)

| Role | Font | Source | License |
| :--- | :--- | :--- | :--- |
| Display | Bricolage Grotesque (variable, opsz + wght) | `@fontsource-variable/bricolage-grotesque` 5.3.0 — https://fontsource.org/fonts/bricolage-grotesque | SIL OFL 1.1 |
| Text | Instrument Sans (variable, wght) | `@fontsource-variable/instrument-sans` 5.3.0 — https://fontsource.org/fonts/instrument-sans | SIL OFL 1.1 |
| Mono | JetBrains Mono (variable, wght) | `@fontsource-variable/jetbrains-mono` 5.3.0 — https://fontsource.org/fonts/jetbrains-mono | SIL OFL 1.1 |

Same three families as the app (`web/DESIGN.md`) so the jump from `/` to `/app` feels like one product.
Subsets keep Basic Latin, Latin-1 and the Turkish letters our member names use; OFL permits subsetting
and redistribution with the license (`landing/src/fonts/OFL.txt`).

### Illustrations and avatars

- **12 commons illustrations**: original SVG line drawings made for this project (`landing/src/art/`),
  one style: 2.25 px round-capped ink line on a 120-unit grid, plus one offset flat colour block
  (risograph-style misregistration) in brass or sage. No stock, no AI images, no third-party art.
- **Avatars**: generated in code from the account id (initials on a tinted disc with a small pattern),
  so no third-party license applies and no real person is depicted.
- **Icons**: drawn inline in the same line style.

### Data sources (honesty)

| Where on the page | Source |
| :--- | :--- |
| Hero machine card + task card | Live testnet views via `@commonkit/sdk` `NearRpc` (`get_profile`, `get_ledger`, `get_service_status`, `get_rule_status`, `get_tasks`); fallback: build-time snapshot of the same views, labelled with its read time |
| Ticker | `evidence/*.json` tx records (explorer links) |
| Commons grid | `profiles/*.json` rules; status badge from the README scenario table |
| Sankey | profile parameters (fee, deposit, float cap) + ledger totals read from testnet |
| Contract excerpt | real lines of `contracts/commons/src/nft.rs` and `credentials.rs`, read at build time with line numbers |
| Agent terminal | `evidence/agent-limits.json` when it exists, otherwise an honest "testnet run pending" state |
| Why NEAR numbers | D-214 sandbox gas measurements, `deployments/testnet.json` (code size, code_hash, keys) |
| Pilot | pilot evidence when it exists, otherwise "pilot pending" |

## 4. Round 2 (D-029 addendum 2): visual-first, minimal copy

Opened 2026-11-10 at 1440 × 900 in headless Chromium (Playwright 1.64.1) with
`landing/explore/v2/research.mjs`, which reads the first viewport's computed styles and the share of the
viewport covered by images/video/canvas. Pages were read as data only; nothing below copies their text,
art or palette.

| Page | Largest text in first viewport | Media share of first viewport | Technique worth taking |
| :--- | :--- | :--- | :--- |
| apple.com/macbook-air | 64 px / 600, line-height 1.09, normal tracking | 100 % | One product shot owns the screen; the headline is short and sits on the image's quiet area |
| apple.com/airpods-pro | 64 px / 600, −0.009 em | 100 % | Each scroll step is one object + one sentence; detail moves to a spec section |
| linear.app | 64 px / 510, −0.022 em, line-height 1.0 | 45 % | Real product UI as the image; 15 px muted subline; one filled CTA |
| stripe.com | 48 px / 300 (light), −0.02 em | 100 % | A light display weight reads calm and expensive; two-tone headline for the second clause |
| vercel.com | 64 px / 400, −0.06 em | 64 % | Extreme restraint: one object, lots of air, heavy negative tracking at a regular weight |
| teenage.engineering/products/op-xy | ~44 px light, lower case, centred | ~90 % (photo) | Object first, tiny caption; the product is lit like a studio still |
| nothing.tech | 48 px / 400 house face | 100 % | Monochrome system, one red accent used only for signal |
| raycast.com | 64 px / 600 | 83 % | One object, one sentence, one CTA; mono only for a single technical footnote |

Common rules we apply: one visual per screen that covers most of it; display text 64–96 px with negative
tracking (−0.02 to −0.06 em) and line-height ≈ 1; a subline at 15–21 px in a muted colour; at most two CTAs;
under ~40 words in the first viewport; numbers as part of the image (callouts on the object, a single big
figure), not as paragraphs; motion is slow and continuous on the object only (camera drift, mechanism),
never on the text.

### Typeface (round 2)

Specimens of Mona Sans, Hubot Sans, Geist, Instrument Sans, Host Grotesk, Funnel Display and Funnel Sans were
set side by side with our headline and numbers (fontsource 5.3.0 files, OFL 1.1). General Sans and Switzer
(Fontshare ITF Free Font License) were not used: that license does not allow redistributing the font files,
and we self-host from a public repository. Inter, Satoshi, Clash, Bricolage and Space Grotesk are excluded by
direction.

**Pick: Mona Sans (variable `wdth` + `wght`) for everything, Geist Mono for account ids and hashes.** One family
covers display and text: the display sizes use 112 % width at weight 560 with −0.042 em tracking, which gives
the engineered, calm stance of the reference pages without a second display face; text uses 100 % width. Its
figures have a tabular feature and a slashed zero, which suits a page whose numbers are ledger values. Geist
Mono is only used for `printer-01.makerlab…` style ids.

| Font | Source | License | Our file |
| :--- | :--- | :--- | :--- |
| Mona Sans 2 (wdth 100–112, wght 400–640 instance, Latin + Turkish subset) | `@fontsource-variable/mona-sans` 5.3.0 — https://github.com/github/mona-sans | SIL OFL 1.1, Reserved Font Name "Mona" | `landing/explore/v2/fonts/ck-sans*.woff2`, renamed **CK Sans** inside the file because the instanced subset is a Modified Version (OFL §3); license in `fonts/OFL-mona-sans.txt` |
| Geist Mono (Latin subset) | `@fontsource-variable/geist-mono` 5.3.0 — https://github.com/vercel/geist-font | SIL OFL 1.1 | `fonts/geist-mono.woff2`, license in `fonts/OFL-geist-mono.txt` |

Subsetting and instancing: fontTools 4.60.2 (`uvx --from fonttools==4.60.2`).

### Palette (round 2)

Blue scale: ink `#0A1526`, navy-950 `#081629`, navy-900 `#0D1F3C`, navy-800 `#132B52`, cobalt `#2453E0`,
blue-500 `#4D7FF0`, sky `#9CC3FF`, ice-200 `#DCE6F4`, ice-100 `#EAF0F8`, ice-50 `#F5F8FC`, white. Blue-tinted
greys: slate-700 `#33415A`, slate-600 `#4E5D76`, slate-500 `#5B6A83`, slate-300 `#A9B9D3`. One warm signal,
`#F07A2A` (`#F59A52` on navy), used only where a task is open or a rule is due.

WCAG contrast (computed): ink on white 18.3; slate-600 on ice-50 6.3; slate-500 on white 5.5; cobalt on white
6.2 (white on cobalt 6.2); white on navy-900 16.4; slate-300 on navy-900 8.3; sky on navy-900 9.1 (navy text on a
sky button 9.1); slate-300 on navy-800 7.1. The signal colour is never used for text on white.

### 3D

three.js 0.187.0 (MIT, published 2026-10-30), vanilla (no React runtime), loaded as a lazy chunk. Models are
procedural (`RoundedBoxGeometry`, `ExtrudeGeometry` with bevels, `LatheGeometry`, cylinders, tori); no
downloaded or generated meshes. Lighting: `RoomEnvironment` through PMREM plus one key light with a VSM soft
shadow and a canvas-drawn contact shadow; `NeutralToneMapping`; no bloom, no emissive glow. Posters (LCP
image and the reduced-motion view) are rendered from the same scene by `landing/explore/v2/shoot.mjs`.
Loading: the poster is the LCP element; the 3D chunk (≈148 kB gzip) loads on the first interaction, or
3 s after load on fine-pointer devices; `prefers-reduced-motion` keeps the poster. Measured on the v2 build
(vite preview, Lighthouse 13.6.0 mobile, 10 runs): performance 98–100, accessibility 100, best practices 100,
LCP 1.7–2.3 s (2.0 s in the last six runs), CLS 0; desktop preset 100 / LCP 0.4 s. Live loop: 60.0 fps, p95
frame 16.7 ms at 1440 × 900 (headless Chromium, ANGLE Metal, Apple M5).

## 5. Production build (D-030, light-led)

The landing now uses `@commonkit/design` (tokens, CK Sans, Geist Mono, base components); `landing/src/styles/main.css`
contains no raw colour (tested). The three.js scene moved to `landing/src/three/` with a higher-fidelity printer
(two-part housing seam, gloss screen bezel, levelling knobs, Z motors and lead screws, part-cooling fan, ribbed
print, PTFE tube that follows the head, roughness grain on ceramic, brushed aluminium, footprint-shaped two-layer
contact shadow) and the other eleven commons in the same language. Posters for all twelve are rendered from the
scene (`scripts/posters.ts`); the hero's open task carries "opened under a demo override" (from
`evidence/demo-overrides.json`), the nozzle reading carries "demo threshold (production: every 200 h of printing)".

Measured on the production build (vite preview, Lighthouse 13.6.0 mobile, 3 runs): performance 98–100,
accessibility 100, best practices 100, SEO 100, LCP 1.5–1.9 s, CLS 0, TBT 60–140 ms. No horizontal overflow at
390, 768, 1440 and 1920 px.
