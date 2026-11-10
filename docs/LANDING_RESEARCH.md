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
