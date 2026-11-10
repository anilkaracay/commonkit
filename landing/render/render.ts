/** Renders every data-driven block of index.html at build time (static HTML, no layout shift, works without JS). */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { avatar } from '../src/lib/avatar.ts';
import { machineCard, taskCard, type CardCtx } from '../src/lib/cards.ts';
import type { AssetSnap } from '../src/lib/chain.ts';
import { esc, firstLabel, int, near, relTime, shortHash, triggerText, utcStamp } from '../src/lib/format.ts';
import { art, ART_KEYS, LOGO_MARK } from './art.ts';
import { REPO, type LandingData, type Profile } from './data.ts';

const REPO_URL = 'https://github.com/anilkaracay/commonkit';
const tx = (h: string) => `https://testnet.nearblocks.io/txns/${h}`;
const acctUrl = (a: string) => `https://testnet.nearblocks.io/address/${a}`;

const label = (text: string, cls = '') => `<span class="tag-example ${cls}">${text}</span>`;

/** "Example" for an illustration; when the matching judge step passed on testnet, also link its tx. */
function proofLabel(d: LandingData, step: number): string {
  const s = d.steps.find((x) => x.step === step && x.status === 'passed' && x.tx);
  if (!s?.tx) return label('Example');
  return `<span class="proof-tags">${label('Illustration')}<a class="tag-real" href="${tx(s.tx)}" target="_blank" rel="noopener" title="${esc(s.title)}">Testnet run · step ${s.step} ↗</a></span>`;
}

function printer(d: LandingData): { a: AssetSnap; p: Profile; ctx: CardCtx } {
  const a = d.snapshot.assets.find((x) => x.asset_type === 'printer_3d');
  const p = d.profiles.find((x) => x.asset_type === 'printer_3d');
  if (!a || !p) throw new Error('printer_3d missing from snapshot or profiles');
  return {
    a,
    p,
    ctx: {
      titles: Object.fromEntries(p.rules.map((r) => [r.rule_id, r.title])),
      rightValidityDays: p.right_validity_days,
      icon: art('printer', ''),
      live: false,
      at: d.snapshot.taken_at,
    },
  };
}

// ---------- hero ----------

function liveConfig(d: LandingData): string {
  const { a, p, ctx } = printer(d);
  const cfg = {
    account: a.account,
    community: a.community,
    dao: a.dao,
    titles: ctx.titles,
    rightValidityDays: p.right_validity_days,
  };
  return `<script type="application/json" id="ck-live">${JSON.stringify(cfg).replace(/</g, '\\u003c')}</script>`;
}

export function heroA(d: LandingData): string {
  const { a, ctx } = printer(d);
  return `<div class="glow" aria-hidden="true"></div>
  <div class="stack" data-live-slot="hero">
    <div class="stack-back" data-slot="task">${taskCard(a, ctx)}</div>
    <div class="stack-front" data-slot="machine">${machineCard(a, ctx, 'ink')}</div>
  </div>${liveConfig(d)}`;
}

export function heroB(d: LandingData): string {
  const { a, ctx } = printer(d);
  return `<div class="glow" aria-hidden="true"></div>
  <div class="bench" data-live-slot="hero">
    <div class="bench-art">${art('printer', 'Line drawing of a 3D printer', 'draw')}</div>
    <svg class="string" viewBox="0 0 120 80" aria-hidden="true"><path d="M8 4c20 30 60 50 104 70"/></svg>
    <div class="bench-tag" data-slot="machine">${machineCard(a, ctx, 'paper')}</div>
    <div class="bench-note" data-slot="task">${taskCard(a, ctx)}</div>
  </div>`;
}

export function heroStats(d: LandingData): string {
  const as = d.snapshot.assets;
  const hashes = new Set(as.map((a) => a.code_hash)).size;
  const keys = as.reduce((n, a) => n + a.full_access_keys, 0);
  const stats: [string, string][] = [
    [String(as.length), 'machines live on NEAR testnet (simulated)'],
    [String(hashes), hashes === 1 ? 'contract code shared by all of them' : 'different code hashes'],
    [String(keys), 'keys on their accounts: nobody can sign for them'],
  ];
  return `<div class="hero-foot" aria-label="Read from testnet ${utcStamp(d.snapshot.taken_at)}">${stats
    .map(([n, t]) => `<p class="hero-stat"><b>${n}</b><span>${t}</span></p>`)
    .join('')}</div>`;
}

// ---------- ticker ----------

