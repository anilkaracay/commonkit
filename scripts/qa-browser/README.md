# Local signer browser QA

This is an opt-in, local-only integration harness, not application code or a wallet integration.
It overrides the Vite entry in memory to render the existing React routes with a temporary
`WalletContext`. The private key stays in Node's legacy NEAR keychain; the browser receives only
the public account and transaction result. The temporary signing endpoint binds `127.0.0.1`,
checks Host, Origin and a per-run token, and allows one future one-slot printer booking with
exact fee/deposit (at most 3 testnet NEAR), followed only by cancellation of that QA-owned booking.
The browser and server stop in `finally`.

Only `ck-browser-qa-261114.testnet` can sign. Create/fund this dedicated testnet account outside
the harness and save its credential in the standard local keychain. Do not commit credentials.
No new dependencies are installed. From the repository root, after authorizing this testnet spend:

```sh
scripts/node_modules/.bin/tsx scripts/qa-browser/run.ts
```

`--resume` uses the existing evidence's booking instead of making another. `--resume --finalize`
is read-only: it checks an already cancelled booking in a fresh browser, verifies NEP-413 against
the live account key, and records final balances. It cannot create or cancel a reservation.

The recorded November 14 run exercised the real reservation UI, received the chain transaction
confirmation and observed the selected slot become unavailable. Public RPC throttling stalled
navigation to the asset page before a UI cancellation click. Server-side cleanup cancelled the
booking and the full 2.25 NEAR refund succeeded. A later fresh browser read displayed Cancelled.
These are separate assertions in `evidence/browser-wallet-qa.json`; the unsuccessful attempts are
retained there. A changed NEP-413 message was rejected and the signing key's live FullAccess
ownership was checked. No physical device was unlocked.

This **does not test a third-party wallet**, near-connect, a popup, extension, mobile wallet, or
redirect. Browser RPC requests in the final check were forwarded serially to the public alternate
testnet RPC through Playwright to avoid burst throttling; responses were real, not fixtures.
