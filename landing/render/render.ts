/** Renders every data-driven block of index.html at build time (static HTML, no layout shift, works without JS).
 * Every number is read from the testnet snapshot or a repo file (see data.ts); the build fails if one is missing. */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AssetSnap } from '../src/lib/chain.ts';
import { esc, firstLabel, int, triggerText, type Trigger } from '../src/lib/format.ts';
import { REPO, type DemoOverride, type JudgeStep, type LandingData, type Profile } from './data.ts';

export const REPO_URL = 'https://github.com/anilkaracay/commonkit';
const tx = (h: string) => `https://testnet.nearblocks.io/txns/${h}`;
const pct = (x: number) => `${Math.round(Math.max(0, Math.min(1, x)) * 1000) / 10}%`;
const ratio = (a: string, b: string) => (BigInt(b) === 0n ? 0 : Number((BigInt(a) * 10000n) / BigInt(b)) / 10000);
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
/** Display names for the demo members (account ids are ali, ayse, mehmet, can …). */
const PERSON: Record<string, string> = { ali: 'Ali', ayse: 'Ayşe', mehmet: 'Mehmet', can: 'Can', elif: 'Elif', zeynep: 'Zeynep' };
const who = (acct: string | null | undefined) => { const n = firstLabel(acct ?? ''); return PERSON[n] ?? n; };
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
  // The positive real story: the upkeep task the agent opened in judge step 7 and Mehmet approved in step 8.
  const doneId = String(step(d, 7).outputs.task_id ?? '0');
  const done = a.tasks.find((t) => t.id === doneId && t.status === 'Rewarded');
  step(d, 8);
  const items: [string, string, string, string][] = [
    ['nozzle', `${int(nozzle.due_value)} / ${int(thr)} s`, ov ? 'Nozzle time · demo threshold' : 'Nozzle time since the last clean', 'nozzle'],
    ['screen', `${nearFixed(a.ledger.float_free)} / ${nearFixed(a.ledger.float_cap)} NEAR`, 'Float, capped', 'float'],
  ];
  if (done)
    items.push(['upkeep', `${done.rule_id === 'nozzle_clean' ? 'Nozzle cleaned' : `${esc(RULE_NAME[done.rule_id] ?? done.rule_id)} done`}`, `Done by ${esc(who(done.claimer))}, verified by ${esc(who(done.verifier))}`, 'upkeep']);
  return items.map(([k, v, c, live]) => `<li class="callout" data-anchor="${k}"><span class="v ck-num" data-live="${live}">${v}</span><span class="c">${esc(c)}</span></li>`).join('');
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
          <div><dt>Member</dt><dd>Ali</dd></div>
          <div><dt>Slots</dt><dd class="ck-num">2</dd></div>
          <div><dt>Fee</dt><dd class="ck-num">${nearFixed(fee)} NEAR</dd></div>
          <div><dt>Deposit, refundable</dt><dd class="ck-num">${nearFixed(p.deposit)} NEAR</dd></div>
        </dl>
        <p class="mini-ok"><span class="ck-dot" aria-hidden="true"></span>Confirmed on testnet</p>
      </div>`, 'how-reserve'),
    card(2, 'Unlock', 'The bridge unlocks only for a valid on-chain reservation.', `<div class="mini ck-card">
        <p class="mini-k">Bridge access check</p>
        <ul class="mini-list">
          <li><span>Ali · reservation valid</span><b>Unlocked</b></li>
          <li><span>Can · no reservation</span><b class="no">Refused</b></li>
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
          <div><dt>Fee</dt><dd class="ck-num">0.00 NEAR</dd></div>
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

interface SceneCopy { kind: string; place: string; title: string; line: string; beats: string[]; note: string; poster: string }

