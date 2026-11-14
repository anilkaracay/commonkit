# Submission checklist

Deadline: **14 November 2026, 23:59 UTC = 15 November, 02:59 Europe/Istanbul**. The owner publishes the X post and submits the [official form](https://nearhackathon.com/#apply). No personal fields need to be shared with an agent.

Checked on 14 November against the full [live rules](https://nearhackathon.com/HACKATHON.md); [the saved copy](HACKATHON.md) matched byte for byte. Recheck the live rules immediately before submission. [SUBMISSION_PACKAGE.md](SUBMISSION_PACKAGE.md) is the canonical copy source for the post and description. The ready-to-copy post is also in `submission/x-post.txt` (gitignored).

`[x] DONE` means verified at the stated snapshot; `[x] N/A` means no action applies. `[ ] PENDING` needs action; `[ ] UNVERIFIED` has not been independently established. Future obligations stay pending.

## Publication and owner handoff

- [x] **DONE — Public repository:** [anilkaracay/commonkit](https://github.com/anilkaracay/commonkit), checked without authentication.
- [x] **DONE — Video release checked:** `cee1ae64ed4d9e4d2e47c108d17c45a2e6befe61`; [CI passed](https://github.com/anilkaracay/commonkit/actions/runs/43592560225) and [Pages passed](https://github.com/anilkaracay/commonkit/actions/runs/43592560269). Subsequent documentation and campaign-art edits run the same workflows. The original `hackathon-submission` tag preserves `29a46d8`; v2 preserves `cd7934b`; `hackathon-submission-v3` records the final handoff. Source fixes `46fb0cb` passed [CI](https://github.com/anilkaracay/commonkit/actions/runs/43595589680) and [Pages](https://github.com/anilkaracay/commonkit/actions/runs/43595589754).
- [x] **DONE — Hosting now:** [landing](https://commonkit.cayvox.com/), [app](https://commonkit.cayvox.com/app/) and [player](https://commonkit.cayvox.com/demo/) returned HTTPS 200. Checks used the Pages address with normal TLS verification; resolver propagation can differ.
- [x] **DONE — Final video published:** 81.84 seconds, captions and disclosed synthetic narration; downloaded hosted MP4 matches `video/manifest.json` SHA-256 `ac4c7de2773421473a5b8e7205a3c239e88536c01a9bc545eb0244b0ae67ad0a`. Range requests return 206; the player and WebVTT return 200. The sequence starts with the product purpose, then includes recorded booking confirmation, earned-right zero-fee redemption and the machine-opened DAO proposal. No fresh wallet signature is recorded.
- [x] **DONE — X draft:** event wording, `@NEARProtocol`, `#NEARHackathon`, concrete NEAR role, app/repo links and a feedback question; 277 weighted characters. Community amplification tags are optional.
- [ ] **PENDING — Owner publishes X:** attach final `video/out/commonkit-demo-x-1280x720.mp4` natively. Recheck the export after any replacement render.
- [ ] **PENDING — Owner submits once:** `demoUrl` is the public X post URL, not the app/player. Finish before the deadline; retain the official success receipt.
- [ ] **UNVERIFIED — Previous submission:** no saved-submission receipt was inspected. If already saved, do not submit again; use [request changes](https://nearhackathon.com/request-changes).
- [ ] **PENDING — Retention:** repository stays public through judging; demo stays available through 18 November, ideally 25 November. Project target: 25 November.

## Rules Q-000–Q-017

| Check | Rule | Evidence / action |
| :--- | :--- | :--- |
| [x] N/A | Q-000: AI credits | Optional; operations agent uses templates, not an LLM. |
| [x] DONE | Q-001: window | [README disclosure](../README.md#hackathon-window-and-disclosure); first commit `30df77b` is 9 November. |
| [x] N/A | Q-002: other-chain baseline | No such baseline declared; README states all project code is in-window. |
| [x] DONE / N/A | Q-003: boundary | Published tag verified above. Pre-hackathon baseline tag/diff is N/A for this new project; later edits are outside the tag. |
| [x] N/A | Q-004: old project as-is | Declared as a new project, not an unchanged old submission. |
| [x] DONE | Q-005: reused work / AI | [Built with](../README.md#built-with): dependencies, assets, licenses, Claude Code, Codex, synthetic narration. |
| [x] N/A | Q-006: 1Click JWT | No Intents integration. |
| [x] N/A | Q-007: Intents network | No Intents integration or claimed Intents testnet. |
| [x] DONE | Q-008: test funds | Testnet scope disclosed; no mainnet reimbursement claim. |
| [x] DONE | Q-009: RPC / hosting | Hosted app reads testnet; hosting checked above. |
| [x] DONE | Q-010: eligibility | Testnet-only projects eligible; network limitations explicit. |
| [x] DONE | Q-011: integrations | Sputnik, Trezu and NEP-171 use documented; hints and prompts optional. |
| [x] DONE / [ ] PENDING | Q-012: demo | [Do/See and local steps](../README.md#explore-the-app), hosted video available; X post and future hosting pending. |
| [x] N/A | Q-013: rights | Informational terms; no extra deliverable. |
| [x] DONE / [ ] PENDING | Q-014: license / publicity | [MIT LICENSE](../LICENSE) exists; continued public access through judging pending. |
| [x] DONE | Q-015: other projects | README declares none by any team member (D-035); this records the declaration. |
| [x] N/A | Q-016: payout timing | Informational; owner supplies mainnet payout account in form. |
| [x] DONE | Q-017: screening | Repeatable README steps, evidence, limitations and public CI; no score or acceptance implied. |

## Tracks

- [x] **DONE — Prepared selection:** `social`, `nfts` ([D-032](DECISIONS.md), [README](../README.md#track-fit-at-a-glance)). Social: shared budgets, rewards, Sputnik governance, credential/reputation access. NFTs: NEP-171 access and credential cards with stateful behavior. Wallet display is untested and is not an eligibility condition.
- [x] **N/A — Other claims:** `defi`, `thesis`, `privacy`, `business`, `swarms`, `security`, `agents`, `realworld`, `games`, `memecoins`, `open`. No additional track claim prepared; the bounded helper is not claimed as an earn/spend/hire agent economy.
- [x] **N/A — Example prompts:** references, not mandatory feature lists. Choose tracks against live track descriptions.
- [ ] **PENDING — Owner confirms tracks** in the single submission.

## Form / exact 11-field API contract

Owner fills personal details directly in the form. Never invent values or commit a completed payload. Copy from the canonical package; its current description draft is 1,374 characters.

| Check | Field | Value / action |
| :--- | :--- | :--- |
| [x] N/A to manual entry | `requestId` | Official form handles its request; API use needs one UUID reused on retries. |
| [x] DONE | `projectName` | `COMMONKIT`, within 2–80 characters. |
| [ ] PENDING | `leadName` | Owner enters 2–80 characters. |
| [ ] PENDING | `email` | Owner's valid address, ≤160 characters; at most two independent projects per email. |
| [ ] PENDING | `size` | Exactly `1`, `2 - 4`, `4 - 6`, `6 - 8` or `8+`. |
| [ ] PENDING | `tracks` | Owner confirms `social`, `nfts`, each once. |
| [ ] PENDING | `nearAddress` | Owner's mainnet prize account, not project testnet account; lowercase, 2–64 characters, live-contract syntax. Never invented. |
| [x] DONE | `projectUrl` | `https://github.com/anilkaracay/commonkit`; prior submission uniqueness unverified. |
| [ ] PENDING | `demoUrl` | Public X post URL, ≤300 characters. |
| [x] DONE / [ ] PENDING | `idea` | Draft within 20–2,000 characters; owner reviews/pastes. |
| [ ] PENDING | `consent` | Owner reads/agrees to exact notice before selecting consent. |

- [ ] **PENDING — Website honeypot:** leave Website empty. API: omit `website`, send exactly the 11 fields, body ≤12,000 bytes; repository/post URLs ≤300 characters.
- [x] **N/A — Agent submission:** owner uses the form; no agent submission or personal-data collection needed. Agent API submission would require the exact full payload and explicit human confirmation first.
- [x] **N/A — API retries so far:** none by this audit. Later API use: `201` saved; `400` fix fields with same UUID; `403` stop; `409` never bypass with another email/repo; `413` shorten; `503` wait one minute and reuse UUID. Network-error retries also reuse it.
- [x] **DONE — History secrets scan:** Gitleaks 8.30.1 scanned 203 commits through `29a46d8`. Its 12 detections were inspected: previously recorded public Ed25519 keys, not private keys. [Sanitized result](../evidence/history-scan-2026-11-14.json). Sensitive paths remain ignored; never commit a completed personal-data payload.

Contact notice: “I agree that the organizers may use these details to review our submission and contact us about this hackathon.”

After a saved submission, the owner sends corrections through [request changes](https://nearhackathon.com/request-changes). Keep submitted email, payout account and repo values privately for that process; never create another submission to repair the first.
