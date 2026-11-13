# WIN_PLAN — Social Money 1st place (and the grand prize)

Researcher pass, 2026-11-13 ~06:15–06:55 UTC. Primary sources only; every row has a URL. Competitor facts are **what their READMEs claim** (fetched 2026-11-13); we did not re-verify their chains. Deadline 2026-11-14 23:59 UTC; judging 2026-11-16..18.

## What the organizers told us (sources)

| Source (fetched 2026-11-13) | What it says that matters |
| :--- | :--- |
| https://nearhackathon.com/HACKATHON.md | Byte-identical to `docs/HACKATHON.md` (`diff` empty). Social hints: SPUTNIK DAO, TREZU, NAMED ACCOUNTS. "Don't rebuild the multisig — build what communities do with it." Q-012: hosted demo is a plus; "screenshots are not enough when judges cannot open the demo". Q-017: Claude Code/Codex screen for reproducibility + feature verification. |
| https://nearhackathon.com/ (FAQ "How will projects be judged?") | "Claude Code & Codex … check that it runs and does what the README says … Previous NEAR hackathons evaluated **technical implementation, design, impact, originality and sustainability** — a good guide to prepare by." Not in HACKATHON.md. |
| https://nearhackathon.com/ (#judges) | Illia Polosukhin (NEAR), Eddy Lazzarin (a16z crypto), Mert Mumtaz (Helius), Avichal Garg (Electric Capital), Kain Warwick (Synthetix/Infinex), Haseeb Qureshi (Dragonfly), Stepan Gershuni (cyber•Fund), plus Claude Code & Codex. Investor-heavy: impact and sustainability will weigh. |
| https://nearhackathon.com/api/projects?track=social (public directory API used by the site) | **88 Social Money submissions**, 835 overall (`/api/applications` → `{"count":835}`), as of 2026-11-13 ~06:40 UTC. COMMONKIT not yet submitted. |
| https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/12-social.md (last commit 7873343, 2026-10-30) | Starter prompt: "bounty board with earned trust". Four requirements + one checkpoint (below). Extra links: near.social, nearaccounts.com (Top Level Accounts). |
| …/SUBMITTING.md | "You've selected **every track your project fits**"; README with "do X, see Y" steps an AI judge can follow. |
| https://github.com/NEAR-DevHub/trezu `docs/CUSTOM_PROPOSAL_TEMPLATES.md` (3f8d3b2, 2026-06-29) and `nt-fe/scripts/testnet-mock-backend.mjs` (9dfadfd, 2026-09-18) | Trezu has **custom proposal templates** (JSON manifest → Sputnik `FunctionCall` proposal tagged `[trezu-tmpl:<id>]`, engine `nt-fe/features/proposal-templates/build-proposal.ts`) and an official **dev-only mock backend that opens a testnet DAO in the Trezu UI**. Both work without mainnet. |
| NEAR DevHub YouTube channel | Not reachable as text (RSS 404); no track walkthrough text found. |
| near.social skill (https://near.social/skill.md) | Writes go to mainnet account `social` → **mainnet, out of bounds** for us. |

## (a) Social Money asks → COMMONKIT

| Ask (prompt 12-social.md / HACKATHON.md) | COMMONKIT | Evidence |
| :--- | :--- | :--- |
| Use the existing DAO or Trezu treasury for custody and approvals; no new multisig | ✅ Unmodified Sputnik v2 from `sputnikv2.testnet`; float above cap swept to the DAO; big purchases are proposals the asset contract opens itself | README "Social Money compliance"; steps 6, 10; makerlab DAO has 17 proposals (`get_last_proposal_id`, 2026-11-13) |
| Reputation tied to named accounts; every point traceable | ✅ `reputation_recorded` events carry task/session ids; all actors are named accounts | steps 5, 9, 13; `deployments/testnet.json` |
| Tiers: small auto, mid one council member, large a DAO proposal | ✅ by **amount** (auto ≤ `auto_reward_cash_cap`, council above `council_threshold_cash`, DAO above cap) | step 18 `42VT5eby…`; step 10 |
| …where **a good track record raises** the no-vote limit | ⚠️ Not implemented. Track record lowers the **deposit** (`trusted_after` clean returns → `deposit_trusted`, CONTRACT_SPEC §5) and earns access rights, not a higher cash limit. Say so in the README table. No contract change (keyless, redeploy risk). | CONTRACT_SPEC line 544; `profiles/printer*.json` `trusted_after: 3` |
| Public board: open work, claims, payouts, each contributor's record | ⚠️ Built (`/app`, 71 tests) but **not hosted** (H11) — the README shows `https://<domain>/app` | `web/screenshots/*`, README "Try it in 2 minutes" |
| Checkpoint: "which approval flows already exist and which we add" | ❌ Not answered explicitly in README (Hat Tip answers it in a section) | — |
| Shared budgets / programmable rewards / collective ownership / reputation-based access | ✅ capped float + DAO treasury / upkeep tasks → NEP-171 rights / keyless asset accounts / credential cards | README compliance table; `inv_*` sandbox tests |
| Lean on Trezu | ❌ Nothing shown. Two honest testnet paths exist (action 3) | README "Trezu" |
| Named accounts | ✅ `printer-01.makerlab.commonkit-sxflo.testnet` etc. | `deployments/testnet.json` |
| Hosted demo (Q-012 "a plus"), X video post | ❌ / ❌ pending H11, H8 | STATUS HUMAN TODO |
| AI screening: runs, does what README says | ✅ `./scripts/verify.sh` exit 0 today in 84 s, read-only, no keys (re-run 2026-11-13 ~06:48 UTC) | `evidence/verify-step21.txt` |

## (b) Competitors (Social Money, strongest found)

Found via the directory API (names, demo posts) and GitHub search (repos updated since 2026-10-19). All live URLs answered HTTP 200 on 2026-11-13.

| Project (repo) | What it ships (README claims) | Live demo | Trezu | vs COMMONKIT |
| :--- | :--- | :--- | :--- | :--- |
| **Hat Tip** (replaycourt/hat-tip) | Peer thanks paid by a café's Sputnik DAO; **tier chosen from reputation**; Sputnik bounties board; keyless contract; `judge-checks.sh` (15 read-only checks, ~20 s); CI badge; 90 s video; **178 rounds / 1,095 payouts** on testnet; README table maps the prompt's 4 requirements + checkpoint literally | ✅ GitHub Pages, no wallet | explained, not opened | Fits the starter prompt exactly and looks alive. We are deeper (physical access, agent, invariants, 12 profiles) but they look more "done" to a skimming judge. **Main threat.** |
| **Standing Order** (nsulyman-boop/standing-order) | Recurring DAO payroll; keeper fc-key; NEAR Intents cross-chain payout; NEAR AI Cloud TEE clerk; **7 Trezu custom templates compiled with Trezu's engine, one proposal filed through it**; 207 payouts; 52 contract tests in CI; 4 tracks | ✅ dashboard (GH Pages) | ✅ templates | Stronger on partner-tech breadth (Trezu + Intents + NEAR AI). Weaker on originality (payroll). |
| **Headcount** (saltxd/headcount) | Once-per-person reward payouts; Trezu-format CSV, Trezu templates; real Sputnik v3.2 mainnet bytes in sandbox; 125 TS + 122 cargo tests | ❌ sandbox only | ✅ templates | Very rigorous, but no live deployment. |
| **Petty Cash** (kasbsquall/petty-cash) | Rule-bound budgets installed into a Sputnik DAO by two proposals; agent fc-key | ✅ Vercel, testnet, no wallet | ❌ | Clear, simple problem statement; narrower. |
| **OwnGround** (ownguard9/ownground) | Community pools NEAR, buys a productive asset via DAO, distributes revenue; 19 demo steps; `verify-v4.mjs` 108/108; already submitted | ✅ Vercel | ❌ | **Closest concept** (collective ownership of a productive asset). No access control, no upkeep loop, no device. |
| **CommonsOps** (super-user-root/CommonsOps) | Recurring public maintenance (GitHub PR work) → claim cycles → linked Sputnik proposal; `llms.txt` for AI judges | ✅ GH Pages | ❌ | Same "maintenance of commons" story, for code not things. Name collision risk with "COMMONKIT". |
| **Proposal X-Ray** (bars26/near-proposal-xray) | Decodes any Sputnik/Trezu proposal before a vote (mainnet read) | ✅ Vercel | ✅ reads Trezu DAOs | Tooling; strong Trezu story; not a money product. |
| **LisDao** (kaizen-builds/lisdao) | DAO votes → AI agent does a web task → contract pays within limits; NEAR AI Cloud | ✅ Vercel | ❌ | Agent-heavy; overlaps our "bounded agent" claim. |

Others seen (not deep-dived): Patch Fund, FairShare, Potluck, Roomy, NearJar, Kring, Njangi, Ajo Onchain, Sputnik Settlement Ledger (theYahia), SplitPool, GroupVault, ShowUp. None of the 88 names or the 13 READMEs read controls a physical device.

## (c) Our 3 strongest differentiators / 3 biggest gaps

Differentiators:
1. **Money bound to a physical shared thing.** Only entry found where an on-chain booking gates a device (NEP-413 request + `can_access` + session written before unlock) and each asset is its own keyless account with one `code_hash` — "a thing that owns money", which is also the NFTs track's thesis.
2. **Verifiable depth.** 402 unit + 36 sandbox tests (20 invariant tests), 21/21 judge steps with tx hashes, `verify.sh` 11 read-only checks, asset contract opens its own Sputnik proposals.
3. **Generality + bounded automation.** Same WASM for 12 profiles (`simulate.sh` 12/12), operations agent limited by contract-side rules and quotas, non-revocable earned access.

Gaps vs a winning entry:
1. **Nothing a judge can open.** No hosted app, no video, README starts with a `<domain>` placeholder. Every competitor above except Headcount has a live URL.
2. **Trezu is absent** while Standing Order and Headcount ship Trezu templates, and the prompt's signature mechanic (track record raises the no-vote limit) is only partially met.
3. **Looks frozen and unused.** On-chain activity is one scripted run (2026-11-10); Hat Tip shows 1,095 payouts. No real users, no physical device (honestly labelled).

## (d) Prioritized actions (~30 h)

| # | Action | Impact | Effort | Lane | Honesty check |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **Host `site/` today.** Human runs `npx vercel login` (H11) by 2026-11-13 18:00 UTC. Fallback, no login: after the repo is public, build with `COMMONKIT_WEB_BASE=/commonkit/app/` + landing `base: '/commonkit/'`, push a `gh-pages` branch, human enables Pages. Keep it up to 2026-11-25. | H | S (M for fallback) | human + web | Board reads testnet RPC; SIMULATED badges stay. |
| 2 | **README first screen** (see (e)): no placeholders, hero screenshot, video link, "Judge in 5 minutes" block, prompt-literal table with the ⚠️ row, checkpoint answer. | H | S | docs | Only verified facts; ⚠️ stays ⚠️. |
| 3 | **Trezu, honestly.** (a) 4–5 Trezu custom-template manifests for real COMMONKIT DAO calls (`commons.set_roles`, `commons.set_credential_kind`, `asset.set_profile`, `asset.resolve_dispute`, `commons.register_asset`) in `trezu-templates/`; a test compiles them with Trezu's own `build-proposal.ts` at a pinned commit; file **one** on testnet from a council member (1 NEAR bond) so the `[trezu-tmpl:<id>]` tag is on chain. (b) Run Trezu's UI locally with its official `testnet-mock-backend.mjs` against `makerlab-ck.sputnikv2.testnet`; screenshot the requests page listing the printer-opened proposal (step 10). | H | M (3–4 h) | chain-ops + docs | Claim exactly: "templates compiled by Trezu's engine; one filed on testnet; Trezu UI run locally on Trezu's testnet mock shows our proposals. The hosted Trezu app is mainnet-only, so not used." Never "integrated with Trezu app". |
| 4 | **90 s video + X post** (VIDEO_SHOTLIST): first 5 s = one complete moment (refused without booking → booking → unlocks), then upkeep → independent approval → card. | H | M | video + human | SIMULATED label burned into every device shot. |
| 5 | **Tracks: add `nfts`.** NEP-171 cards carrying credentials and access rights; each asset is an account that owns money. Verified today: `nft_metadata` spec `nft-1.0.0`, `nft_total_supply` 7 on `commons.makerlab…`. Update SUBMISSION_PACKAGE + D-entry. | M | S | human + docs | Do not claim wallet display (unverified). Skip `agents`. |
| 6 | **Answer the checkpoint** in README: which Sputnik flows exist (AddProposal/Vote/Finalize, Transfer, FunctionCall, bounties) and what COMMONKIT adds (float cap + sweep, contract-as-proposer, task tiers, rights). | M | S | docs | From Sputnik source + our DAO_INTEGRATION. |
| 7 | **Real-users micro-pilot** (3–5 consenting people, `manual_qr`, one shared item) before the D-031 cut-off 2026-11-14 06:00 UTC. | H if done | L (human time) | human + chain-ops | Report the real numbers, however small; otherwise keep "no real users". |
| 8 | **Labelled demo heartbeat** during judging: simulator-driven washer sessions every ~30 min from 2026-11-14, so the board and proposal list move. | M | M | bridge + chain-ops | Team-controlled accounts, SIMULATED label, gas only; needs H4 NEAR. |
| 9 | **Screener hardening**: fresh-clone run of the README path with timings; CI green once public; tag `hackathon-submission`; root `llms.txt` pointing to README, verify.sh, evidence. | M | S | verifier + docs | Times measured, not guessed (verify.sh: 84 s on 2026-11-13). |
| 10 | **One "sustainability" paragraph** for an investor jury: who pays (protocol fee 0 today, DAO-switchable), first segment, what the pilot would prove. | L–M | S | docs | Say "not validated". |

Do not: change contracts, touch mainnet (near.social writes, Trezu hosted app), or claim Trezu/hardware/users beyond evidence.

## (e) First-30-seconds tweaks

README (top of file, in this order):
1. Title + one sentence + **one screenshot** (`web/screenshots/board-1440.png`) + a line: `Live app · 90 s video · verify.sh (84 s, no keys) · Testnet tx evidence`.
2. Move the "*Precisely:* …" revocation caveat out of the hero into "Honest limits" (keep a one-line link). The hero sentence stays true on its own ("no method deletes, downgrades or transfers").
3. Replace every `<domain>` with the real URL; if hosting fails, lead with `pnpm install --frozen-lockfile && pnpm build:site && pnpm serve:site` and `./scripts/verify.sh`. An AI screener treats placeholders as broken claims.
4. Rename "Social Money compliance" → "The track prompt, requirement by requirement", rows in the prompt's own words (incl. the ⚠️ reputation-limit row and the checkpoint answer).
5. Add "Judge in 5 minutes": three commands, expected output, measured duration.

X post (draft in SUBMISSION_PACKAGE §b is good, 279/280): keep problem-first line; attach the video natively; post the genuine question as the first reply and tag @NearBuilders/@NearLegion there (not enough room in the post).

## (f) HACKATHON.md changes

None. Live file fetched 2026-11-13 ~06:15 UTC is byte-identical to `docs/HACKATHON.md`. New fact outside the file: the site FAQ's judging guide (technical implementation, design, impact, originality, sustainability) and the public project directory (`/api/projects`).
