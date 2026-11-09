# DECISIONS (ADR log)

Append-only. Format: `## D-<nnn> — <title>` · Date · Status (accepted / superseded by D-xxx) · Context · Decision · Consequences.

---

## D-001 — Social Money is the primary track; target 1st place
2026-11-09 · accepted
Context: Official Social track asks for shared budgets, programmable rewards, collective ownership, reputation-based access on Sputnik DAO/Trezu. Competing entries focus on cash bounties, budgets and peer points; none control physical assets.
Decision: Primary `social`. Add `nfts` only if cards are verified in wallets; add `agents` only if an earn/spend loop is verified end to end.
Consequences: Narrative centers on "the asset is an economic actor"; tier approvals are secondary.

## D-002 — Two contracts: per-asset `asset`, per-community `commons`
2026-11-09 · accepted
Context: Rights are shared across asset groups and credentials are community-wide; money and device rules are per asset.
Decision: `asset` holds money/rules per asset (same WASM everywhere); `commons` holds roles, credentials and usage-right cards.
Consequences: Cross-contract calls for authorization and minting; roles pushed from commons to assets to keep checks synchronous.

## D-003 — Custody stays in the Sputnik DAO; assets keep a capped float
2026-11-09 · accepted
Context: Track prompt expects custody and approvals in the existing treasury.
Decision: Asset accounts hold deposits (liability), reserved rewards, a free float ≤ `float_cap`, storage reserve. Excess is swept to the DAO; above-cap payments are Sputnik proposals created by the asset.
Consequences: Need research C8 (contract as proposer); fallback defined.

## D-004 — Rewards are mostly usage rights, not cash
2026-11-09 · accepted
Decision: Rights are NEP-171 non-transferable cards in `commons`; cash rewards optional and capped.
Consequences: Little money sits in asset accounts; quota protects capacity.

## D-005 — No retroactive revocation; credentials can be suspended forward-only
2026-11-09 · accepted
Decision: No method removes or downgrades a granted right. DAO may suspend a credential (safety) with a recorded reason; it does not affect issued usage rights.

## D-006 — Testnet NEAR, no NEP-141 token
2026-11-09 · accepted
Decision: Native testnet NEAR for fees, deposits, rewards. Fewer moving parts.

## D-007 — No Trezu integration in v1
2026-11-09 · accepted (pending research D)
Decision: Use unmodified Sputnik; README explains compatibility and why no end-to-end Trezu claim.

## D-008 — Immutable contracts in v1
2026-11-09 · accepted
Decision: No upgrade method. Bug fix = redeploy new account + DAO re-registration. Keeps the "keyless, no one can change the rules except via new deployment approved by the DAO" story simple.

## D-009 — Bridge is trusted; telemetry alone never pays
2026-11-09 · accepted
Decision: Telemetry only opens tasks; rewards need an independent human verifier; DAO can revoke operators.

## D-010 — Agent decisions are deterministic; LLM only rephrases
2026-11-09 · accepted
Decision: Rule engine decides; optional NEAR AI Cloud LLM rephrases rationale with numeric validation; template fallback.

---

<!-- Claude Code: append new decisions below this line -->
