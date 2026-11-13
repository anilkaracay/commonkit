// The demo video's story: chapters and captions, in the order scripts/video/tour.mjs walks the site (D-038).
// Rule: every on-chain claim is a real testnet tx from evidence/steps.json or a live view; simulated devices are said so.

export const PRINTER = 'printer-01.makerlab.commonkit-sxflo.testnet';

export const TX = {
  reserve: '3hHS1wra65mLrgztB94qVNeLiUsLzNRvkfK3CbBzp6Qz', // step 2: Alex (ali) books printer-01
  transfer: '35LAjegUjbzPtUoDFhoTm1kxRtfNRJw7sS3GsqhDx6ov', // step 17: council nft_transfer refused, E_NON_TRANSFERABLE
};

export const CHAPTERS = {
  intro: {
    title: null,
    lines: [
      'Shared machines are used by everyone and looked after by no one. COMMONKIT gives each one its own NEAR account.',
      'Open the app. No wallet is needed to look around.',
    ],
  },
  board: {
    title: 'The app',
    lines: ['Two communities, four shared machines. Everything here is read live from NEAR testnet.', "Open the makerlab's 3D printer."],
  },
  printer: {
    title: 'The machine',
    lines: [
      'The printer has its own account with no keys: nobody can empty it. The printer itself is simulated.',
      'To use it, book it.',
    ],
  },
  book: {
    title: 'Book',
    lines: [
      'Pick a time. You pay a small fee plus a deposit that comes back after a clean return.',
      'You sign this with a NEAR wallet, and the booking becomes a testnet transaction.',
      "Here is Alex's booking on testnet: reservation_confirmed.",
    ],
  },
  upkeep: {
    title: 'Upkeep',
    lines: [
      'At the printer, a small bridge unlocks it only for a valid booking and reports usage on chain (simulated).',
      "When usage passes a rule, the printer's agent opens an upkeep task. Demo rule: 30 min (real: 200 h).",
    ],
  },
  task: {
    title: 'The task',
    lines: [
      'The task says why it was opened: 4.3 h of nozzle time, over the rule.',
      'Ava did the work, the bridge ran a test print, and Mark, another member, approved it.',
      'Ava earned two usage rights for this printer. They cannot be sold or moved.',
    ],
  },
  earn: {
    title: 'Earn',
    lines: ["A council member tried to move one of Ava's cards. Refused on chain: E_NON_TRANSFERABLE."],
  },
  money: {
    title: 'Money',
    lines: ["Fees go into the printer's own account, kept under a 3 NEAR cap.", "Everything above the cap goes to the community's DAO treasury."],
  },
  proof: {
    title: 'Check it',
    lines: ['Every claim can be checked: the Proof page re-reads them from testnet.', 'Or run ./scripts/verify.sh. No wallet, no keys.'],
  },
};