export function ticker(d: LandingData): string {
  const full = (acc: string) => d.snapshot.assets.find((x) => x.account.startsWith(`${acc}.`))?.account ?? acc;
  const items = d.ticker
    .map(
      (t) => `<li><a href="${esc(t.url)}" rel="noopener" target="_blank">
      <span class="tk tk-${esc(t.kind)}">${esc(t.kind)}</span><span class="tk-text">${esc(t.text)}</span>
      <span class="mono tk-acct">${esc(firstLabel(full(t.account)))}</span>${t.simulated ? '<span class="tk-sim mono">SIM</span>' : ''}
      <time class="mono tk-time" datetime="${esc(t.at)}">${relTime(t.at, Date.parse(d.built_at))}</time></a></li>`,
    )
    .join('');
  return `<div class="wrap ticker-head">
    <span class="live-dot" aria-hidden="true"></span>
    <span>Real testnet transactions from <span class="mono">evidence/</span></span>
    <a class="ticker-all" href="${REPO_URL}/blob/main/evidence/EVIDENCE.md">All ${d.evidence_txs} →</a>
  </div>
  <div class="marquee" tabindex="0" aria-label="Recent testnet transactions, scrollable">
    <ul class="marquee-track">${items}</ul>
    <ul class="marquee-track" aria-hidden="true">${items.replace(/<a /g, '<a tabindex="-1" ')}</ul>
  </div>`;
}

// ---------- problem chat ----------

export function chat(): string {
  const msgs: [string, string, boolean?][] = [
    ['Deniz', 'printer is broken again'],
    ['Mert', 'who used it last??'],
    ['Ayşe', 'Cleaned the nozzle and recalibrated last night. Should print fine now.', true],
    ['Can', 'wen fixed'],
    ['Deniz', 'also we are out of filament. who pays for the spool?'],
    ['Mert', 'ask Elif, she has the spreadsheet'],
  ];
  return `<figure class="chat" data-play aria-label="Example group chat">
    <header class="chat-head"><span class="chat-title"><b>#printer</b> · Makerspace group</span>${label('Example')}</header>
    <ol class="chat-msgs">${msgs
      .map(
        ([who, text, key], i) => `<li class="msg${key ? ' msg-key' : ''}" style="--i:${i}">
        ${avatar(who, 32)}<div class="bubble"><span class="who">${who}${key ? '<span class="msg-flag">The fix</span>' : ''}</span><p>${esc(text)}</p></div></li>`,
      )
      .join('')}</ol>
    <footer class="chat-foot"><span class="chat-more">23 new messages ↓</span></footer>
    <figcaption class="sr">An example chat: the one message that says who fixed the printer is buried between complaints.</figcaption>
  </figure>`;
}

// ---------- loop diagram ----------

export function loop(d: LandingData): string {
  const { a } = printer(d);
  const nodes = [
    { x: 260, y: 60, t: 'Reserve', s: 'fee + refundable deposit', c: 'sage' },
    { x: 460, y: 260, t: 'Unlock', s: 'bridge checks the booking', c: 'sage' },
    { x: 260, y: 460, t: 'Upkeep', s: 'counter crosses a rule', c: 'brass' },
    { x: 60, y: 260, t: 'Access', s: 'verified work earns rights', c: 'brass' },
  ];
  const arcs = [
    ['M260 60 A200 200 0 0 1 460 260', 'sage'],
    ['M460 260 A200 200 0 0 1 260 460', 'brass'],
    ['M260 460 A200 200 0 0 1 60 260', 'brass'],
    ['M60 260 A200 200 0 0 1 260 60', 'sage'],
  ];
  return `<figure class="loop" data-progress aria-label="The loop: reserve, unlock, upkeep, access">
    <svg viewBox="0 0 520 520" class="loop-svg" aria-hidden="true">
      <circle cx="260" cy="260" r="200" class="loop-track"/>
      ${arcs.map(([p, c], i) => `<path d="${p}" pathLength="1" class="loop-arc arc-${c}" style="--k:${i}"/>`).join('')}
      ${[0, 1, 2, 3].map((i) => `<circle r="4.5" class="loop-dot dot-${i % 2 ? 'brass' : 'sage'}"><animateMotion dur="14s" begin="-${i * 3.5}s" repeatCount="indefinite" path="M260 60a200 200 0 1 1-.01 0"/></circle>`).join('')}
    </svg>
    ${nodes
      .map(
        (n, i) => `<div class="loop-node node-${n.c}" style="--x:${(n.x / 520) * 100}%;--y:${(n.y / 520) * 100}%;--k:${i}">
        <span class="loop-n mono">0${i + 1}</span><b>${n.t}</b><span>${n.s}</span></div>`,
      )
      .join('')}
    <div class="loop-core">
      <span class="loop-core-k mono">its own account</span>
      <b class="mono">${esc(firstLabel(a.account))}</b>
      <span class="mono loop-core-sub">.${esc(a.account.split('.').slice(1).join('.'))}</span>
      <span class="loop-core-tags"><span class="badge">keyless</span><span class="badge">same code</span></span>
    </div>
  </figure>`;
}

// ---------- how it works (sticky steps) ----------

