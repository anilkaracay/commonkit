# SUBMISSION_PACKAGE — G6 handover (drafts only)

Everything here is a draft for the human. The human makes the repository public, publishes the X post and submits the form (D-026); agents never do. This file holds **no personal data**: personal fields are placeholders, and the filled version lives only in the gitignored `submission/` folder (`.gitignore` line `submission/`).

Rules source: [`docs/HACKATHON.md`](HACKATHON.md) (synced with the live file in f61e7c0). Deadline: **2026-11-14 23:59 UTC**; the form accepts submissions from 2026-11-01T00:00:00Z.

## (a) Repo-public checklist

Do these in order; tick each one.

1. [ ] **Secrets scan of the whole history** (from the repo root):
   - `gitleaks git --no-banner --redact -v .` — run on 2026-11-10 over 135 commits: 12 findings, all **public** keys (`ed25519:` + 44 base58 characters) of the six deploy keys we deleted, in `evidence/setup.json` and `evidence/EVIDENCE.md`. Public keys are not secrets; they are expected evidence of the key deletions. Rerun before going public and check that every new finding is a public key or a tx hash.
   - Optional second tool: `trufflehog git file://. --only-verified`.
   - Manual patterns: `git log --all -p | grep -E 'ed25519:[1-9A-HJ-NP-Za-km-z]{80,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|VERCEL_TOKEN=.+|NEARAI_API_KEY=.+|sk-[A-Za-z0-9]{20,}'` must print only code that names a field (e.g. `key.secret_key` in sandbox helpers), never a value. A NEAR private key is `ed25519:` + ~88 base58 characters.
   - Files that must never be in history: `git log --all --name-only --format= | grep -E '(^|/)\.env($|\.)|\.pem$|\.key$|credentials'` → only `.env.example` and source files named `credentials.rs` (checked 2026-11-10).
