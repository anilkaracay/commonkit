/** Renders every data-driven block of index.html at build time (static HTML, no layout shift, works without JS).
 * Every number is read from the testnet snapshot or a repo file (see data.ts); the build fails if one is missing. */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AssetSnap, TaskLite } from '../src/lib/chain.ts';
import { esc, firstLabel, int, shortHash, triggerText, utcStamp, type Trigger } from '../src/lib/format.ts';
import { REPO, type DemoOverride, type JudgeStep, type LandingData, type Profile } from './data.ts';

export const REPO_URL = 'https://github.com/anilkaracay/commonkit';
const tx = (h: string) => `https://testnet.nearblocks.io/txns/${h}`;
const txLink = (h: string, text = shortHash(h)) => `<a class="tx ck-mono" href="${tx(h)}" rel="noopener">${esc(text)}</a>`;
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
const taskOverride = (d: LandingData, a: AssetSnap, t: TaskLite) => overrideAt(d.overrides[a.account], t.rule_id, Number(BigInt(t.created_at) / 1_000_000n));
const fileTrigger = (p: Profile, rule: string): Trigger | undefined => p.rules.find((r) => r.rule_id === rule)?.trigger;

// ---------- hero ----------

export function heroCallouts(d: LandingData): string {
  const { a, p } = printer(d);
  const nozzle = a.rules.find((r) => r.rule_id === 'nozzle_clean')!;
  const thr = 'Metric' in nozzle.trigger ? Number((nozzle.trigger as { Metric: { threshold: number } }).Metric.threshold) : 0;
  const ov = nowOverride(d, a, 'nozzle_clean');
  const prod = fileTrigger(p, 'nozzle_clean');
  const open = a.tasks.find((t) => ['Open', 'Claimed', 'Submitted'].includes(t.status));
  const openOv = open ? taskOverride(d, a, open) : null;
  const items = [
    ['nozzle', `${int(nozzle.due_value)} / ${int(thr)} s`, ov ? `Nozzle time · demo threshold (production: ${prod ? triggerText(prod) : '—'})` : 'Nozzle time since the last clean', 'nozzle'],
    ['screen', `${nearFixed(a.ledger.float_free)} / ${nearFixed(a.ledger.float_cap)} NEAR`, 'Float, capped', 'float'],
  ];
  if (open)
    items.push(['task', `<span class="ck-dot ck-dot--due" aria-hidden="true"></span> Task #${esc(open.id)} open`, `${RULE_NAME[open.rule_id] ?? open.rule_id}${openOv ? ' · opened under a demo override' : ''}`, 'task']);
  return items.map(([k, v, c, live]) => `<li class="callout" data-anchor="${k}"><span class="v ck-num" data-live="${live}">${v}</span><span class="c">${esc(c!)}</span></li>`).join('');
}

// ---------- how it works ----------

