// Purpose, then evidence: booking → upkeep → earned right → zero-fee redemption → DAO purchase.
export const PRINTER = 'printer-01.makerlab.commonkit-sxflo.testnet';
export const TX = {
  reserve: '3hHS1wra65mLrgztB94qVNeLiUsLzNRvkfK3CbBzp6Qz',
  redeem: '5HGbP8ji8pyb53vJdCqhWWJzoVGpVDynx1v11HKouyD6',
};
export const CHAPTERS = {
  intro: { title: 'COMMONKIT', lines: [
    { text: 'Share and manage community machines. Book access. Fund upkeep. Earn usage rights.', say: 'CommonKit helps communities share and manage machines. Members book access; fees fund upkeep, and contributors earn usage rights.' },
  ] },
  book: { title: 'Book', lines: [
    { text: 'Book a shared printer: a usage fee for upkeep, plus a refundable deposit.' },
    { text: "Recorded testnet booking: Alex's two-slot reservation.", say: "This recorded NEAR testnet transaction confirms Alex's booking." },
  ] },
  upkeep: { title: 'Care', lines: [
    { text: 'A bridge checks the booking and reports usage. These devices are emulated.' },
    { text: "A due rule lets the printer's agent open an upkeep task. Demo: 30 min; production: 200 h.", say: "When usage crosses a rule, the printer's agent opens an upkeep task." },
  ] },
  task: { title: 'Independent approval', lines: [
    { text: 'Ava cleaned the nozzle. A test print passed, and Mark independently approved her work.' },
  ] },
  earn: { title: 'Earn access', lines: [
    { text: 'She earned two non-transferable usage-right NFTs.', say: 'She earned two non-transferable usage rights.' },
  ] },
  redeem: { title: 'Use the reward', lines: [
    { text: 'Ava used right-3 for this booking: zero usage fee. The refundable deposit still applies.', say: 'Ava used right three for this booking: zero usage fee. The refundable deposit still applies.' },
    { text: 'After the session, the right was consumed. Her care earned access.' },
  ] },
  money: { title: 'A machine with a budget', lines: [
    { text: 'Each machine runs its own keyless NEAR account, with a capped operating budget.' },
    { text: "Excess fees go back to the community's Sputnik DAO." },
  ] },
  proposal: { title: 'The machine opens a proposal', lines: [
    { text: 'For a larger purchase, the printer itself opened proposal #10.', say: 'For a larger purchase, the printer itself opened proposal ten.' },
    { text: 'The council approved it. The DAO paid the demo supplier 4 testnet NEAR.', say: 'The council approved it. The DAO paid the demo supplier four testnet Near.' },
  ] },
  proof: { title: 'Verify it', lines: [
    { text: 'Inspect the live checks: eight keyless accounts, matching machine code hashes, balanced ledgers.', say: 'Inspect the live checks: eight keyless accounts, one machine contract, balanced ledgers.' },
    { text: 'Or run the verifier. No wallet, no keys. COMMONKIT: care earns access.' },
  ] },
};
const spoken = (s) => s.replace(/\bNEAR\b/g, 'Near').replace(/\bCOMMONKIT\b/g, 'CommonKit');
export function voiceLines() {
  return Object.entries(CHAPTERS).flatMap(([id, c]) => c.lines.map((l, i) => ({ key: `${id}-${i}`, say: spoken(l.say ?? l.text) })));
}