export function steps(d: LandingData): string {
  const { a, p } = printer(d);
  const fee = BigInt(p.price_per_slot);
  const nozzle = p.rules.find((r) => r.rule_id === 'nozzle_clean');
  const bridgeKey = d.dep.function_call_keys.find((k) => k.account.startsWith('bridge.') && k.receiver_id === a.account);
  const agentKey = d.dep.function_call_keys.find((k) => k.account.startsWith('agent.') && k.receiver_id === a.account);
  const council = d.dep.communities[a.community]?.dao_council ?? [];

  const v1 = `<div class="vis vis-reserve">
    <div class="vcard">
      <p class="vcard-k"><span class="mono">reserve()</span>${proofLabel(d, 2)}</p>
      <h4>Makerlab 3D printer</h4>
      <div class="slots" aria-hidden="true">${['13:00', '13:30', '14:00', '14:30', '15:00', '15:30']
        .map((s, i) => `<span class="slot${i === 2 || i === 3 ? ' on' : ''}${i === 5 ? ' taken' : ''}">${s}</span>`)
        .join('')}</div>
      <dl class="receipt">
        <div><dt>2 slots × ${near(fee)} NEAR</dt><dd class="mono">${near(fee * 2n)} NEAR</dd></div>
        <div><dt>Deposit, refundable</dt><dd class="mono">${near(p.deposit)} NEAR</dd></div>
      </dl>
      <p class="vcard-foot"><span class="status ok"><i></i>Confirmed</span><span class="muted small">The slot is held before any cross-contract call, so it can't be booked twice.</span></p>
    </div>
    <p class="vis-note">Fee and deposit from <code>profiles/printer_3d.json</code>; slot times are illustrative.</p>
  </div>`;

  const v2 = `<div class="vis vis-unlock" data-unlock>
    <div class="unlock-stage">
      ${art('printer', 'The printer', 'unlock-art')}
      <span class="lamp" aria-hidden="true"></span>
    </div>
    <ol class="unlock-log mono" aria-label="Bridge decisions">
      <li class="deny"><span>can_access(no booking)</span><b>unknown_reservation → stays off</b></li>
      <li class="allow"><span>can_access(#booking, holder)</span><b>ok → power on</b></li>
    </ol>
    <p class="vis-note">${label('Simulated', 'tag-sim')} ${proofLabel(d, 3)} The bridge is a small service next to the machine. Its key can call only ${bridgeKey ? bridgeKey.method_names.map((m) => `<code>${m}</code>`).join(', ') : 'four reporting methods'}.</p>
  </div>`;

  const v3 = `<div class="vis vis-upkeep">
    <div class="vcard agent-card">
      <p class="vcard-k"><span class="mono">open_upkeep_task()</span>${proofLabel(d, 7)}</p>
      <p class="agent-who mono">${esc(agentKey?.account ?? 'agent')}</p>
      <p class="agent-why">"nozzle_seconds grew by 720,000 since the last clean, the threshold for <b>${esc(nozzle?.rule_id ?? 'nozzle_clean')}</b>. Opening: ${esc(nozzle?.title ?? '')}."</p>
      <ol class="approvals">
        <li class="no"><span>ayse</span><em>did the work</em><b>can't approve</b></li>
        <li class="no"><span>agent</span><em>opened it</em><b>can't approve</b></li>
        <li class="no"><span>bridge</span><em>ran the test</em><b>can't approve</b></li>
        <li class="yes"><span>${esc(firstLabel(council[1] ?? 'burak'))}</span><em>another member</em><b>approves</b></li>
      </ol>
    </div>
  </div>`;

  const cards = [1, 2]
    .map(
      (n) => `<div class="right-card" style="--n:${n}">
      <span class="rc-k mono">USAGE RIGHT · NEP-171</span>
      <b>makerlab-fab</b>
      <span class="rc-v">up to ${p.right_max_slots} slots · valid ${p.right_validity_days} days</span>
      <span class="rc-foot mono">holder: ayse · non-transferable</span>
    </div>`,
    )
    .join('');
  const v4 = `<div class="vis vis-access">
    <div class="right-stack">${cards}</div>
    <p class="vis-note">${proofLabel(d, 8)} ${nozzle?.reward_rights ?? 2} cards for <b>${esc(nozzle?.rule_id ?? 'nozzle_clean')}</b>, as the profile says. <code>nft_transfer</code> always fails, and no method revokes a usage right.</p>
  </div>`;

  const text = [
    ['Reserve', 'Book a slot on the machine\'s own account. You pay the fee and a refundable deposit. Deposits are never used for fees, rewards or sweeps.'],
    ['Unlock', 'The bridge next to the machine powers it only for a valid on-chain reservation, in its start window, for the person who holds it.'],
    ['Upkeep', 'When a counter on the machine crosses a rule, its agent opens the task with the numbers that justify it. Someone does the work; a different member approves it.'],
    ['Earn access', 'The person who kept it alive gets usage rights for this machine or its group: non-transferable cards that nobody can take back.'],
  ];
  const visuals = [v1, v2, v3, v4];
  return `<div class="steps" data-steps>
    ${text
      .map(
        ([t, b], i) => `<div class="step" data-step="${i}">
        <div class="step-text"><span class="step-n mono">0${i + 1}</span><h3>${t}</h3><p>${b}</p></div>
        <div class="step-vis">${visuals[i]}</div>
      </div>`,
      )
      .join('')}
    <ol class="step-rail" aria-hidden="true">${text.map(([t], i) => `<li data-rail="${i}"><span>0${i + 1}</span>${t}</li>`).join('')}</ol>
  </div>`;
}

