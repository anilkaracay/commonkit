/** Renders every data-driven block of index.html at build time (static HTML, no layout shift, works without JS).
 * Every number is read from the testnet snapshot or a repo file (see data.ts); the build fails if one is missing. */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AssetSnap } from '../src/lib/chain.ts';
import { esc, firstLabel, int, near, triggerText, type Trigger } from '../src/lib/format.ts';
// The /near entry has no internal imports, so Node can load it as-is when vite.config renders the page.
import { nearAmountHtml, nearMarkSvg } from '@commonkit/design/near';
import { lockupSvg } from '@commonkit/design/logo';
import { displayName } from '@commonkit/sdk/cast';
import { REPO, type DemoOverride, type JudgeStep, type LandingData, type Profile } from './data.ts';

export const REPO_URL = 'https://github.com/anilkaracay/commonkit';
const tx = (h: string) => `https://testnet.nearblocks.io/txns/${h}`;
const pct = (x: number) => `${Math.round(Math.max(0, Math.min(1, x)) * 1000) / 10}%`;
const ratio = (a: string, b: string) => (BigInt(b) === 0n ? 0 : Number((BigInt(a) * 10000n) / BigInt(b)) / 10000);
/** Escapes text and turns every "<amount> NEAR" into the NEAR mark + figures (prose keeps the word elsewhere). */
const withNear = (text: string) => esc(text).replace(/(\d+(?:\.\d+)?) NEAR\b/g, (_, n: string) => nearAmountHtml(n));
const gauge = (v: number, label: string, due = false) => `<div class="ck-gauge${due ? ' is-due' : ''}" role="img" aria-label="${esc(label)}"><span style="--v:${pct(v)}"></span></div>`;
const nearFixed = (y: string | bigint, dp = 2) => {
  const s = 10n ** BigInt(24 - dp), r = (BigInt(y) + s / 2n) / s, p = 10n ** BigInt(dp);
  return `${r / p}.${(r % p).toString().padStart(dp, '0')}`;
};

/** Short names for the twelve commons (the profile display names are long). */
export const SHORT: Record<string, string> = {
  printer_3d: '3D printer', laser_cutter: 'Laser cutter', washer: 'Washer', community_fridge: 'Community fridge',
  gpu_server: 'GPU server', tractor: 'Tractor', emergency_generator: 'Generator', microscope: 'Microscope',
  rehearsal_room: 'Rehearsal room', ev_charger: 'EV charger', cargo_bike: 'Cargo bike', tool_library_ladder: 'Ladder',
};
export const CARE_ORDER = ['printer_3d', 'laser_cutter', 'washer', 'community_fridge', 'gpu_server', 'tractor', 'emergency_generator', 'ev_charger', 'cargo_bike', 'microscope', 'rehearsal_room', 'tool_library_ladder'];
/** Display names (D-036) derived from account ids through the SDK's cast; the /cast entry has no imports, so
 * Node can load it while vite.config renders the page. */
const who = (acct: string | null | undefined) => displayName(firstLabel(acct ?? ''));
const RULE_NAME: Record<string, string> = { nozzle_clean: 'Nozzle clean', bed_level: 'Bed level', filament_spool: 'Filament spool', fault_repair: 'Fault repair' };

function step(d: LandingData, n: number): JudgeStep {
  const s = d.steps.find((x) => x.step === n);
  if (!s || s.status !== 'passed') throw new Error(`evidence/steps.json: step ${n} missing or not passed`);
  return s;
}
const stepTx = (d: LandingData, n: number, re: RegExp) => {
  const t = step(d, n).txs.find((x) => re.test(x.label));
  if (!t) throw new Error(`step ${n}: no tx matching ${re}`);
  return t;
};

function printer(d: LandingData): { a: AssetSnap; p: Profile } {
  const a = d.snapshot.assets.find((x) => x.asset_type === 'printer_3d');
  const p = d.profiles.find((x) => x.asset_type === 'printer_3d');
  if (!a || !p) throw new Error('printer-01 missing from snapshot or profiles');
  return { a, p };
}

