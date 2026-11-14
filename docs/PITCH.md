# PITCH — 2 minutes + judge Q&A

For a live or recorded pitch. Every fact here is in the README with a tx, test or file link; say "simulated" wherever the README does. Updated 2026-11-14: demo at https://commonkit.cayvox.com/app/, video at https://commonkit.cayvox.com/demo/. Devices are emulated or simulated (D-022); user-adoption claims require evidence.

## The 2-minute pitch (about 290 words)

**Problem (20 s).** Every community has shared things: a makerspace printer, a dorm washer, a co-op tractor, a neighbourhood fridge. Everyone uses them, almost no one looks after them, and their money and rules sit in one admin's spreadsheet. When that admin leaves, the system dies.

**Idea (20 s).** COMMONKIT gives each shared thing its own keyless NEAR account. Members book it on chain, and a small bridge next to the device unlocks it only for a valid booking. Fees fill a small capped float; everything above the cap goes back to the community's Sputnik DAO.

**The loop (40 s).** The machine asks for its own care. When a rule comes due — print hours, a weekly cleaning, two members reporting a fault — an operations agent opens an upkeep task. A member does the work, a different member approves it, and the worker gets usage-right cards that no method can revoke. Fix it, refill it, clean it, check it, teach it: every kind of care earns access. Restock and repair can claim a capped, receipt-backed expense, and big purchases become DAO proposals that the machine's contract opens itself.

**Proof (30 s).** On NEAR testnet we run two unmodified Sputnik DAOs, two community contracts and four asset accounts, all keyless; the four machines share one code hash. All 21 judge steps passed with tx links, and `verify.sh` checks every claim without keys. `simulate.sh` runs the whole loop for 12 kinds of commons on a local NEAR sandbox. The devices in this demo are emulated and labelled so.

**Ask (10 s).** Try `/app`, run `simulate.sh`, and tell us which shared thing near you should pay for its own upkeep.

## Judge Q&A (current reality)

| Question | Answer (two sentences at most) |
| :--- | :--- |
| Why not a database? | In a database the machine's money and rules belong to whoever runs it. Here the money sits in a keyless account governed by the community's DAO, and a granted right has no revoke method (step 17). |
| What does NEAR specifically enable? | Named, keyless accounts per machine; function-call keys that limit the bridge and agent to a few methods with no deposits; unmodified Sputnik DAO, where the asset contract opens its own proposals (step 10). |
| What if the bridge fakes telemetry? | The bridge is trusted (D-009), but telemetry only opens tasks; every reward needs an independent member's approval, and the DAO can remove an operator (step 16 shows it for the agent). |
| Did you run it on a real machine? | No. The real Moonraker and Shelly adapters ran against emulators of their documented APIs, and the washer and fridge run on a simulator; every screen says SIMULATED (D-022). A real smart plug with a lamp stand-in and a real-users pilot are planned (D-024). |
| Who uses it? | No real users yet; all accounts in the demo are team-controlled demo accounts. If the pilot runs, the README will give the real numbers with tx links, whatever they are. |
| Is the machine really autonomous? | It has its own account, float, upkeep requests and access check; people set the rules, do the work and approve it. The agent can only open tasks the contract says are due, within quotas (step 16). |
| Won't rewards drain the machine? | Rewards are mostly usage rights, capped by a period quota; cash and expenses are capped per rule, need a council approval above a threshold and a DAO vote above the cap (step 18). Deposits are never used for any of it (`inv_custody_deposits_never_swept`). |
| Does it scale to other commons? | The same WASM runs four testnet assets in two DAOs, and the loop passes for 12 profiles in `simulate.sh`. Only the profile and the adapter change. |
| Can the DAO take a right back? | No method deletes, downgrades or transfers a granted usage right. The DAO can still make a card unusable in practice (deactivate the asset, move it to another group, add a credential requirement), and the README says so. |
| Is this a business? | A hardware bridge kit and a small protocol fee the DAO can switch on (0 in every profile today). It is not validated. |
| How do you use Trezu? | Five custom templates compile through Trezu's own engine; one output was submitted by our script and passed on testnet. Trezu's UI was shown locally with its official testnet mock backend; its hosted mainnet app was not used (D-037). |
| Is the deployed code reproducible? | The deployed code is a host build that reproduces with the same toolchain; a Docker reproducible build of the same source gives different hashes, so we do not claim reproducibility (D-218). |
| Which tracks? | Social Money and NFTs That Do Something (D-032). Cards carry access and credentials; the machine accounts hold money. Wallet card display is not claimed, and Agent Economy is not selected. |