export function sceneCopy(d: LandingData): SceneCopy[] {
  const { a } = printer(d);
  const t0 = a.tasks.find((t) => t.id === String(step(d, 7).outputs.task_id ?? '0') && t.status === 'Rewarded');
  if (!t0) throw new Error('printer task from step 7 is not rewarded');
  const nozzle = ruleText(d, 'printer_3d', 'nozzle_clean');
  // Washer (step 19): who reported, that bookings were refused while out of service, who verified the repair.
  const s19 = step(d, 19).txs;
  const reporter = /^(\w+) .*reports a fault/.exec(s19.find((t) => t.ok && /reports a fault/.test(t.label))?.label ?? '')?.[1];
  const verifier = /^(\w+) \(dorm-b verifier\) approves/.exec(s19.find((t) => /approves/.test(t.label))?.label ?? '')?.[1];
  if (!reporter || !verifier || !s19.some((t) => t.error_code === 'E_OUT_OF_SERVICE')) throw new Error('step 19 evidence changed');
  const washer = d.snapshot.assets.find((x) => x.asset_type === 'washer');
  // Laser (steps 11–13).
  if (!step(d, 11).txs.length || !/Mehmet .*approves training/.test(step(d, 12).txs.map((t) => t.label).join('\n')) || !stepTx(d, 13, /session_started/)) throw new Error('laser evidence changed');
  const fridge = ruleText(d, 'community_fridge', 'weekly_clean');
  if (!step(d, 20).txs.some((t) => t.error_code === 'E_RULE_NOT_DUE')) throw new Error('step 20 evidence changed');
  const gen = d.profiles.find((x) => x.asset_type === 'emergency_generator')!;
  const fuel = gen.rules.find((r) => r.rule_id === 'fuel_refill')!;
  const test = gen.rules.find((r) => r.rule_id === 'monthly_test_run')!;
  const cap = nearFixed(fuel.reimbursable_max).replace(/\.00$/, '');
  return [
    { kind: 'printer_3d', place: 'Makerspace · 3D printer', title: 'The printer asks for care.', line: `Nozzle time crosses its rule. ${who(t0.claimer)} cleans it, ${who(t0.verifier)} verifies, ${who(t0.claimer)} earns ${t0.reward_rights} usage rights.`,
      beats: ['Nozzle time due', 'The agent opens a task', `Cleaned by ${who(t0.claimer)}`, `Verified by ${who(t0.verifier)} · ${t0.reward_rights} rights`],
      note: nozzle.demo ? `Simulated · demo threshold ${nozzle.demo.replace(/^every /, "")}, normally ${trim(nozzle.prod)}` : 'Simulated', poster: 'scene-1' },
    { kind: 'washer', place: 'Dorm laundry · washer', title: 'A fault stops the washer.', line: `${reporter} reports a fault. Bookings stop until a repair is done and verified.`,
      beats: [`Fault reported by ${reporter}`, 'Out of service, bookings refused', `Repair verified by ${verifier}`, washer?.in_service ? 'Back in service' : 'Waiting for service'],
      note: 'Simulated', poster: 'scene-2' },
    { kind: 'laser_cutter', place: 'Workshop · laser cutter', title: 'Locked until you are trained.', line: 'Zeynep is refused without laser safety. Ayşe trains her, Mehmet approves, the plug turns on.',
      beats: ['Refused without the credential', 'Trained by Ayşe', 'Approved by Mehmet', 'Plug on for Zeynep’s session'],
      note: 'Simulated · emulated smart plug', poster: 'scene-3' },
    { kind: 'community_fridge', place: 'Neighbourhood · community fridge', title: 'Cleaning comes due on schedule.', line: 'The weekly clean cannot open early. Once the interval passes, the agent opens it.',
      beats: ['Too early: refused', 'The interval passes', 'The agent opens the task'],
      note: fridge.demo ? `Simulated · demo threshold ${trim(fridge.demo)}, normally ${trim(fridge.prod)}` : 'Simulated', poster: 'scene-4' },
    { kind: 'emergency_generator', place: 'Co-op · emergency generator', title: 'Fuel paid back, within a cap.', line: `Test run under load ${triggerText(test.trigger)}, then a receipt-backed refill, capped at ${cap} NEAR.`,
      beats: ['Monthly test run', 'Fuel low, task opened', 'Refilled with a receipt', `Reimbursed, at most ${cap} NEAR`],
      note: 'Example · profile rules, not deployed on testnet', poster: 'scene-5' },
  ];
}

export function scenes(d: LandingData): { list: string; progress: string; posters: string } {
  const c = sceneCopy(d);
  const list = c.map((s, i) => `<li class="scene" data-i="${i}">
      <img class="scene-poster" src="/posters/${s.poster}-800.webp" width="800" height="800" alt="${esc(s.place)}, rendered model" loading="lazy" decoding="async">
      <div class="scene-copy">
        <p class="scene-place">${esc(s.place)}</p>
        <h3 class="scene-title">${esc(s.title)}</h3>
        <p class="scene-line">${esc(s.line)}</p>
        <ol class="beats">${s.beats.map((b) => `<li>${esc(b)}</li>`).join('')}</ol>
        <p class="ck-sim scene-note">${esc(s.note)}</p>
      </div>
    </li>`).join('');
  const progress = c.map((s, i) => `<li${i === 0 ? ' class="on"' : ''}><span class="visually-hidden">${esc(s.place)}</span></li>`).join('');
  const posters = c.map((s, i) => `<img class="stage-poster${i === 0 ? ' on' : ''}" data-i="${i}" src="/posters/${s.poster}-1000.webp" width="1000" height="1000" alt="" loading="lazy" decoding="async">`).join('');
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
      <p class="tile-num"><b class="ck-num">${nearFixed(a.ledger.float_free)}</b> / ${nearFixed(a.ledger.float_cap)} NEAR</p>
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
    [`${nearFixed(sum('total_fees_in'))} NEAR`, 'in fees paid to the machines', ''],
    [`${nearFixed(sum('total_swept'))} NEAR`, `above the caps, swept to ${daos} community DAOs`, ''],
    [`${nearFixed(refundAmount)} NEAR`, 'deposit refunded in full. Deposits are never spent.', ''],
  ];
  return {
    lineup,
    stats: stats.map(([n, t, l]) => `<div class="stat"><b class="ck-num">${n}</b><span>${esc(t!)}</span>${l ? `<span class="stat-l">${l}</span>` : ''}</div>`).join(''),
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
    ['Named accounts', 'Each machine is an account you can read aloud and look up.', `<span class="ck-mono"><b>${esc(firstLabel(a.account))}</b>.${esc(a.account.split('.').slice(1, 2).join('.'))}…</span>`],
    ['Function-call keys', 'The bridge and the agent hold keys that can call only their own methods, on one machine.', ''],
    ['Standard DAO and NFTs', 'Community money sits in an unmodified Sputnik DAO; usage rights are NEP-171 cards.', ''],
  ];
  return `<ul class="near-tiles">${tiles.map(([t, b, x]) => `<li><h3>${t}</h3><p>${b}</p>${x ? `<div class="near-x">${x}</div>` : ''}</li>`).join('')}</ul>`;
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
    'repo-url': REPO_URL,
  };
}