/** The override in force for a rule at a moment (latest override/restore before `at`), if it was an override. */
function overrideAt(list: DemoOverride[] | undefined, rule: string, atMs: number): DemoOverride | null {
  const before = (list ?? []).filter((o) => o.rule_id === rule && Date.parse(o.at) <= atMs);
  const last = before.at(-1);
  return last?.kind === 'override' ? last : null;
}
const nowOverride = (d: LandingData, a: AssetSnap, rule: string) => overrideAt(d.overrides[a.account], rule, Date.now());

// ---------- hero ----------

export function heroCallouts(d: LandingData): string {
  const { a } = printer(d);
  const nozzle = a.rules.find((r) => r.rule_id === 'nozzle_clean')!;
  const thr = 'Metric' in nozzle.trigger ? Number((nozzle.trigger as { Metric: { threshold: number } }).Metric.threshold) : 0;
  const ov = nowOverride(d, a, 'nozzle_clean');
  // The positive real story: the upkeep task the agent opened in judge step 7 and the verifier approved in step 8.
  const doneId = String(step(d, 7).outputs.task_id ?? '0');
  const done = a.tasks.find((t) => t.id === doneId && t.status === 'Rewarded');
  step(d, 8);
  const items: [string, string, string, string][] = [
    ['nozzle', `${int(nozzle.due_value)} / ${int(thr)} s`, ov ? 'Nozzle time · demo threshold' : 'Nozzle time since the last clean', 'nozzle'],
    ['screen', `<span class="ck-near">${nearMarkSvg()}<span class="ck-num" data-live="float">${nearFixed(a.ledger.float_free)} / ${nearFixed(a.ledger.float_cap)}</span><span class="ck-sr"> NEAR</span></span>`, 'Float, capped', ''],
  ];
  if (done)
    items.push(['upkeep', `${done.rule_id === 'nozzle_clean' ? 'Nozzle cleaned' : `${esc(RULE_NAME[done.rule_id] ?? done.rule_id)} done`}`, `Done by ${esc(who(done.claimer))}, verified by ${esc(who(done.verifier))}`, 'upkeep']);
  return items.map(([k, v, c, live]) => `<li class="callout" data-anchor="${k}"><span class="v ck-num"${live ? ` data-live="${live}"` : ''}>${v}</span><span class="c">${esc(c)}</span></li>`).join('');
}

// ---------- how it works ----------

export function how(d: LandingData): string {
  const { a, p } = printer(d);
  // Every card shows a judge step that passed on testnet; the build fails if one is missing.
  for (const [n, re] of [[2, /reserves/], [3, /session_started/], [7, /open_upkeep_task/], [8, /approves/], [9, /finalize_right/]] as const) stepTx(d, n, re);
  const t0 = a.tasks.find((t) => t.id === '0')!;
  const fee = BigInt(p.price_per_slot) * 2n;
  const card = (n: number, title: string, line: string, visual: string, art: string) => `<li class="how-step">
    <div class="how-visual${art ? ' has-art' : ''}">${art ? `<img src="/posters/${art}-960.webp" width="960" height="720" alt="" loading="lazy" decoding="async">` : ''}${visual}</div>
    <div class="how-text"><span class="how-n ck-num">0${n}</span><h3>${title}</h3><p>${line}</p></div>
  </li>`;
  return [
    card(1, 'Reserve', 'Pay the fee and a refundable deposit to the machine’s own account.', `<div class="mini ck-card">
        <p class="mini-k">Reservation · ${esc(SHORT.printer_3d!)}</p>
        <dl class="ck-rows">
          <div><dt>Member</dt><dd>${esc(who(stepTx(d, 2, /reserves/).by))}</dd></div>
          <div><dt>Slots</dt><dd class="ck-num">2</dd></div>
          <div><dt>Fee</dt><dd>${nearAmountHtml(nearFixed(fee))}</dd></div>
          <div><dt>Deposit, refundable</dt><dd>${nearAmountHtml(nearFixed(p.deposit))}</dd></div>
        </dl>
        <p class="mini-ok"><span class="ck-dot" aria-hidden="true"></span>Confirmed on testnet</p>
      </div>`, 'how-reserve'),
    card(2, 'Unlock', 'The bridge unlocks only for a valid on-chain reservation.', `<div class="mini ck-card">
        <p class="mini-k">Bridge access check</p>
        <ul class="mini-list">
          <li><span>${esc(who(stepTx(d, 2, /reserves/).by))} · reservation valid</span><b>Unlocked</b></li>
          <li><span>${esc(who('can'))} · no reservation</span><b class="no">Refused</b></li>
        </ul>
      </div>`, 'how-unlock'),
    card(3, 'Upkeep', 'The machine’s agent opens a task only when telemetry crosses a rule. Another member verifies.', `<div class="mini ck-card">
        <p class="mini-k">Upkeep task · ${esc(RULE_NAME[t0.rule_id] ?? t0.rule_id)}</p>
        <dl class="ck-rows">
          <div><dt>Done by</dt><dd>${esc(who(t0.claimer))}</dd></div>
          <div><dt>Verified by</dt><dd>${esc(who(t0.verifier))}</dd></div>
          <div><dt>Status</dt><dd>${esc(t0.status)}</dd></div>
        </dl>
      </div>`, 'how-upkeep'),
    card(4, 'Earn access', `The maintainer receives ${t0.reward_rights} usage rights and books the machine with them, fee-free.`, `<div class="mini ck-card">
        <p class="mini-k">Reservation · with a usage right</p>
        <dl class="ck-rows">
          <div><dt>Member</dt><dd>${esc(who(t0.claimer))}</dd></div>
          <div><dt>Fee</dt><dd>${nearAmountHtml('0.00')}</dd></div>
          <div><dt>Right</dt><dd>Consumed after the print</dd></div>
        </dl>
      </div>`, 'how-earn'),
  ].join('');
}