// ---------- every kind of care ----------

const KIND_TO_CHIP: Record<string, string> = {
  Maintenance: 'fix',
  Repair: 'fix',
  Restock: 'refill',
  Cleaning: 'clean',
  Inspection: 'check',
  Rebalance: 'other',
  Supervision: 'other',
};

export function care(d: LandingData): string {
  const order = ['printer_3d', 'laser_cutter', 'washer', 'community_fridge'];
  const profiles = [...d.profiles].sort((x, y) => {
    const ix = order.indexOf(x.asset_type);
    const iy = order.indexOf(y.asset_type);
    return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy) || x.display_name.localeCompare(y.display_name);
  });
  const chips = [
    ['all', 'All 12'],
    ['fix', 'Fix it'],
    ['refill', 'Refill it'],
    ['clean', 'Clean it'],
    ['check', 'Check it'],
    ['teach', 'Teach it'],
  ];
  const tiles = profiles
    .map((p) => {
      const kinds = new Set(p.rules.map((r) => KIND_TO_CHIP[r.kind] ?? 'other'));
      if (p.required_credential) kinds.add('teach');
      const sim = p.status.includes('testnet asset');
      const rules = p.rules
        .map(
          (r) => `<li data-kind="${KIND_TO_CHIP[r.kind] ?? 'other'}"><span class="k">${esc(r.kind)}</span><span class="rt">${esc(r.title)}</span><span class="tr mono">${esc(triggerText(r.trigger))}</span></li>`,
        )
        .join('');
      const teach = p.required_credential
        ? `<li data-kind="teach"><span class="k">Teaching</span><span class="rt">Needs a <b class="mono">${esc(p.required_credential)}</b> card; trainers earn rights</span></li>`
        : '';
      return `<li class="tile${sim ? ' tile-sim' : ''}" data-kinds="${[...kinds].join(' ')}">
        <div class="tile-art">${art(p.icon, '')}</div>
        <div class="tile-body">
          <h3>${esc(p.display_name)}</h3>
          <ul class="rules">${rules}${teach}</ul>
          <p class="tile-foot"><span class="badge ${sim ? 'badge-sim' : 'badge-ex'}">${esc(p.status)}</span><span class="mono tile-src">${esc(p.file)}</span></p>
        </div>
      </li>`;
    })
    .join('');
  return `<div class="chips" role="group" aria-label="Filter by kind of care">${chips
    .map(([k, t]) => `<button type="button" class="chip" data-chip="${k}" aria-pressed="${k === 'all'}">${t}</button>`)
    .join('')}</div>
  <p class="chips-note muted small" aria-live="polite" data-chip-note></p>
  <ul class="tiles">${tiles}</ul>
  <p class="care-foot muted small">Status labels are copied from the README scenario table. No physical device is used anywhere.</p>`;
}

// ---------- money flow ----------

