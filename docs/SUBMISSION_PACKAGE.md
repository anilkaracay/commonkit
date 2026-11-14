# SUBMISSION_PACKAGE — G6 handover (drafts only)

The post and form copy here are drafts for the owner, who publishes the X post and submits the form (D-026). The repository is already public. This file holds **no personal data**: personal fields are placeholders. The owner can enter them directly in the official form; no agent collection is needed. Any optional local filled copy belongs only in the gitignored `submission/` folder.

Rules source: [`docs/HACKATHON.md`](HACKATHON.md) (live rules rechecked 2026-11-14). Deadline: **2026-11-14 23:59 UTC = 15 November 02:59 Europe/Istanbul**. Submit one project once, with the public repository and the published X demo post. Leave the form's **Website field empty**: the API identifies it as a spam trap.

## (a) Current readiness

[SUBMISSION.md](SUBMISSION.md) is the canonical operations checklist, including evidence, pending owner actions and future obligations. This package supplies copy; do not treat old release checks as verification of later edits.

- [x] **Public repository:** verified through GitHub's API on 14 November.
- [x] **Existing tags:** `hackathon-submission` records `29a46d8`; `hackathon-submission-v2` records `cd7934b`. Do not recreate or silently move either tag. The final handoff uses a new `hackathon-submission-v3` tag; the earlier tags stay unchanged.
- [x] **CI and Pages:** passed for the published releases linked in SUBMISSION.md. New edits need their own workflow results after publication.
- [x] **Hosted app and video:** currently served by GitHub Pages over HTTPS. The final 81.84-second purpose-first render is described by `video/manifest.json`; publication is verified against its hash.
- [x] **License and disclosures:** root MIT LICENSE, README dependencies/AI disclosures and development-window/other-project declaration exist. Local README link paths were checked; this does not claim a browser rendering check of unpublished edits.
- [x] **Sensitive local paths ignored:** `.env` variants, key/credential paths and `submission/` are excluded. No personal fields were collected for this package.
- [x] **History secrets scan:** Gitleaks 8.30.1 scanned 203 commits through `29a46d8` on 14 November; all 12 detections were historical public Ed25519 keys. [Sanitized result](../evidence/history-scan-2026-11-14.json). This is a scoped check, not a guarantee about later edits.
- [ ] **Owner X post and saved form submission:** still pending; one submission per project.
- [ ] **Retention:** keep repository public through judging and hosting through 18 November, ideally 25 November.

## (b) X demo post (≤ 280 characters, D-023)

Requirements (HACKATHON.md §2, re-read live 2026-11-14): says it was built at NEAR HACKATHON, tags @NEARProtocol and #NEARHackathon, video attached, problem first, NEAR's concrete role, demo and repo links, and "ask a genuine question or invite specific feedback" (the question line, added 2026-11-13). Optional tags @NearLegion and @NearBuilders do not fit in 280 characters; they can go in a reply.

<!-- character count: 277 / 280 (URLs count as 23) -->
```text
Shared machines need shared rules.

Built at NEAR HACKATHON: COMMONKIT uses keyless NEAR accounts for bookings & budgets. Approved contributions earn access NFTs.

Testnet: https://commonkit.cayvox.com/app/
Code: https://github.com/anilkaracay/commonkit
What would you share?
@NEARProtocol #NEARHackathon
```

- The post contains the live testnet app and public repository URLs directly.
- NEAR's role in the post: machine accounts coordinate bookings and shared funds; independently approved upkeep earns usage rights.
- The draft includes a question: "What would you share?"
- @NearLegion and @NearBuilders are optional; adding both (24 characters with spaces) would exceed 280 with this text.
- Attach `video/out/commonkit-demo-x-1280x720.mp4` natively to the X post; the repository copy is `video/commonkit-demo.mp4`. Captions: `video/commonkit-demo.en.srt`.
- Recount after any edit: `node -e 'const t=require("fs").readFileSync(0,"utf8").trim();console.log(t.replace(/https?:\/\/\S+/g,"x".repeat(23)).length)' < post.txt`.