// ---------- the real-world sequence (scroll stage) ----------

/** Profile rule trigger, and the demo value in force on testnet when it was lowered (evidence/demo-overrides.json). */
function ruleText(d: LandingData, type: string, rule: string): { prod: string; demo: string | null } {
  const p = d.profiles.find((x) => x.asset_type === type);
  const r = p?.rules.find((x) => x.rule_id === rule);
  if (!p || !r) throw new Error(`profile rule ${type}.${rule} missing`);
  const a = d.snapshot.assets.find((x) => x.asset_type === type);
  const ov = a ? overrideAt(d.overrides[a.account], rule, Date.now()) : null;
  const demo = ov ? (/h$/.test(ov.value) ? `${ov.value.replace(/h$/, '')} h` : triggerText(withThreshold(r.trigger, Number(ov.value)))) : null;
  return { prod: triggerText(r.trigger), demo };
}
const withThreshold = (t: Trigger, v: number): Trigger => ('Metric' in t ? { Metric: { ...t.Metric, threshold: v } } : 'Schedule' in t ? { Schedule: { every_hours: v } } : t);

/** "every 30 min of printing" → "30 min"; "every week" stays. */
const trim = (x: string) => (/^every \d/.test(x) ? x.replace(/^every /, '').replace(/ of \w+$/, '') : x);

/** One beat of a scene's timeline: who acted (with role), what happened, and one quiet on-chain detail. */
interface Beat { who: string; role: string; what: string; chain?: string; tx?: string }
interface SceneCopy { kind: string; place: string; title: string; line: string; beats: Beat[]; outcome: { k: string; v: string; sub: string }; note: string; poster: string }

/** The tx in a judge step whose label matches, or a build error (every linked detail must exist in evidence). */
const txOf = (d: LandingData, n: number, re: RegExp) => stepTx(d, n, re).hash;
const nearOf = (y: string) => nearFixed(y).replace(/\.00$/, '');