export function sankey(d: LandingData): string {
  const { p } = printer(d);
  const swept = d.snapshot.assets.reduce((s, a) => s + BigInt(a.ledger.total_swept), 0n);
  const sweptFrom = d.snapshot.assets.filter((a) => BigInt(a.ledger.total_swept) > 0n).map((a) => firstLabel(a.account));
  const deposits = d.snapshot.assets.reduce((s, a) => s + BigInt(a.ledger.deposits_held), 0n);
  const floats = d.snapshot.assets.map((a) => `${firstLabel(a.account)} ${near(a.ledger.float_free)}/${near(a.ledger.float_cap)}`);
  const restock = p.rules.find((r) => BigInt(r.reimbursable_max) > 0n);

  // horizontal (≥ 760 px) and vertical (phones) versions of the same flow
  const H = `<svg class="sankey sankey-h" viewBox="0 0 1100 470" role="img" aria-labelledby="sk-t">
    <title id="sk-t">Usage fees flow into the asset float, which pays upkeep; everything above the float cap goes to the community DAO treasury. Deposits are a separate stream that only goes back to members.</title>
    <defs>
      <linearGradient id="g-fee" x1="0" x2="1"><stop offset="0" stop-color="var(--brass)"/><stop offset="1" stop-color="var(--brass-2)"/></linearGradient>
      <linearGradient id="g-home" x1="0" x2="1"><stop offset="0" stop-color="var(--brass-2)"/><stop offset="1" stop-color="var(--sage)"/></linearGradient>
    </defs>
    <path class="flow f-fee" d="M230 124 C 360 124, 350 152, 470 152" stroke="url(#g-fee)" stroke-width="78"/>
    <path class="flow f-up" d="M650 132 C 760 132, 740 72, 850 72" stroke="var(--brass)" stroke-width="22"/>
    <path class="flow f-home" d="M650 178 C 760 178, 740 222, 850 222" stroke="url(#g-home)" stroke-width="52"/>
    <path class="flow f-dep" d="M230 390 C 520 390, 560 390, 850 390" stroke="var(--slate)" stroke-width="40"/>
    <path class="flow-dash" d="M230 124 C 360 124, 350 152, 470 152 M650 178 C 760 178, 740 222, 850 222 M650 132 C 760 132, 740 72, 850 72"/>
    <path class="flow-dash dep" d="M230 390 C 520 390, 560 390, 850 390"/>
    <rect class="node n-brass" x="20" y="76" width="210" height="96" rx="12"/>
    <rect class="node n-float" x="470" y="96" width="180" height="112" rx="12"/>
    <line class="cap" x1="470" x2="650" y1="110" y2="110"/>
    <rect class="node n-brass" x="850" y="38" width="230" height="68" rx="12"/>
    <rect class="node n-sage" x="850" y="186" width="230" height="72" rx="12"/>
    <rect class="node n-slate" x="20" y="360" width="210" height="60" rx="12"/>
    <rect class="node n-slate" x="850" y="360" width="230" height="60" rx="12"/>
    <g class="lbl">
      <text x="36" y="108" class="t">Usage fees</text><text x="36" y="132" class="s">${near(p.price_per_slot)} NEAR per 30-min slot</text><text x="36" y="154" class="s">printer profile</text>
      <text x="638" y="126" class="s cap-t" text-anchor="end">cap</text>
      <text x="486" y="150" class="t">Asset float</text><text x="486" y="174" class="s">capped at ${near(p.float_cap)} NEAR</text><text x="486" y="196" class="s">keyless account</text>
      <text x="866" y="66" class="t">Upkeep</text><text x="866" y="90" class="s">refills ≤ ${restock ? near(restock.reimbursable_max) : '—'} NEAR, rewards</text>
      <text x="866" y="216" class="t">Community DAO</text><text x="866" y="240" class="s">everything over the cap</text>
      <text x="36" y="386" class="t">Deposits</text><text x="36" y="406" class="s">${near(p.deposit)} NEAR, refundable</text>
      <text x="866" y="386" class="t">Back to the member</text><text x="866" y="406" class="s">never fees, never sweeps</text>
      <text x="540" y="350" class="s it" text-anchor="middle">separate stream · a liability, not revenue</text>
    </g>
  </svg>`;
  const V = `<svg class="sankey sankey-v" viewBox="0 0 360 640" role="img" aria-labelledby="sk-tv">
    <title id="sk-tv">Fees flow into the asset float; above the cap they go to the DAO; deposits only go back to members.</title>
    <path class="flow f-fee" d="M110 86 C 110 150, 120 150, 120 200" stroke="var(--brass)" stroke-width="58"/>
    <path class="flow f-up" d="M90 276 C 90 330, 70 330, 70 380" stroke="var(--brass)" stroke-width="18"/>
    <path class="flow f-home" d="M150 276 C 150 330, 200 330, 200 380" stroke="var(--sage)" stroke-width="40"/>
    <path class="flow f-dep" d="M300 86 C 300 300, 300 400, 300 520" stroke="var(--slate)" stroke-width="30"/>
    <path class="flow-dash" d="M110 86 C 110 150, 120 150, 120 200 M150 276 C 150 330, 200 330, 200 380 M90 276 C 90 330, 70 330, 70 380"/>
    <path class="flow-dash dep" d="M300 86 C 300 300, 300 400, 300 520"/>
    <rect class="node n-brass" x="20" y="20" width="190" height="66" rx="12"/>
    <rect class="node n-float" x="20" y="200" width="200" height="76" rx="12"/>
    <line class="cap" x1="20" x2="220" y1="212" y2="212"/>
    <rect class="node n-brass" x="10" y="380" width="120" height="70" rx="12"/>
    <rect class="node n-sage" x="140" y="380" width="120" height="70" rx="12"/>
    <rect class="node n-slate" x="250" y="20" width="100" height="66" rx="12"/>
    <rect class="node n-slate" x="250" y="520" width="100" height="70" rx="12"/>
    <g class="lbl">
      <text x="34" y="48" class="t">Usage fees</text><text x="34" y="70" class="s">${near(p.price_per_slot)} NEAR / slot</text>
      <text x="34" y="238" class="t">Asset float</text><text x="34" y="260" class="s">cap ${near(p.float_cap)} NEAR</text>
      <text x="22" y="410" class="t">Upkeep</text><text x="22" y="432" class="s">≤ cap</text>
      <text x="152" y="410" class="t">DAO</text><text x="152" y="432" class="s">over the cap</text>
      <text x="262" y="48" class="t">Deposit</text><text x="262" y="70" class="s">${near(p.deposit)} NEAR</text>
      <text x="262" y="550" class="t">Back</text><text x="262" y="572" class="s">to member</text>
    </g>
  </svg>`;
  return `<div class="money-in">
    <figure class="sankey-fig" data-progress>${H}${V}</figure>
    <div class="money-facts">
      <div class="fact"><span class="fact-k">Swept to DAOs on testnet so far</span><b class="mono" data-count="${near(swept, 3)}">${near(swept, 3)}</b><span class="fact-u">NEAR</span><span class="fact-s">${sweptFrom.length ? `from ${esc(sweptFrom.join(', '))}` : 'no sweep yet'} · ledger <code>total_swept</code></span></div>
      <div class="fact"><span class="fact-k">Deposits held right now</span><b class="mono">${near(deposits, 3)}</b><span class="fact-u">NEAR</span><span class="fact-s">a liability, kept apart from the float</span></div>
      <div class="fact"><span class="fact-k">Floats vs caps</span><span class="mono fact-list">${floats.map(esc).join('<br>')}</span><span class="fact-s">NEAR, read ${utcStamp(d.snapshot.taken_at)}</span></div>
    </div>
  </div>`;
}

