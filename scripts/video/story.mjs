// The demo video's story: chapters, captions and narration, in the order scripts/video/tour.mjs walks the site (D-038, D-039).
// Each line is { text, say? }: `text` is the caption, `say` what the narrator speaks (defaults to `text`; differs where a
// code name reads badly aloud). Rule: every on-chain claim is a real testnet tx from evidence/steps.json or a live view;
// simulated devices are said so.

export const PRINTER = 'printer-01.makerlab.commonkit-sxflo.testnet';

export const TX = {
  reserve: '3hHS1wra65mLrgztB94qVNeLiUsLzNRvkfK3CbBzp6Qz', // step 2: Alex (ali) books printer-01
  transfer: '35LAjegUjbzPtUoDFhoTm1kxRtfNRJw7sS3GsqhDx6ov', // step 17: council nft_transfer refused, E_NON_TRANSFERABLE
};

export const CHAPTERS = {
  intro: {
    title: null,
    lines: [
      { text: 'Shared machines are used by everyone and looked after by no one. COMMONKIT gives each one its own NEAR account.' },
      { text: 'Open the app. No wallet is needed to look around.' },
    ],
  },
  board: {
    title: 'The app',
    lines: [
      { text: 'Four shared machines in two communities, read live from NEAR testnet.' },
      { text: 'Open the 3D printer.', say: "Let's open the 3D printer." },
    ],
  },
  printer: {
    title: 'The machine',
    lines: [
      { text: 'Its account has no keys: funds move through contract rules. The printer itself is simulated.' },
      { text: 'To use it, book it.' },
    ],
  },
  book: {
    title: 'Book',
    lines: [
      { text: 'Pick a time: a small fee, plus a deposit you get back after a clean return.' },
      { text: 'You sign with a NEAR wallet, and the booking is a testnet transaction.' },
      { text: "Alex's booking on testnet: reservation_confirmed.", say: "Here is Alex's booking, confirmed on chain." },
    ],
  },
  upkeep: {
    title: 'Upkeep',
    lines: [
      { text: 'At the machine, a bridge unlocks it only for a valid booking and reports usage on chain (simulated).', say: 'At the machine, a bridge unlocks it only for a valid booking, and reports usage on chain.' },
      { text: "When usage passes a rule, the printer's agent opens an upkeep task. Demo rule: 30 min (real: 200 h).", say: "When usage passes a rule, the printer's agent opens an upkeep task." },
    ],
  },
  task: {
    title: 'The task',
    lines: [
      { text: 'It says why: 4.3 h of nozzle time, over the rule.', say: 'It says why: four point three hours of nozzle time, over the rule.' },
      { text: 'Ava did the work, the bridge ran a test print, and Mark, another member, approved it.' },
    ],
  },
  earn: {
    title: 'Earn',
    lines: [
      { text: 'Ava earned two usage-right NFTs (NEP-171) for this printer. They cannot be sold or moved.', say: "Ava earned two usage-right NFTs for this printer. They can't be sold, or moved." },
      { text: 'A council member tried to move one. Refused on chain: E_NON_TRANSFERABLE.', say: 'A council member tried to move one. The chain refused.' },
    ],
  },
  money: {
    title: 'Money',
    lines: [
      { text: "Fees stay in the printer's own account, up to a 3 NEAR cap.", say: "Fees stay in the printer's own account, up to a three NEAR cap." },
      { text: "Excess goes to the Sputnik DAO. For larger purchases, the machine opens its own proposal.", say: 'Excess goes to the Sputnik DAO. For larger purchases, the machine opens its own proposal.' },
    ],
  },
  proof: {
    title: 'Check it',
    lines: [
      { text: 'Every claim can be checked: the Proof page re-reads them from testnet.', say: 'And every claim can be checked. The proof page re-reads them, live, from testnet.' },
      { text: 'Or run ./scripts/verify.sh. No wallet, no keys.', say: 'Or run one script. No wallet, no keys.' },
    ],
  },
};

/** All-caps names are spelled letter by letter by the voice model; say them as words. */
const spoken = (s) => s.replace(/\bNEAR\b/g, 'Near').replace(/\bCOMMONKIT\b/g, 'CommonKit');

/** Every spoken line with a stable key (chapter-index), for scripts/video/voice.py. */
export function voiceLines() {
  return Object.entries(CHAPTERS).flatMap(([id, c]) => c.lines.map((l, i) => ({ key: `${id}-${i}`, say: spoken(l.say ?? l.text) })));
}