export function sceneCopy(d: LandingData): SceneCopy[] {
  const { a } = printer(d);
  const t0 = a.tasks.find((t) => t.id === String(step(d, 7).outputs.task_id ?? '0') && t.status === 'Rewarded');
  if (!t0) throw new Error('printer task from step 7 is not rewarded');
  const nozzle = ruleText(d, 'printer_3d', 'nozzle_clean');
  // Washer (step 19).
  const s19 = step(d, 19);
  const signer = (re: RegExp) => { const t = s19.txs.find((x) => x.ok && re.test(x.label)); return t ? who(t.by) : undefined; };
  const reporter = signer(/reports a fault/);
  const verifier = signer(/approves/);
  const steward = signer(/out_of_service/);
  const canFee = String(s19.outputs.can_fee ?? '');
  const repairer = who(s19.txs.find((t) => /^claim task/.test(t.label))?.by);
  const repairRights = d.profiles.find((x) => x.asset_type === 'washer')!.rules.find((r) => r.rule_id === 'fault_repair')!.reward_rights;
  if (!reporter || !verifier || !steward || !canFee || !s19.txs.some((t) => t.error_code === 'E_OUT_OF_SERVICE')) throw new Error('step 19 evidence changed');
  const washer = d.snapshot.assets.find((x) => x.asset_type === 'washer');
  // Laser (steps 11–13): names from the signers of the evidence transactions.
  const trainee = who(stepTx(d, 11, /no credential/).by);
  const trainer = who(stepTx(d, 12, /proposes/).by);
  const approver = who(stepTx(d, 12, /approves training/).by);
  const fridge = ruleText(d, 'community_fridge', 'weekly_clean');
  const fridgeRule = d.profiles.find((x) => x.asset_type === 'community_fridge')!.rules.find((r) => r.rule_id === 'weekly_clean')!;
  if (!step(d, 20).txs.some((t) => t.error_code === 'E_RULE_NOT_DUE')) throw new Error('step 20 evidence changed');
  const gen = d.profiles.find((x) => x.asset_type === 'emergency_generator')!;
  const fuel = gen.rules.find((r) => r.rule_id === 'fuel_refill')!;
  const test = gen.rules.find((r) => r.rule_id === 'monthly_test_run')!;
  const cap = nearOf(fuel.reimbursable_max);
  return [
    {
      kind: 'printer_3d', place: 'Makerspace · 3D printer', title: 'The printer asks for care.', poster: 'scene-1',
      line: `Nozzle time crosses its rule. ${who(t0.claimer)} cleans it, ${who(t0.verifier)} verifies, ${who(t0.claimer)} earns ${t0.reward_rights} usage rights.`,
      beats: [
        { who: 'Printer', role: 'telemetry', what: 'Nozzle time crosses the cleaning rule', chain: nozzle.demo ? `${nozzle.demo.replace(/^every /, '')} · demo threshold` : undefined },
        { who: 'Agent', role: 'operations agent', what: 'Opens the nozzle task', chain: `reward ${t0.reward_rights} usage rights`, tx: txOf(d, 7, /open_upkeep_task/) },
        { who: who(t0.claimer), role: 'member', what: 'Cleans the nozzle; the bridge runs a calibration print', chain: 'work submitted', tx: txOf(d, 8, /^submit task/) },
        { who: who(t0.verifier), role: 'verifier', what: 'Approves the work', chain: `+${t0.reward_rights} usage rights to ${who(t0.claimer)}`, tx: txOf(d, 8, /approves/) },
      ],
      outcome: { k: 'Usage rights', v: `${t0.reward_rights} → ${who(t0.claimer)}`, sub: 'Non-transferable · NEP-171' },
      note: nozzle.demo ? `Simulated · demo threshold ${nozzle.demo.replace(/^every /, '')}, normally ${trim(nozzle.prod)}` : 'Simulated',
    },
    {
      kind: 'washer', place: 'Dorm laundry · washer', title: 'A fault stops the washer.', poster: 'scene-2',
      line: `${reporter} reports a fault. Bookings stop until a repair is done and verified.`,
      beats: [
        { who: reporter, role: 'member', what: 'Reports a fault after his wash', chain: 'fault report accepted', tx: txOf(d, 19, /reports a fault/) },
        { who: steward, role: 'steward', what: 'Takes the washer out of service', chain: 'new bookings refused', tx: txOf(d, 19, /out_of_service/) },
        // The refund came from the member's own cancel tx (reason out_of_service, full fee); he then claimed the repair.
        { who: repairer, role: 'member', what: 'Cancels his booking, then repairs the washer', chain: `booking refunded ${near(canFee)} NEAR`, tx: txOf(d, 19, /cancels his future booking/) },
        { who: verifier, role: 'verifier', what: 'Approves the repair', chain: `service restored · +${repairRights} usage rights to ${repairer}`, tx: txOf(d, 19, /approves/) },
      ],
      outcome: { k: 'Washer', v: washer?.in_service ? 'Back in service' : 'Out of service', sub: 'Repair verified on chain' },
      note: 'Simulated',
    },
    {
      kind: 'laser_cutter', place: 'Workshop · laser cutter', title: 'Locked until you are trained.', poster: 'scene-3',
      line: `${trainee} is refused without laser safety. ${trainer} trains her, ${approver} approves, the plug turns on.`,
      beats: [
        { who: trainee, role: 'member', what: 'Tries to book without the credential', chain: 'refused, payment refunded', tx: txOf(d, 11, /no credential/) },
        { who: trainer, role: 'trainer', what: `Proposes ${trainee}’s laser training`, tx: txOf(d, 12, /proposes/) },
        { who: approver, role: 'verifier', what: 'Approves the training', chain: `laser_safety credential issued · +1 usage right to ${trainer}`, tx: txOf(d, 12, /approves training/) },
        { who: trainee, role: 'member', what: 'Books; the plug powers on for her session', tx: txOf(d, 13, /session_started/) },
      ],
      outcome: { k: 'Credential', v: `laser_safety → ${trainee}`, sub: 'Non-transferable · NEP-171' },
      note: 'Simulated',
    },
    {
      kind: 'community_fridge', place: 'Neighbourhood · community fridge', title: 'Cleaning comes due on schedule.', poster: 'scene-4',
      line: 'The weekly clean cannot open early. Once the interval passes, the agent opens it.',
      beats: [
        { who: 'Agent', role: 'operations agent', what: 'Tries to open the clean too early', chain: 'refused: not due yet', tx: step(d, 20).txs.find((t) => t.error_code === 'E_RULE_NOT_DUE')!.hash },
        { who: 'Schedule', role: 'profile rule', what: 'The interval passes', chain: fridge.demo ? `${fridge.demo.replace(/^every /, '')} · demo threshold` : undefined },
        { who: 'Agent', role: 'operations agent', what: 'Opens the cleaning task', chain: `reward ${fridgeRule.reward_rights} usage rights`, tx: txOf(d, 20, /^agent open_upkeep_task\("weekly_clean"\)$/) },
      ],
      outcome: { k: 'Cleaning task', v: 'Open', sub: `Reward ${fridgeRule.reward_rights} usage rights` },
      note: fridge.demo ? `Simulated · demo threshold ${fridge.demo.replace(/^every /, '')}, normally ${trim(fridge.prod)}` : 'Simulated',
    },
    {
      kind: 'emergency_generator', place: 'Co-op · emergency generator', title: 'Fuel paid back, within a cap.', poster: 'scene-5',
      line: `Test run under load ${triggerText(test.trigger)}, then a receipt-backed refill, capped at ${cap} NEAR.`,
      beats: [
        { who: 'Generator', role: 'telemetry', what: 'Runs its test under load', chain: triggerText(test.trigger) },
        { who: 'Agent', role: 'operations agent', what: 'Opens a fuel restock task', chain: triggerText(fuel.trigger) },
        { who: 'Member', role: 'any member', what: 'Refuels and attaches the receipt' },
        { who: 'Verifier', role: 'another member', what: 'Approves; the machine reimburses', chain: `at most ${cap} NEAR` },
      ],
      outcome: { k: 'Restock', v: `Reimbursed ≤ ${cap} NEAR`, sub: 'Example' },
      note: 'Example · profile rules, not deployed on testnet',
    },
  ];
}