// ---------- why onchain ----------

export function why(d: LandingData): string {
  const { a } = printer(d);
  const ex = d.excerpts;
  const code = (e: { path: string; lines: { n: number; text: string }[] }) =>
    e.lines.map((l) => `<span class="cl"><span class="ln-n">${l.n}</span>${hl(l.text)}</span>`).join('');
  const assets = d.snapshot.assets;
  const hashes = new Set(assets.map((x) => x.code_hash));
  const keyless = assets.every((x) => x.full_access_keys === 0);
  const daos = Object.values(d.dep.communities).map((c) => c.dao_id);
  return `<div class="why-grid">
    <div class="dbcard" data-play>
      <p class="dbcard-k">In a company database ${label('Example')}</p>
      <table class="db">
        <caption class="sr">Example rights table in an ordinary database</caption>
        <thead><tr><th>member</th><th>right</th><th>earned for</th></tr></thead>
        <tbody>
          <tr><td>can</td><td>printer · 1 slot</td><td>bed level</td></tr>
          <tr class="victim"><td>ayse</td><td>printer · 2 slots</td><td>nozzle clean</td></tr>
          <tr><td>zeynep</td><td>laser · 2 slots</td><td>trained 3 people</td></tr>
        </tbody>
      </table>
      <p class="db-sql mono"><span class="prompt">admin&gt;</span> DELETE FROM rights WHERE member = 'ayse';</p>
      <p class="db-after">1 row deleted. No trace, no notice, no appeal.</p>
      <div class="db-next">
        <p class="db-next-k mono">next morning · printer door</p>
        <p class="db-next-v"><span class="mono">ayse</span> → access denied: no rights found</p>
      </div>
      <p class="dbcard-foot">Your access lasts as long as whoever runs the database agrees.</p>
    </div>
    <div class="codecard">
      <header class="codecard-head"><span class="mono">${esc(ex.transfer.path)}</span><span class="pill pill-ok">No revoke method</span></header>
      <pre class="code" aria-label="Excerpt of the commons contract"><code>${code(ex.constant)}<span class="cl gap">⋮</span>${code(ex.transfer)}<span class="cl gap">⋮ ${esc(ex.revoke.path)}</span>${code(ex.revoke)}</code></pre>
      <ul class="checks">
        <li><a href="/app/proof"><span class="ck">${keyless ? '✓' : '·'}</span><span><b>Keyless accounts</b><em>${keyless ? `0 access keys on all ${assets.length} asset accounts` : 'keyless step pending'}</em></span></a></li>
        <li><a href="/app/proof"><span class="ck">${hashes.size === 1 ? '✓' : '·'}</span><span><b>Same code on every machine</b><em class="mono">${hashes.size === 1 ? `code_hash ${shortHash([...hashes][0]!)} × ${assets.length}` : `${hashes.size} different code hashes`}</em></span></a></li>
        <li><a href="/app/proof"><span class="ck">✓</span><span><b>Custody in Sputnik DAO</b><em class="mono">${daos.map(esc).join(' · ')}</em></span></a></li>
        <li><a href="${acctUrl(a.account)}" target="_blank" rel="noopener"><span class="ck">✓</span><span><b>Every action on the explorer</b><em class="mono">${esc(firstLabel(a.account))} on testnet.nearblocks.io ↗</em></span></a></li>
      </ul>
      <p class="codecard-foot">Read from testnet ${utcStamp(d.snapshot.taken_at)}. The app's proof page runs the same checks live.</p>
    </div>
  </div>
  <p class="why-fine">Precisely: no method deletes, downgrades or transfers a usage-right card once granted. The DAO can still make a card unusable in practice, by deactivating the asset, moving it to another group or adding a credential requirement; the README lists this under honest limits.</p>`;
}

function hl(src: string): string {
  return esc(src)
    .replace(/(\/\/.*)$/, '<span class="c-com">$1</span>')
    .replace(/(&quot;[^&]*?&quot;)/g, '<span class="c-str">$1</span>')
    .replace(/\b(pub|fn|const|let|else|mut|self|impl)\b/g, '<span class="c-kw">$1</span>')
    .replace(/(#\[payable\])/g, '<span class="c-attr">$1</span>')
    .replace(/\b(env::panic_str)\b/g, '<span class="c-fn">$1</span>');
}

// ---------- bounded agent ----------

interface PlannedAttempt {
  id: string;
  spec: string;
  expected: string[];
}

function plannedAttempts(): PlannedAttempt[] {
  const src = readFileSync(resolve(REPO, 'agent/src/limits-demo.ts'), 'utf8');
  const out: PlannedAttempt[] = [];
  const re = /id: "([a-z_]+)",\s*spec: "([^"]+)",[\s\S]*?expected: \[([^\]]*)\]/g;
  for (let m; (m = re.exec(src)); )
    out.push({ id: m[1]!, spec: m[2]!, expected: [...m[3]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!) });
  return out;
}

