# SUBMISSION

Deadline: **2026-11-14 23:59 UTC** (Türkiye: 15 Nov 02:59). Target: submit by **2026-11-14 18:00 UTC**. Re-read https://nearhackathon.com/HACKATHON.md before submitting.

**Hard stops (human only):** making the repo public, posting on X, sending the submission. Claude prepares everything and prints it.

## 1. README structure (English, judge- and machine-readable)

1. **Title + one line:** "COMMONKIT — shared things that pay for their own upkeep."
2. **Why on-chain** (the one sentence).
3. **Try it in 2 minutes** — hosted demo URL (no wallet) + three "do X → see Y" bullets.
4. **What we built during the hackathon** — bullets, each with a link (tx, test name or file).
5. **The loop** — mermaid diagram from ARCHITECTURE §4.4 (short).
6. **Scenarios table** — 8 rows with a **Status** column: `real hardware` / `simulation` / `profile example only`.
7. **Pilot** — real numbers with links; consent note; lowered thresholds note.
8. **Judge flow** — 18 steps, each "Do X → See Y" + `pnpm demo:step N` + evidence link.
9. **Verify it yourself** — `./scripts/verify.sh` output sample; `./scripts/simulate.sh washer`.
10. **Social Money compliance table** (PRODUCT_TR §17, translated).
11. **Architecture** — accounts table, contracts, bridge, agent; link to docs/.
12. **Security model & honest limits** (PRODUCT_TR §20, translated).
13. **Trezu** paragraph (DAO_INTEGRATION §7).
14. **Run locally** — clean-clone commands.
15. **Built with** — libraries, templates, AI tools used (Claude Code), per HACKATHON.md Q-005.
16. **Hackathon window** — all code written after 2026-10-19; link to first commit.
17. **Other project disclosure** — if any team member submits another project, name it here (Q-015).
18. **License** — MIT.

No marketing adjectives. Every claim has a link or a test name.

## 2. X demo post (draft — the human posts it)

```
Shared machines get used by everyone and maintained by no one.

COMMONKIT gives each shared thing its own keyless NEAR account. Our makerspace 3D printer:
• only prints for an on-chain reservation
• opens its own maintenance task when telemetry says so
• pays whoever fixes it with usage rights nobody can take back
• sweeps its extra cash to the community's Sputnik DAO

Same contract runs a laser cutter (credential required) and a dorm washer (simulated).

Built at NEAR HACKATHON @NEARProtocol #NEARHackathon @NearBuilders @NearLegion
Demo: <url>  Code: <repo>
What shared thing in your life should pay for its own upkeep?
```

Attach the 90-second video.

## 3. Submission payload (draft — print, wait for explicit yes)

| Field | Value |
| :--- | :--- |
| projectName | COMMONKIT |
| leadName | (human) |
| email | (human) |
| size | (human: `1`, `2 - 4`, ...) |
| tracks | `["social"]` + `"nfts"` if NEP-171 cards verified in wallets + `"agents"` only if the agent's earn/spend loop is verified end to end |
| nearAddress | (human, **mainnet** account for payout) |
| projectUrl | public GitHub repo URL |
| demoUrl | X post URL |
| idea | ≤ 2000 chars; draft below |
| consent | true only after the human agrees to the notice verbatim |

`requestId`: generate once (`node -e 'console.log(crypto.randomUUID())'`), store locally (not committed), reuse on retry.

### `idea` draft (fit to ≤ 2000 chars after final numbers)

> Shared equipment in communities — makerspace printers, dorm washers, co-op tractors — is used by everyone and maintained by no one, and its money and rules live in one admin's spreadsheet. COMMONKIT gives every shared asset its own keyless NEAR account running the same contract. Members reserve on-chain; a small bridge next to the device only unlocks it for a valid reservation (NEP-413 signed request + on-chain check). Fees fill a capped operating float; everything above the cap is swept to the community's unmodified Sputnik DAO, and larger purchases become Sputnik proposals opened by the asset contract itself. The bridge reports telemetry; when a profile rule is due, the asset's operations agent (function-call key, contract-enforced caps and quotas) opens a maintenance task with a rationale. A member does the work, the bridge runs a verification test, an independent member approves, and the maintainer receives non-transferable NEP-171 usage-right cards that no admin can revoke. Risky machines require credential cards; trainers earn rights. Same WASM, different profile + adapter: we run a real 3D printer and a smart-plug device in a real makerspace pilot (N members, N sessions), and a simulated dorm washer in a second DAO. Testnet only. Everything claimed is verifiable with scripts/verify.sh.

## 4. Final checklist

- [ ] Repo public (human) with LICENSE, README, docs, evidence.
- [ ] Hosted demo up; will stay up through 2026-11-25.
- [ ] verify.sh green; evidence complete.
- [ ] Video ≤ 90 s uploaded with the post (human).
- [ ] Payload printed and confirmed by the human; submitted once; 201 received and recorded (without personal data) in STATUS.md.