const ICON_CHECK = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2 5 8.6 9.6 3.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_LINK = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5h5v5M9.5 2.5 3 9" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function outcomeCard(o: SceneCopy['outcome'], cls: string, attrs = ''): string {
  return `<div class="outcome ${cls}"${attrs}><p class="o-k">${esc(o.k)}</p><p class="o-v ck-num">${withNear(o.v)}</p><p class="o-sub">${esc(o.sub)}</p></div>`;
}

export function scenes(d: LandingData): { list: string; progress: string; posters: string } {
  const c = sceneCopy(d);
  const n = String(c.length).padStart(2, '0');
  const list = c.map((s, i) => `<li class="scene" data-i="${i}">
      <img class="scene-poster" src="/posters/${s.poster}-800.webp" width="800" height="800" alt="${esc(s.place)}, rendered model" loading="lazy" decoding="async">
      <div class="scene-copy">
        <p class="scene-meta"><span class="ck-num">${String(i + 1).padStart(2, '0')} / ${n}</span><span>${esc(s.place)}</span></p>
        <h3 class="scene-title">${esc(s.title)}</h3>
        <p class="scene-line">${esc(s.line)}</p>
        <ol class="timeline">${s.beats.map((b) => `<li class="tl-step">
          <span class="tl-dot">${ICON_CHECK}</span>
          <p class="tl-who"><span class="av" aria-hidden="true">${esc(b.who.charAt(0))}</span><b>${esc(b.who)}</b><span class="role">· ${esc(b.role)}</span></p>
          <p class="tl-what">${esc(b.what)}</p>${b.chain || b.tx ? `
          <p class="tl-chain">${b.chain ? `<span class="ck-num">${withNear(b.chain)}</span>` : 'On NEAR testnet'}${b.tx ? ` <a class="tl-link" href="${tx(b.tx)}" rel="noopener" aria-label="View on NEAR explorer">${ICON_LINK}</a>` : ''}</p>` : ''}
        </li>`).join('')}</ol>
        <p class="sim-mark">${esc(s.note)}</p>
        ${outcomeCard(s.outcome, 'outcome-inline')}
      </div>
    </li>`).join('');
  const progress = c.map((s, i) => `<li${i === 0 ? ' class="on"' : ''}><span class="visually-hidden">${esc(s.place)}</span></li>`).join('');
  const posters = c.map((s, i) => `<img class="stage-poster${i === 0 ? ' on' : ''}" data-i="${i}" src="/posters/${s.poster}-1000.webp" width="1000" height="1000" alt="" loading="lazy" decoding="async">`).join('')
    + c.map((s, i) => outcomeCard(s.outcome, 'outcome-stage', ` data-i="${i}"`)).join('');
  return { list, progress, posters };
}