## (c) Form checklist (field → value)

The owner fills personal values directly in the official form. For an API submission, send exactly these 11 fields, omit `website`, keep any completed payload gitignored, and obtain explicit confirmation of the exact payload before sending.

| Field | Value | Source / rule |
| :--- | :--- | :--- |
| requestId | `<generate once: node -e 'console.log(crypto.randomUUID())'>`, reuse on retry | HACKATHON.md §3 |
| projectName | `COMMONKIT` | 2–80 chars |
| leadName | `<H6: lead name>` | human |
| email | `<H6: contact email>` | human; ≤ 160 chars; ≤ 2 submissions per email |
| size | `<H6: one of 1, 2 - 4, 4 - 6, 6 - 8, 8+>` | human, exact string |
| tracks | `["social", "nfts"]` | see decision below (D-032) |
| nearAddress | `<H6: mainnet payout account>` | human; lowercase, regex in HACKATHON.md; never invented |
| projectUrl | `https://github.com/anilkaracay/commonkit` (only once public) | unique per submission |
| demoUrl | `<H8: URL of the published X post>` | human posts first |
| idea | text in (d) | 20–2000 chars |
| consent | `true` only after the human agrees to: "I agree that the organizers may use these details to review our submission and contact us about this hackathon." | human |

**Tracks decision (D-032):** `social` and `nfts`.
- `social` (Social Money): shared budgets (capped float + Sputnik treasury), programmable rewards (upkeep tasks), collective ownership (keyless asset accounts governed by unmodified Sputnik DAOs) and reputation-based access (credential cards, clean-return deposits). The README explains that reputation can lower deposits while cash approval thresholds remain fixed per profile and governed by DAO proposals.
- `nfts` (NFTs That Do Something): usage rights and credentials are NEP-171/177/181 non-transferable tokens that carry access rights and credentials, the track's own words; each machine is an account that holds money. Verified on testnet 2026-11-13: `nft_metadata` spec `nft-1.0.0`, `nft_total_supply` 7 on `commons.makerlab.commonkit-sxflo.testnet` (README "Cards that do something" section has the command). Wallet display is **not** tested and not claimed. This supersedes the earlier wallet-display precondition (D-001).
- `agents`: not claimed. Our agent opens tasks and escalates purchases within contract limits; it does not earn, spend, negotiate or hire on a market (research A8).

Order of human actions: H7 repo public → H8 X post → H9 submit with `demoUrl` = the post. A submission cannot be edited; mistakes go through https://nearhackathon.com/request-changes (never a second submission).

## (d) `idea` text (1374 / 2000 characters)

Verified facts only (README links each one).

```
COMMONKIT helps communities share and govern machines, from makerspace printers to dorm washers. Shared equipment needs more than a booking calendar: access rules, an operating budget and a fair way to reward the people who keep it useful.

Members reserve equipment and pay a usage fee plus a refundable deposit. The community's existing Sputnik DAO controls budgets and rules. Each machine has its own keyless NEAR account: fees fund a capped operating budget, surplus returns to the DAO, and larger purchases go to a vote through proposals opened by the machine's contract.

Contributions earn future use. A rule-bound operations agent opens due upkeep tasks; a different member approves completed work. Contributors receive non-transferable NEP-171 usage-right NFTs, which cover the usage fee for later bookings, lock while reserved and become consumed after use. Training credentials control access to equipment that requires them. A device bridge checks signed requests against on-chain reservations before allowing access.

The live NEAR testnet demo includes four machines in two communities and eight keyless accounts overall, with a recorded 21-step workflow. Read-only proof checks account keys, matching code hashes and balanced ledgers; 12 profiles run with real contracts in a local NEAR sandbox. The demo uses clearly labelled device emulators and simulation.
```

## Filled copy

`submission/` is gitignored. Its `FILL_ME.md` is an optional local template; the owner need not provide personal fields to an agent. Never commit a filled payload, paste it into an issue or send it anywhere except the official form/API.