export function agent(d: LandingData): string {
  const L = d.limits;
  if (L) {
    const rows = L.attempts
      .map(
        (t, i) => `<li class="tl ${t.pass ? 'pass' : t.status === 'skipped' ? 'skip' : 'fail'}" style="--i:${i}">
        <span class="tl-spec">${esc(t.spec)}</span>
        <span class="tl-res">${t.status === 'rejected' ? `refused · <b>${esc(t.code ?? '?')}</b>` : esc(t.status)}${t.tx_hash ? ` <a href="${tx(t.tx_hash)}" target="_blank" rel="noopener">tx ↗</a>` : ''}</span></li>`,
      )
      .join('');
    return `<div class="term" data-play>
      <header class="term-head"><span class="dots3"><i></i><i></i><i></i></span><span class="mono">evidence/agent-limits.json</span>${L.simulated ? label('Simulated', 'tag-sim') : ''}</header>
      <div class="term-body mono">
        <p class="tl-cmd">$ agent limits --send-testnet-transactions  <span class="muted"># ${esc(L.agent_account)}</span></p>
        <ol class="tl-list">${rows}</ol>
        <p class="tl-sum">${L.all_passed ? '✓ every attempt refused by the contract' : '✗ not all attempts were refused as expected'} · ${utcStamp(L.generated_at)}</p>
      </div>
    </div>`;
  }
  const plan = plannedAttempts();
  return `<div class="term term-pending" data-play>
    <header class="term-head"><span class="dots3"><i></i><i></i><i></i></span><span class="mono">agent limits · testnet</span><span class="pill pill-wait">Testnet run pending</span></header>
    <div class="term-body mono">
      <p class="tl-cmd">$ pnpm --filter @commonkit/agent limits --send-testnet-transactions</p>
      <p class="muted"># evidence/agent-limits.json is not written yet. The attempts it will make,</p>
      <p class="muted"># each of which the contract (or the protocol) must refuse:</p>
      <ol class="tl-list">${plan
        .map(
          (t, i) => `<li class="tl wait" style="--i:${i}"><span class="tl-spec">${esc(t.spec)}</span><span class="tl-res">expects <b>${t.expected.map(esc).join(' | ')}</b></span></li>`,
        )
        .join('')}</ol>
      <p class="tl-sum">◌ results appear here, with tx links, once the run is recorded in evidence/</p>
    </div>
  </div>`;
}

// ---------- why NEAR ----------

function latestVerify(): { file: string; ok: number; passed: boolean; lines: string[] } | null {
  const dir = resolve(REPO, 'evidence');
  const files = readdirSync(dir).filter((f) => /^verify-.*\.txt$/.test(f)).sort();
  const f = files.at(-1);
  if (!f) return null;
  const txt = readFileSync(resolve(dir, f), 'utf8').split('\n');
  return {
    file: `evidence/${f}`,
    ok: txt.filter((l) => l.startsWith('✅')).length,
    passed: txt.some((l) => l.includes('all checks passed')),
    lines: txt,
  };
}