// ---------- care: the twelve commons ----------

export function care(d: LandingData): string {
  return CARE_ORDER.map((t) => {
    const p = d.profiles.find((x) => x.asset_type === t);
    if (!p) throw new Error(`profile ${t} missing`);
    const kinds = [...new Set(p.rules.map((r) => r.kind))].join(' · ');
    return `<li class="care-tile">
      <img src="/posters/m-${t}-640.webp" width="640" height="640" alt="${esc(SHORT[t]!)}, rendered model" loading="lazy" decoding="async">
      <p class="care-name">${esc(SHORT[t]!)}</p>
      <p class="care-kinds">${esc(kinds)}</p>
      <p class="care-status">Status: ${esc(p.status)}</p>
    </li>`;
  }).join('');
}

// ---------- money ----------

export function money(d: LandingData): { lineup: string; stats: string } {
  const order = ['printer_3d', 'laser_cutter', 'washer', 'community_fridge'];
  const assets = order.map((t) => d.snapshot.assets.find((a) => a.asset_type === t)).filter((a): a is AssetSnap => !!a);
  const lineup = assets.map((a) => {
    const f = ratio(a.ledger.float_free, a.ledger.float_cap);
    const com = d.dep.communities[a.community]?.name ?? a.community;
    return `<li class="tile">
      <img src="/posters/m-${a.asset_type}-640.webp" width="640" height="640" alt="${esc(SHORT[a.asset_type] ?? a.asset_type)}, rendered model" loading="lazy" decoding="async">
      <div class="tile-meta"><span class="tile-name">${esc(SHORT[a.asset_type] ?? a.asset_type)}</span><span class="tile-com">${esc(com)}</span></div>
      ${gauge(f, `Float ${nearFixed(a.ledger.float_free)} of ${nearFixed(a.ledger.float_cap)} NEAR`)}
      <p class="tile-num"><span class="ck-near">${nearMarkSvg()}<b class="ck-num">${nearFixed(a.ledger.float_free)}</b><span class="ck-num">/ ${nearFixed(a.ledger.float_cap)}</span><span class="ck-sr"> NEAR</span></span></p>
    </li>`;
  }).join('');
  // Sources: total_fees_in / total_swept from each asset's get_ledger view (testnet snapshot, refreshed with
  // `pnpm --filter @commonkit/landing snapshot`); the refund amount is the printer profile deposit refunded in step 5.
  const sum = (k: 'total_fees_in' | 'total_swept') => assets.reduce((s, a) => s + BigInt(a.ledger[k]), 0n);
  const daos = new Set(assets.filter((a) => BigInt(a.ledger.total_swept) > 0n).map((a) => a.dao)).size;
  stepTx(d, 6, /books more/);
  stepTx(d, 5, /clean return/);
  const refundAmount = printer(d).p.deposit;
  const stats = [
    [nearAmountHtml(nearFixed(sum('total_fees_in'))), 'in fees paid to the machines', ''],
    [nearAmountHtml(nearFixed(sum('total_swept'))), `above the caps, swept to ${daos} community DAOs`, ''],
    [nearAmountHtml(nearFixed(refundAmount)), 'deposit refunded in full. Deposits are never spent.', ''],
  ];
  return {
    lineup,
    stats: stats.map(([n, t, l]) => `<div class="stat"><b>${n}</b><span>${esc(t!)}</span>${l ? `<span class="stat-l">${l}</span>` : ''}</div>`).join(''),
  };
}