2. [ ] **`.gitignore`** still covers `.env`, `.env.*` (except `.env.example`), `*.key`, `*.pem`, `**/credentials/`, `.near-credentials/`, `evidence/private/`, `submission/`, `pilot/*.local.json` (via `pilot/.gitignore`), `bridge/state/`, `agent/state/`.
3. [ ] **No AI-tool files** in the tree: `git ls-files | grep -E '^(CLAUDE\.md|\.claude/)'` prints nothing.
4. [ ] **LICENSE** (MIT) at the root: `git ls-files LICENSE`.
5. [ ] **README renders on GitHub**: mermaid diagram, tables, every relative link (the README link check passed on d28b6e7: all relative links exist).
6. [ ] **Tag** the submitted state: `git tag hackathon-submission && git push origin hackathon-submission` (HACKATHON.md Q-003; no pre-hackathon tag is needed because the first commit [`30df77b`](https://github.com/anilkaracay/commonkit/commit/30df77b6e3af06457650e287b228bcea75217083) is from 2026-11-09).
7. [ ] **Make public (human):** GitHub → `anilkaracay/commonkit` → Settings → General → Danger Zone → Change repository visibility → Public. (Currently PRIVATE.)
8. [ ] **After it is public:**
   - CI starts (`.github/workflows/ci.yml`; public repos run Actions without the billing block, H3). Wait for green.
   - Open five tx links and three evidence links from the README while logged out.
   - GitHub Pages is not needed (the app is hosted separately, H11).
   - The repo must stay public through judging (Q-014).

## (b) X demo post (≤ 280 characters, D-023)

Requirements (HACKATHON.md §2): says it was built at NEAR HACKATHON, tags @NEARProtocol and #NEARHackathon, video attached, problem first, NEAR's concrete role, demo and repo links.

<!-- character count: 279 / 280 (each <url> counted as 23, as X does) -->
```
Shared machines get used, not fixed.

Built at NEAR HACKATHON: a keyless NEAR account per machine. It opens only for on-chain bookings and pays fixers in access nobody can revoke.

Simulated demo: <url>
Code: <url>
@NEARProtocol #NEARHackathon
```

- `<url>` 1: the hosted app `https://<domain>/app` (H11). `<url>` 2: `https://github.com/anilkaracay/commonkit`.
- NEAR's role in the post: the keyless per-machine NEAR account that only opens for on-chain bookings and pays in non-revocable access.
- A genuine question did not fit within 280 characters. If the human wants one, post it as the first reply: "What shared thing near you should pay for its own upkeep?" (no thread otherwise, D-023).
- @NearLegion and @NearBuilders are optional; adding both (24 characters with spaces) would exceed 280 with this text.
- Attach: `<video: commonkit-90s-1080p.mp4 from docs/VIDEO_SHOTLIST.md>` (720p fallback `commonkit-90s-720p.mp4`); a 10-second hero clip exists at `landing/capture/hero-10s.mp4` (2.4 MB) if a short clip is preferred.
- Recount after replacing the placeholders: `node -e 'const t=require("fs").readFileSync(0,"utf8").trim();console.log(t.replace(/https?:\/\/\S+/g,"x".repeat(23)).length)' < post.txt`.

## (c) Form checklist (field → value)

Fill the personal values only in `submission/payload.local.json` (gitignored). Send exactly these 11 fields; never `website`. Print the payload for the human and wait for an explicit yes.

| Field | Value | Source / rule |
| :--- | :--- | :--- |
| requestId | `<generate once: node -e 'console.log(crypto.randomUUID())'>`, reuse on retry | HACKATHON.md §3 |
| projectName | `COMMONKIT` | 2–80 chars |
| leadName | `<H6: lead name>` | human |
| email | `<H6: contact email>` | human; ≤ 160 chars; ≤ 2 submissions per email |
| size | `<H6: one of 1, 2 - 4, 4 - 6, 6 - 8, 8+>` | human, exact string |
| tracks | `["social"]` | see decision below |
| nearAddress | `<H6: mainnet payout account>` | human; lowercase, regex in HACKATHON.md; never invented |
| projectUrl | `https://github.com/anilkaracay/commonkit` (only once public) | unique per submission |
| demoUrl | `<H8: URL of the published X post>` | human posts first |
| idea | text in (d) | 20–2000 chars |
| consent | `true` only after the human agrees to: "I agree that the organizers may use these details to review our submission and contact us about this hackathon." | human |

**Tracks decision:** `social` only.
- `social` (Social Money): shared budgets (capped float + Sputnik treasury), programmable rewards (upkeep tasks), collective ownership (keyless asset accounts governed by unmodified Sputnik DAOs) and reputation-based access (credential cards, clean-return deposits). Evidence: README "Social Money compliance".
- `nfts`: not now. The cards are NEP-171 and work on chain (steps 8, 12, 17), but their display in a wallet has not been verified (research B14). Add it only if a wallet shows a card before submission, with a screenshot in evidence.
- `agents`: not claimed. Our agent opens tasks and escalates purchases within contract limits; it does not earn, spend, negotiate or hire on a market (research A8).

Order of human actions: H7 repo public → H8 X post → H9 submit with `demoUrl` = the post. A submission cannot be edited; mistakes go through https://nearhackathon.com/request-changes (never a second submission).

## (d) `idea` text (1508 / 2000 characters)

Verified facts only (README links each one).

```
Shared things in communities (makerspace printers, dorm washers, co-op tractors, neighbourhood fridges) get used by everyone and looked after by no one, and their money and rules sit in one admin's spreadsheet. COMMONKIT gives each shared thing its own keyless NEAR account running the same asset contract. Members reserve on-chain; a bridge next to the device unlocks it only for a valid reservation (NEP-413 signed request plus an on-chain check, written before the unlock). Fees fill a capped float; the excess is swept to the community's unmodified Sputnik DAO, and larger purchases become Sputnik proposals opened by the asset contract itself. When a profile rule comes due (telemetry threshold, schedule or member fault reports), an operations agent with a function-call key opens an upkeep task: maintenance, restock, cleaning, inspection, repair. A member does it, another member approves, and the worker receives non-transferable NEP-171 usage-right cards that no method can revoke. Restock and repair can claim a capped, receipt-backed expense; risky machines need credential cards, and trainers earn rights. On testnet: 2 DAOs, 2 commons and 4 asset accounts, all keyless, one code_hash; all 21 judge steps passed with tx evidence, and verify.sh checks every claim read-only. simulate.sh runs the full loop for all 12 asset profiles on a local NEAR sandbox. Devices are emulated or simulated and labelled so; no physical device has been tested yet, and a real-users pilot is pending. Testnet only.
```

## Filled copy

`submission/` is gitignored. It holds `submission/FILL_ME.md` (template and steps) and, once the human answers H6, `submission/payload.local.json` with the real values. Never commit, paste into an issue or send it anywhere except the official form/API.