export function nearSection(d: LandingData): string {
  const { a } = printer(d);
  const bridgeKey = d.dep.function_call_keys.find((k) => k.account.startsWith('bridge.') && k.receiver_id === a.account);
  const agentKey = d.dep.function_call_keys.find((k) => k.account.startsWith('agent.') && k.receiver_id === a.account);
  const dao = d.dep.communities[a.community]?.dao_id ?? '';
  const v = latestVerify();
  const keyless0 = v ? v.lines.filter((l) => /^✅ .*access keys: 0$/.test(l)).length : 0;
  const tiles = [
    {
      t: 'Named accounts',
      b: 'A machine gets an address you can read aloud, under its community.',
      x: `<span class="acct-split mono"><b>${esc(firstLabel(a.account))}</b>.${esc(a.account.split('.').slice(1).join('.'))}</span>`,
    },
    {
      t: 'Function-call keys',
      b: 'The bridge and the agent sign with keys that can call only their own methods on one asset.',
      x: `<span class="mono keylist"><span>bridge →</span> ${bridgeKey?.method_names.map(esc).join(', ') ?? ''}<br><span>agent →</span> ${agentKey?.method_names.map(esc).join(', ') ?? ''}</span>`,
    },
    {
      t: 'Unmodified Sputnik DAO',
      b: 'Community money and votes live in a standard DAO from the public factory. Our contracts open ordinary proposals.',
      x: `<span class="mono">${esc(dao)}</span><span class="mono muted">factory ${esc(d.dep.factory)}</span>`,
    },
    {
      t: 'NEP-171 cards',
      b: 'Usage rights and credentials are standard NFTs wallets can list, with transfer and approval methods that always refuse.',
      x: `<span class="mono">nft_transfer → E_NON_TRANSFERABLE</span>`,
    },
  ];
  const nums = [
    [String(d.snapshot.assets.length), 'asset accounts on testnet, one contract', 'snapshot'],
    ['1', `code_hash across them (${shortHash(d.dep.code.asset.code_hash)})`, v?.file ?? 'deployments'],
    [int(d.dep.code.asset.bytes), 'bytes of asset WASM, shared by every machine', 'deployments/testnet.json'],
    [String(keyless0), 'contract and DAO accounts with 0 access keys', v?.file ?? ''],
    [String(d.evidence_txs), 'testnet transactions recorded in evidence/', 'evidence/*.json'],
  ].filter(([n]) => n !== '0');
  return `<ul class="near-tiles">${tiles
    .map((t) => `<li class="ntile" data-reveal><h3>${t.t}</h3><p>${t.b}</p><div class="ntile-x">${t.x}</div></li>`)
    .join('')}</ul>
  <div class="nums">${nums
    .map(([n, t, s]) => `<div class="num-cell" data-reveal><b class="mono" data-count="${n!.replace(/,/g, '')}">${n}</b><span>${esc(t!)}</span><em class="mono">${esc(s!)}</em></div>`)
    .join('')}</div>
  <p class="nums-note muted small">Only numbers we measured or recorded. Measured on ${utcStamp(d.snapshot.taken_at)} unless the source says otherwise.</p>`;
}

// ---------- proof & pilot ----------

export function proof(d: LandingData): string {
  const v = latestVerify();
  const pick = v
    ? v.lines.filter((l) => /share code_hash|runs the factory default|ledger invariant_ok/.test(l)).slice(0, 4)
    : [];
  const pilot = d.pilot
    ? `<p>Pilot evidence is recorded. The numbers, whatever they are, are on <a href="/app/pilot">/app/pilot</a>.</p>`
    : `<p class="pending-big">Pilot pending</p><p>A small pilot with real people and a real shared item is planned. Until it has run, this page claims no users, no sessions and no pilot numbers. When it runs, the real numbers appear here and on <a href="/app/pilot">/app/pilot</a>, whatever they are.</p>`;
  return `<div class="proof-grid">
    <div class="pcard pcard-verify">
      <p class="pcard-k mono">./scripts/verify.sh</p>
      ${
        v
          ? `<pre class="mono verify">${pick.map((l) => esc(l.length > 92 ? `${l.slice(0, 90)}…` : l)).join('\n')}\n…\n${v.passed ? `✅ all checks passed (${v.ok} ✅)` : '✗ some checks failed'}</pre><p class="small muted">Read-only, keyless. Output of the last run: <a href="${REPO_URL}/blob/main/${v.file}" class="mono">${esc(v.file)}</a></p>`
          : '<p>verify.sh has not been recorded yet.</p>'
      }
      <a class="btn btn-ghost btn-sm" href="/app/proof">Run the same checks in the app →</a>
    </div>
    <div class="pcard pcard-pilot">
      <p class="pcard-k mono">pilot</p>
      ${pilot}
    </div>
    <div class="pcard pcard-links">
      <p class="pcard-k mono">go deeper</p>
      <ul class="plinks">
        <li><a href="/app/proof">Proof page<span>keyless accounts, code hashes, ledger invariants</span></a></li>
        <li><a href="${REPO_URL}/blob/main/evidence/EVIDENCE.md">Evidence log<span>every testnet transaction with its explorer link</span></a></li>
        <li><a href="${REPO_URL}">Source code<span>contracts, bridge, agent, app (MIT)</span></a></li>
        <li><a href="${REPO_URL}#security-model-and-honest-limits">Honest limits<span>what this does not do</span></a></li>
      </ul>
    </div>
  </div>`;
}

// ---------- final ----------

export function finalArt(): string {
  return `<div class="final-art" aria-hidden="true">${ART_KEYS.map((k, i) => `<span style="--i:${i}">${art(k, '')}</span>`).join('')}</div>`;
}

export function buildStamp(d: LandingData): string {
  return `<span class="mono stamp">Page built ${utcStamp(d.built_at)} · testnet snapshot ${utcStamp(d.snapshot.taken_at)}</span>`;
}

export const logo = () => LOGO_MARK;

export function renderSlots(d: LandingData): Record<string, string> {
  return {
    logo: logo(),
    'hero-a': heroA(d),
    'hero-b': heroB(d),
    'hero-stats': heroStats(d),
    ticker: ticker(d),
    chat: chat(),
    loop: loop(d),
    steps: steps(d),
    care: care(d),
    sankey: sankey(d),
    why: why(d),
    agent: agent(d),
    near: nearSection(d),
    proof: proof(d),
    'final-art': finalArt(),
    'build-stamp': buildStamp(d),
  };
}