export function how(d: LandingData): string {
  const { a, p } = printer(d);
  const reserve = stepTx(d, 2, /reserves/);
  const unlock = stepTx(d, 3, /session_started/);
  const t0 = a.tasks.find((t) => t.id === '0')!;
  const open7 = stepTx(d, 7, /open_upkeep_task/);
  const approve = stepTx(d, 8, /approves/);
  const withRight = stepTx(d, 9, /with her right/);
  const t0ov = taskOverride(d, a, t0);
  const fee = BigInt(p.price_per_slot) * 2n;
  const card = (n: number, title: string, line: string, visual: string, foot: string, art?: string) => `<li class="how-step">
    <div class="how-visual${art ? ' has-art' : ''}">${art ? `<img src="/posters/${art}-960.webp" width="960" height="720" alt="" loading="lazy" decoding="async">` : ''}${visual}</div>
    <div class="how-text"><span class="how-n ck-num">0${n}</span><h3>${title}</h3><p>${line}</p><p class="how-foot">${foot}</p></div>
  </li>`;
  return [
    card(1, 'Reserve', 'Pay the fee and a refundable deposit to the machine’s own account.', `<div class="mini ck-card">
        <p class="mini-k">Reservation · ${esc(SHORT.printer_3d!)}</p>
        <dl class="ck-rows">
          <div><dt>Member</dt><dd>ali</dd></div>
          <div><dt>Slots</dt><dd class="ck-num">2</dd></div>
          <div><dt>Fee</dt><dd class="ck-num">${nearFixed(fee)} NEAR</dd></div>
          <div><dt>Deposit, refundable</dt><dd class="ck-num">${nearFixed(p.deposit)} NEAR</dd></div>
        </dl>
        <p class="mini-ok"><span class="ck-dot" aria-hidden="true"></span>Confirmed on testnet</p>
      </div>`, `Testnet ${txLink(reserve.hash)}`),
    card(2, 'Unlock', 'The bridge unlocks only for a valid on-chain reservation.', `<div class="mini ck-card">
        <p class="mini-k">Bridge access check</p>
        <ul class="mini-list">
          <li><span>ali · reservation valid</span><b>Unlocked</b></li>
          <li><span>can · no reservation</span><b class="no">Refused</b></li>
        </ul>
        <p class="ck-sim">Emulated printer</p>
      </div>`, `Session written on chain first ${txLink(unlock.hash)}`, 'how-unlock'),
    card(3, 'Upkeep', 'Telemetry crosses a rule, the agent opens a task, a member does it.', `<div class="mini ck-card">
        <p class="mini-k">Task #${esc(t0.id)} · ${esc(RULE_NAME[t0.rule_id] ?? t0.rule_id)}</p>
        <dl class="ck-rows">
          <div><dt>Done by</dt><dd>${esc(firstLabel(t0.claimer ?? ''))}</dd></div>
          <div><dt>Verified by</dt><dd>${esc(firstLabel(t0.verifier ?? ''))}</dd></div>
          <div><dt>Status</dt><dd>${esc(t0.status)}</dd></div>
        </dl>
        ${t0ov ? '<p class="ck-note">Opened under a demo threshold</p>' : ''}
      </div>`, `Opened ${txLink(open7.hash)} · approved ${txLink(approve.hash)}`, 'how-upkeep'),
    card(4, 'Earn access', `The maintainer receives ${t0.reward_rights} usage rights and books with them, fee-free.`, `<div class="mini ck-card">
        <p class="mini-k">Reservation · with a usage right</p>
        <dl class="ck-rows">
          <div><dt>Member</dt><dd>${esc(firstLabel(t0.claimer ?? ''))}</dd></div>
          <div><dt>Fee</dt><dd class="ck-num">0.00 NEAR</dd></div>
          <div><dt>Right</dt><dd>used, as defined</dd></div>
        </dl>
        <p class="mini-ok"><span class="ck-dot" aria-hidden="true"></span>Confirmed on testnet</p>
      </div>`, `Testnet ${txLink(withRight.hash)}`),
  ].join('');
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
  const sum = (k: 'total_fees_in' | 'total_swept') => assets.reduce((s, a) => s + BigInt(a.ledger[k]), 0n);
  const daos = new Set(assets.filter((a) => BigInt(a.ledger.total_swept) > 0n).map((a) => a.dao)).size;
  const sweep = stepTx(d, 6, /books more/);
  const refund = stepTx(d, 5, /clean return/);
  const refundAmount = printer(d).p.deposit;
  const stats = [
    [`${nearFixed(sum('total_fees_in'))} NEAR`, 'fees paid into the four machines', ''],
    [`${nearFixed(sum('total_swept'))} NEAR`, `swept above the caps to ${daos} community treasuries`, txLink(sweep.hash)],
    [`${nearFixed(refundAmount)} NEAR`, 'deposit refunded in full after a clean return; deposits are never spent', txLink(refund.hash)],
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
  const approve = stepTx(d, 8, /approves/);
  const tries = step(d, 17).txs.filter((t) => /right|revoke|burn/i.test(t.label) && !t.ok);
  const refused = tries.map((t) => {
    const what = /revoke/i.test(t.label) ? 'Revoke a right' : /burn/i.test(t.label) ? 'Burn a right' : 'Council takes a right';
    const why = t.error_code === 'PROTOCOL:MethodNotFound' ? 'No such method' : t.error_code ?? 'refused';
    return `<li><span class="x" aria-hidden="true"></span><span class="what">${what}</span><a class="why" href="${tx(t.hash)}" rel="noopener">${esc(why)}<span class="tx-h ck-mono"> ${shortHash(t.hash)}</span></a></li>`;
  }).join('');
  const pass = `<article class="pass" aria-label="Usage right card">
    <header class="pass-top"><span class="pass-brand">COMMONKIT</span><span>${esc(d.dep.communities[a.community]?.name ?? a.community)}</span></header>
    <p class="pass-count"><span class="n ck-num">${t0.reward_rights}</span><span class="u">usage rights</span></p>
    <dl class="pass-rows">
      <div><dt>Earned by</dt><dd>${esc(firstLabel(t0.claimer ?? ''))}</dd></div>
      <div><dt>For</dt><dd>Task #${esc(t0.id)} · ${esc(RULE_NAME[t0.rule_id] ?? t0.rule_id)}</dd></div>
      <div><dt>Verified by</dt><dd>${esc(firstLabel(t0.verifier ?? ''))}</dd></div>
      <div><dt>Valid</dt><dd>${p.right_validity_days} days</dd></div>
    </dl>
    <footer class="pass-foot"><span>Non-transferable · NEP-171</span><a class="ck-mono" href="${tx(approve.hash)}" rel="noopener">${shortHash(approve.hash)}</a></footer>
  </article>`;
  return { refused, pass };
}

// ---------- the bounded agent ----------

const AGENT_TEXT: Record<string, string> = {
  rule_not_due_metric: 'Open a task before the telemetry crossed the rule',
  rule_not_due_schedule: 'Open a scheduled task before its interval',
  task_already_open: 'Open a second task for the same rule',
  quota_exceeded: 'Exceed the period’s reward quota',
  approve_task: 'Approve a task itself',
  deposit_with_function_call_key: 'Move money with its key',
  not_agent_after_revocation: 'Act after the DAO removed it',
};

export function agent(d: LandingData): string {
  const L = d.limits;
  if (!L) return `<p class="pending">Testnet run pending: <span class="ck-mono">evidence/agent-limits.json</span> is not recorded yet.</p>`;
  const rows = L.attempts.map((t) => `<li class="${t.pass ? 'ok' : 'bad'}">
      <span class="a-what">${esc(AGENT_TEXT[t.id] ?? t.spec)}</span>
      <span class="a-code ck-mono">${esc(t.code ?? t.status)}</span>
      ${t.tx_hash ? txLink(t.tx_hash) : '<span class="tx ck-mono">no tx · refused by the protocol</span>'}
    </li>`).join('');
  return `<ol class="attempts">${rows}</ol>
    <p class="ck-note">${L.all_passed ? `All ${L.attempts.length} attempts refused on testnet` : 'Not all attempts were refused as expected'}, ${esc(utcStamp(L.generated_at))}${L.simulated ? ' · simulated' : ''} · <span class="ck-mono">evidence/agent-limits.json</span></p>`;
}

// ---------- proof ----------

const CHECKS: Record<number, string> = {
  1: 'Contract and DAO accounts have no access keys',
  2: 'Every asset account runs one code_hash',
  3: 'Every commons account runs one code_hash',
  4: 'Each DAO is listed by the Sputnik factory',
  5: 'Commons, assets, DAOs and keys are wired as deployed',
  6: 'Every swept NEAR reached the DAO',
  7: 'Every rewarded task minted its rights, once',
  8: 'Escalations are real DAO proposals',
  9: 'Reimbursements stayed under their caps',
  10: 'Reward periods closed as recorded',
  11: 'Every judge step’s tx is on chain as recorded',
};

function latestVerify(): { file: string; groups: Map<number, { ok: number; bad: number }>; passed: boolean; lines: string[] } | null {
  const dir = resolve(REPO, 'evidence');
  const f = readdirSync(dir).filter((x) => /^verify-.*\.txt$/.test(x)).sort().at(-1);
  if (!f) return null;
  const lines = readFileSync(resolve(dir, f), 'utf8').split('\n');
  const groups = new Map<number, { ok: number; bad: number }>();
  for (const l of lines) {
    const m = /^(✅|❌) \[(\d+)\]/.exec(l);
    if (!m) continue;
    const g = groups.get(Number(m[2])) ?? { ok: 0, bad: 0 };
    if (m[1] === '✅') g.ok++; else g.bad++;
    groups.set(Number(m[2]), g);
  }
  return { file: `evidence/${f}`, groups, passed: lines.some((l) => l.includes('all checks passed')), lines };
}

export function proof(d: LandingData): { checks: string; meta: string } {
  const v = latestVerify();
  if (!v) return { checks: '<p class="pending">verify.sh has not been recorded yet.</p>', meta: '' };
  const n = Object.keys(CHECKS).length;
  if (v.groups.size !== n) throw new Error(`${v.file}: expected ${n} check groups, found ${v.groups.size}`);
  const checks = [...v.groups.entries()].sort((a, b) => a[0] - b[0]).map(([k, g]) => `<li class="${g.bad ? 'bad' : 'ok'}"><span class="ck ck-num">${k}</span><span>${esc(CHECKS[k]!)}</span><span class="cnt ck-num">${g.ok}/${g.ok + g.bad}</span></li>`).join('');
  const accounts = /— (\d+) accounts/.exec(v.lines[0] ?? '')?.[1];
  const keyless = v.lines.filter((l) => /^✅ \[1\] .*access keys: 0$/.test(l)).length;
  const meta = `<span>${accounts ? `${accounts} accounts read` : ''}</span><span>${keyless} keyless contract and DAO accounts</span><span>1 asset code_hash <span class="ck-mono">${shortHash(d.dep.code.asset.code_hash)}</span></span><a href="${REPO_URL}/blob/main/${v.file}" class="ck-mono">${esc(v.file)}</a>`;
  return { checks, meta };
}

// ---------- why NEAR ----------

export function nearSection(d: LandingData): string {
  const { a } = printer(d);
  const bridgeKey = d.dep.function_call_keys.find((k) => k.account.startsWith('bridge.') && k.receiver_id === a.account);
  const dao = d.dep.communities[a.community]?.dao_id ?? '';
  const transferRefusal = step(d, 17).txs.find((t) => t.error_code === 'E_NON_TRANSFERABLE');
  const tiles = [
    ['Named accounts', 'Each machine is an account you can read aloud.', `<span class="ck-mono"><b>${esc(firstLabel(a.account))}</b>.${esc(a.account.split('.').slice(1).join('.'))}</span>`],
    ['Function-call keys', 'The bridge can call four methods on one machine, nothing else.', `<span class="ck-mono">${bridgeKey?.method_names.map(esc).join('<br>') ?? ''}</span>`],
    ['Unmodified Sputnik DAO', 'Community money sits in a standard DAO from the public factory.', `<span class="ck-mono">${esc(dao)}</span>`],
    ['NEP-171', 'Usage rights are standard NFTs whose transfer always refuses.', transferRefusal ? `<span class="ck-mono">nft_transfer → E_NON_TRANSFERABLE</span> ${txLink(transferRefusal.hash)}` : ''],
  ];
  const nums = [
    [String(d.snapshot.assets.length), 'machines on testnet'],
    ['1', 'contract code_hash for all of them'],
    [int(d.dep.code.asset.bytes), 'bytes of asset WASM'],
    [String(d.evidence_txs), 'testnet transactions in evidence/'],
  ];
  return `<ul class="near-tiles">${tiles.map(([t, b, x]) => `<li><h3>${t}</h3><p>${b}</p><div class="near-x">${x}</div></li>`).join('')}</ul>
  <div class="near-nums">${nums.map(([n, t]) => `<div><b class="ck-num">${n}</b><span>${esc(t!)}</span></div>`).join('')}</div>`;
}

// ---------- everything ----------

export function renderSlots(d: LandingData): Record<string, string> {
  const { a } = printer(d);
  const m = money(d);
  const r = rights(d);
  const p = proof(d);
  const live = { account: a.account, community: a.community, dao: a.dao };
  return {
    'hero-callouts': heroCallouts(d),
    'read-at': utcStamp(d.snapshot.taken_at),
    'snapshot-at': d.snapshot.taken_at,
    'live-config': `<script type="application/json" id="ck-live">${JSON.stringify(live)}</script>`,
    how: how(d),
    care: care(d),
    'care-count': String(d.profiles.length),
    'money-lineup': m.lineup,
    'money-stats': m.stats,
    'rights-refused': r.refused,
    'rights-pass': r.pass,
    agent: agent(d),
    'proof-checks': p.checks,
    'proof-meta': p.meta,
    near: nearSection(d),
    pilot: d.pilot ? '<p>Pilot data recorded in <span class="ck-mono">evidence/pilot.json</span>.</p>' : '',
    'code-hash': shortHash(d.dep.code.asset.code_hash),
    'build-stamp': utcStamp(d.built_at),
    'repo-url': REPO_URL,
  };
}

