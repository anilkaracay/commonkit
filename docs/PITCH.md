# PITCH — 2 minutes + judge Q&A

For a live or recorded pitch. Every fact here is in the README with a tx, test or file link; say "simulated" wherever the README does. Updated 2026-11-14: demo at https://commonkit.cayvox.com/app/, video at https://commonkit.cayvox.com/demo/. Devices are emulated or simulated (D-022); user-adoption claims require evidence.

## The 2-minute pitch

**Problem (20 s).** Sharing a makerspace printer or a dorm washer means more than keeping a booking calendar. A community also needs rules for access, a budget for running costs and a way to recognize the people who look after the equipment. These responsibilities often fall to a few members.

**Product (20 s).** COMMONKIT helps communities share and manage machines. Members book access, booking fees fund upkeep, and the community's Sputnik DAO controls budgets and rules. Each machine has a keyless NEAR account: it keeps a capped operating budget and returns surplus to the DAO. A bridge checks bookings before allowing access.

**The difference (40 s).** Care earns future use. When a rule comes due — print hours, a cleaning schedule or member fault reports — a bounded agent opens an upkeep task. A member completes it, a different member approves it, and the contributor earns usage-right cards to spend on later bookings without a usage fee. Training another member can also earn access. Receipt-backed expenses have caps and approval rules; purchases beyond the machine's budget go to a DAO vote through a proposal the machine's contract opens.

**Proof (30 s).** On NEAR testnet: two unmodified Sputnik DAOs, two community contracts and four machine accounts, all keyless. The recorded 21-step flow includes booking, refused access, independent approval, earned rights used on a booking and a treasury sweep. Read-only scripts check current state and representative transactions. Twelve profiles run on a local NEAR sandbox; devices are emulated or simulated, and no real users or physical deployment are claimed.

**Ask (10 s).** Explore the app and one completed task. Which machine would your community share, and what contribution should earn access to it?

## Judge Q&A (current reality)

| Question | Answer (two sentences at most) |
| :--- | :--- |
| Why not a database? | A database can coordinate bookings; COMMONKIT also puts funds and approval rules in contracts governed by the community's DAO. Each machine account is keyless, and no method revokes a granted usage right (step 17; practical limits are in the README). |
| What does NEAR specifically enable? | Named, keyless accounts per machine; function-call keys that limit the bridge and agent to a few methods with no deposits; unmodified Sputnik DAO, where the asset contract opens its own proposals (step 10). |
| What if the bridge fakes telemetry? | The bridge is trusted (D-009), but telemetry only opens tasks; every reward needs an independent member's approval, and the DAO can remove an operator (step 16 shows it for the agent). |
| Did you run it on a real machine? | Moonraker and Shelly adapters ran against API emulators, and the washer and fridge use a labelled simulator (D-022). No physical deployment or real-users pilot has been completed; the proposed first deployment is a staffed makerspace with one shared printer. |
| Who uses it? | The demonstrated environment uses team-controlled accounts in two communities. The first deployment plan defines supervised member participation, outcome measures and continuation criteria; these are prospective targets. |
| Is the machine really autonomous? | It has its own account, float, upkeep requests and access check; people set the rules, do the work and approve it. The agent can only open tasks the contract says are due, within quotas (step 16). |
| Won't rewards drain the machine? | Rewards are mostly usage rights, capped by a period quota; cash and expenses are capped per rule, need a council approval above a threshold and a DAO vote above the cap (step 18). Deposits are never used for any of it (`inv_custody_deposits_never_swept`). |
| Does it scale to other commons? | The same WASM runs four testnet assets in two DAOs, and the loop passes for 12 profiles in `simulate.sh`. Only the profile and the adapter change. |
| Can the DAO take a right back? | No method deletes, downgrades or transfers a granted usage right. The DAO can still make a card unusable in practice (deactivate the asset, move it to another group, add a credential requirement), and the README says so. |
| Is this a business? | A bridge kit, setup/support and an optional DAO-configured protocol fee are possible funding models; the fee is 0 in every demo profile. Prices, demand and support effort are explicit operating assumptions to test against continuation criteria. |
| How do you use Trezu? | Five custom templates compile through Trezu's own engine; one output was submitted by our script and passed on testnet. Trezu's UI was shown locally with its official testnet mock backend; its hosted mainnet app was not used (D-037). |
| Is the deployed code reproducible? | A locked host rebuild on 14 November matched both deployed artifact hashes. Docker builds give different hashes; the README distinguishes those environments rather than claiming cross-environment reproducibility (D-218). |
| Which tracks? | Social Money and NFTs That Do Something (D-032). Cards carry access and credentials; the machine accounts hold money. Wallet card display is not claimed, and Agent Economy is not selected. |
