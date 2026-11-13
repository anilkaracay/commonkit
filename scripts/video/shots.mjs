// The demo video's shot list: one source for recording, subtitles and assembly (docs/VIDEO_SHOTLIST.md,
// screen-only fallback per D-022; story order per D-032: refusal first). Durations in seconds; caption times are relative to the shot start.
// Rule: every on-chain shot is a real testnet tx from evidence/steps.json; every simulated device is labelled.

export const XFADE = 0.4; // crossfade between shots

export const TX = {
  reserve: '3hHS1wra65mLrgztB94qVNeLiUsLzNRvkfK3CbBzp6Qz', // step 2: Alex (ali) reserves printer-01
  sweep: 'DBTLyXkrBuovZTd6xyc9Ys3WnfBuHfiLgfEqJJquC31S', // step 6: float over cap, swept to the DAO
  transfer: '35LAjegUjbzPtUoDFhoTm1kxRtfNRJw7sS3GsqhDx6ov', // step 17: council nft_transfer refused, E_NON_TRANSFERABLE
};

export const PRINTER = 'printer-01.makerlab.commonkit-sxflo.testnet';

export const SHOTS = [
  {
    id: 's01-refusal',
    kind: 'terminal',
    dur: 9,
    what: 'Step 4 replay: Casey (no booking) asks printer-01 to unlock → can_access not_holder → bridge 403, emulated printer idle (SIMULATED)',
    captions: [
      [0.2, 4.4, 'Casey has no booking, but asks the shared printer to unlock. (simulated printer)'],
      [4.4, 8.9, 'Refused: the printer checks its own NEAR account first. No booking, no print.'],
    ],
  },
  {
    id: 's02-problem',
    kind: 'hero',
    dur: 6,
    what: 'Landing hero, the live 3D printer (print motion simulated)',
    captions: [[0.2, 5.9, "A shared machine's money and rules usually sit in one admin's spreadsheet. Here they live in its own keyless NEAR account."]],
  },
  {
    id: 's03-reserve',
    kind: 'app+explorer',
    dur: 10,
    what: 'printer-01 page (SIMULATED badge) → Reserve page → step 2 reservation tx on NEAR Rocks',
    captions: [
      [0.2, 6.4, 'Booking is a NEAR transaction: a fee plus a refundable deposit. (simulated printer)'],
      [6.4, 9.9, "Alex's booking on testnet: reservation_confirmed."],
    ],
  },
  {
    id: 's04-unlock',
    kind: 'terminal',
    dur: 13,
    what: 'simulate.sh printer_3d output + bridge console (SIMULATED, emulated Moonraker, local sandbox)',
    captions: [
      [0.2, 6.6, 'With a valid booking, the bridge unlocks the printer and the job starts. (simulated)'],
      [6.6, 12.9, "Telemetry crosses a rule, so the machine's agent opens an upkeep task. (demo threshold)"],
    ],
  },
  {
    id: 's05-task',
    kind: 'app',
    dur: 13,
    what: 'Task #0 on printer-01 (testnet): rationale → independent approval → 2 usage-right cards',
    captions: [
      [0.2, 4.6, "The agent's task on testnet, with its reason. Demo threshold 0.5 h (production 200 h)."],
      [4.6, 8.9, 'Ava does the upkeep. Mark, another member, approves it.'],
      [8.9, 12.9, 'She earns usage rights for this machine: non-transferable cards.'],
    ],
  },
  {
    id: 's06-money',
    kind: 'app+explorer',
    dur: 10,
    what: 'printer-01 Money panel (float vs cap) → step 6 sweep tx on NEAR Rocks',
    captions: [
      [0.2, 4.8, 'The machine keeps a small operating float, capped at 3 NEAR.'],
      [4.8, 9.9, "Everything above the cap is swept to the community's DAO treasury."],
    ],
  },
  {
    id: 's07-norevoke',
    kind: 'explorer',
    dur: 8,
    what: "Step 17: council member's nft_transfer of Ava's right, refused with E_NON_TRANSFERABLE",
    captions: [[0.2, 7.9, "A council member tries to take Ava's right. Refused on chain: E_NON_TRANSFERABLE."]],
  },
  {
    id: 's08-verify',
    kind: 'terminal',
    dur: 10,
    what: './scripts/verify.sh, a real read-only run against testnet',
    captions: [[0.2, 9.9, 'Check it yourself: ./scripts/verify.sh re-reads every claim from testnet, no keys needed.']],
  },
  {
    id: 's09-close',
    kind: 'landing+endcard',
    dur: 9,
    what: 'Landing 12-commons scroll (scenes section, else the care grid) → end card with URL placeholders',
    captions: [[0.2, 5.0, 'Same contract, different machines and rules: twelve profiles run in simulation.']],
  },
];

/** Absolute timeline after crossfades: [{...shot, start, end}]. Uses measured clip durations when given. */
export function timeline(durations = {}) {
  let t = 0;
  return SHOTS.map((s, i) => {
    const dur = durations[s.id] ?? s.dur;
    const start = i === 0 ? 0 : t - XFADE;
    t = start + dur;
    return { ...s, dur, start, end: t };
  });
}

const stamp = (sec) => {
  const ms = Math.round(sec * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

/** Cues with absolute times (crossfade-aware) and the SRT text. */
export function cues(durations = {}) {
  const list = timeline(durations).flatMap((s) => s.captions.map(([a, b, text]) => ({ shot: s.id, start: s.start + a, end: s.start + b, text })));
  const srt = list.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n');
  return { list, srt };
}