// ---------- earned access ----------

export function rights(d: LandingData): { refused: string; pass: string } {
  const { a, p } = printer(d);
  const t0 = a.tasks.find((t) => t.status === 'Rewarded');
  if (!t0) throw new Error('no rewarded task on printer-01');
  const tries = step(d, 17).txs.filter((t) => /right|revoke|burn/i.test(t.label) && !t.ok);
  const refused = tries.map((t) => {
    const what = /revoke/i.test(t.label) ? 'Revoke it' : /burn/i.test(t.label) ? 'Burn it' : 'The council takes it';
    const why = t.error_code === 'PROTOCOL:MethodNotFound' ? 'No such method' : 'Refused';
    return `<li><span class="x" aria-hidden="true"></span><span class="what">${what}</span><a class="why" href="${tx(t.hash)}" rel="noopener">${esc(why)}</a></li>`;
  }).join('');
  // Valid: right_validity_days from profiles/printer_3d.json (the profile set on testnet by DAO proposal).
  const pass = `<article class="pass" aria-label="Usage right card">
    <header class="pass-top"><span class="pass-brand">COMMONKIT</span><span>${esc(d.dep.communities[a.community]?.name ?? a.community)}</span></header>
    <p class="pass-count"><span class="n ck-num">${t0.reward_rights}</span><span class="u">usage rights</span></p>
    <dl class="pass-rows">
      <div><dt>Earned by</dt><dd>${esc(who(t0.claimer))}</dd></div>
      <div><dt>For</dt><dd>${esc(RULE_NAME[t0.rule_id] ?? t0.rule_id)}</dd></div>
      <div><dt>Verified by</dt><dd>${esc(who(t0.verifier))}</dd></div>
      <div><dt>Valid</dt><dd>${p.right_validity_days} days</dd></div>
    </dl>
    <footer class="pass-foot"><span>Non-transferable</span><span>NEP-171</span></footer>
  </article>`;
  return { refused, pass };
}

// ---------- proof: three facts anyone can check ----------

function latestVerify(): { passed: boolean; lines: string[] } | null {
  const dir = resolve(REPO, 'evidence');
  const f = readdirSync(dir).filter((x) => /^verify-.*\.txt$/.test(x)).sort().at(-1);
  if (!f) return null;
  const lines = readFileSync(resolve(dir, f), 'utf8').split('\n');
  return { passed: lines.some((l) => l.includes('all checks passed')) && !lines.some((l) => l.startsWith('❌')), lines };
}

export function proof(d: LandingData): string {
  const v = latestVerify();
  if (!v?.passed) throw new Error('the latest evidence/verify-*.txt did not pass; the proof section only shows verified facts');
  const keyless = v.lines.filter((l) => /^✅ \[1\] .*access keys: 0$/.test(l)).length;
  const sameCode = v.lines.some((l) => new RegExp(`^✅ \\[2\\] ${d.snapshot.assets.length} asset account\\(s\\) share code_hash`).test(l));
  if (!keyless || !sameCode) throw new Error('verify output lacks the keyless or code_hash checks');
  const facts = [
    ['0', 'keys', `on the ${keyless} machine, community and DAO accounts. No one can sign for them.`],
    ['1', 'contract', `All ${d.snapshot.assets.length} machines run identical code, with the same code hash.`],
    // evidence_txs: unique successful testnet tx hashes across evidence/*.json (data.ts readTicker).
    [String(d.evidence_txs), 'transactions', 'Every reservation, payment and upkeep in this demo is public on the explorer.'],
  ];
  return facts.map(([n, u, t]) => `<li><p class="fact-n"><b class="ck-num">${n}</b> ${u}</p><p>${esc(t!)}</p></li>`).join('');
}

// ---------- why NEAR ----------

export function nearSection(d: LandingData): string {
  const { a } = printer(d);
  const tiles = [
    ['Named accounts', 'Each machine is an account you can read aloud and look up.', `<span class="acct"><b>${esc(firstLabel(a.account))}</b>.${esc(a.account.split('.').slice(1, 2).join('.'))}…</span>`],
    ['Function-call keys', 'The bridge and the agent hold keys that can call only their own methods, on one machine.', ''],
    ['Standard DAO and NFTs', 'Community money sits in an unmodified Sputnik DAO; usage rights are NEP-171 cards.', ''],
  ];
  return `<ul class="near-tiles">${tiles.map(([t, b, x]) => `<li><h3>${t}</h3><p>${b}</p>${x ? `<div class="near-x">${x}</div>` : ''}</li>`).join('')}</ul>`;
}

/** Footer status line, from the snapshot: every asset keyless and on one code_hash, or the build fails. */
function footStatus(d: LandingData): string {
  const as = d.snapshot.assets;
  if (!as.every((a) => a.full_access_keys === 0) || new Set(as.map((a) => a.code_hash)).size !== 1) throw new Error('snapshot: assets not keyless or not on one code_hash');
  return `${as.length} machines · keyless · 1 contract · NEAR testnet`;
}

// ---------- everything ----------

export function renderSlots(d: LandingData): Record<string, string> {
  const { a } = printer(d);
  const m = money(d);
  const r = rights(d);
  const sc = scenes(d);
  const live = { account: a.account, community: a.community, dao: a.dao };
  return {
    'hero-callouts': heroCallouts(d),
    'live-config': `<script type="application/json" id="ck-live">${JSON.stringify(live)}</script>`,
    how: how(d),
    care: care(d),
    'money-lineup': m.lineup,
    'money-stats': m.stats,
    'rights-refused': r.refused,
    'rights-pass': r.pass,
    proof: proof(d),
    'scenes-list': sc.list,
    'scenes-progress': sc.progress,
    'scenes-posters': sc.posters,
    near: nearSection(d),
    // Approved lockup (D-040), inline so the nav costs no request; width and height are fixed (no layout shift).
    logo: lockupSvg(18),
    'logo-foot': lockupSvg(20),
    'repo-url': REPO_URL,
    'foot-status': footStatus(d),
    // Spreadsheet cast (illustrative "Example"): the same display names as the rest of the page.
    'sheet-a': displayName('ayse'),
    'sheet-b': displayName('mehmet'),
    'sheet-c': displayName('can'),
    'foot-machines': CARE_ORDER.map((t) => `<li><img src="/posters/m-${t}-640.webp" width="640" height="640" alt="" loading="lazy" decoding="async"><span>${esc(SHORT[t]!)}</span></li>`).join(''),
  };
}
