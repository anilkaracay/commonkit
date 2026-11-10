/** Hero cards for one asset. Pure string templates: rendered at build time from the snapshot, re-rendered in
 * the browser from live testnet views. */
import { avatar } from './avatar.ts';
import { keepers, mostDue, openTask, type AssetSnap } from './chain.ts';
import { esc, firstLabel, int, metricPair, near, relTime, triggerText, utcStamp, type Trigger } from './format.ts';

/** A rule threshold lowered on chain by a DAO `set_profile` proposal (from evidence/). */
export interface DemoOverride {
  dao: string;
  proposal: string;
  tx: string | null;
}

export interface CardCtx {
  /** rule_id → trigger in the profile file (the production value) */
  fileTriggers: Record<string, Trigger>;
  /** rule_id → the DAO proposal that set a demo threshold, when evidence/ records one */
  overrides: Record<string, DemoOverride>;
  /** rule_id → title, from the asset's profile file */
  titles: Record<string, string>;
  /** profile numbers the views do not return */
  rightValidityDays: number;
  icon: string;
  live: boolean;
  at: string;
  now?: number;
}

function sourceLabel(ctx: CardCtx): string {
  return ctx.live
    ? `<span class="src src-live"><i></i>Live · testnet views · read ${relTime(ctx.at, ctx.now)}</span>`
    : `<span class="src"><i></i>Snapshot · testnet views read ${utcStamp(ctx.at)}</span>`;
}

interface Progress {
  rule: string;
  cur: string;
  since: string;
  ruleText: string;
  frac: number;
  due: boolean;
  trigger: Trigger | null;
}

function ruleProgress(a: AssetSnap): Progress {
  const md = mostDue(a);
  if (!md) return { rule: 'none', cur: '0', since: '', ruleText: '', frac: 0, due: false, trigger: null };
  const r = md.rule;
  const t = r.trigger;
  const base = { rule: r.rule_id, frac: md.frac, due: r.due, trigger: t, ruleText: triggerText(t) };
  if ('Metric' in t) {
    const m = metricPair(t.Metric.metric, Math.max(0, Number(r.current) - Number(r.baseline)), t.Metric.threshold);
    return { ...base, cur: m.cur, since: `${m.label} since the last ${r.rule_id}` };
  }
  if ('Schedule' in t) return { ...base, cur: int(r.current), since: `h since the last ${r.rule_id}` };
  return { ...base, cur: int(r.current), since: `open fault report${r.current === '1' ? '' : 's'}` };
}

const sameTrigger = (x: Trigger, y: Trigger | undefined) => JSON.stringify(x) === JSON.stringify(y);

/** "Demo threshold, set by DAO proposal #9 · production profile: every 200 h of printing", or '' if unchanged. */
export function demoLabel(ruleId: string, onChain: Trigger | null, ctx: CardCtx): string {
  const file = ctx.fileTriggers[ruleId];
  if (!onChain || !file || sameTrigger(onChain, file)) return '';
  const o = ctx.overrides[ruleId];
  const by = o
    ? `set by DAO proposal ${o.tx ? `<a href="https://testnet.nearblocks.io/txns/${esc(o.tx)}" target="_blank" rel="noopener">#${esc(o.proposal)}</a>` : `#${esc(o.proposal)}`}`
    : 'set by a DAO proposal';
  return `<p class="demo-th"><span class="demo-th-k">Demo threshold</span> ${by} · production profile: ${esc(triggerText(file))}</p>`;
}

export function machineCard(a: AssetSnap, ctx: CardCtx, variant: 'ink' | 'paper' = 'ink'): string {
  const p = ruleProgress(a);
  const float = BigInt(a.ledger.float_free);
  const cap = BigInt(a.ledger.float_cap);
  const ffrac = cap > 0n ? Number((float * 1000n) / cap) / 1000 : 0;
  const ks = keepers(a);
  const keepersHtml = ks.length
    ? `<span class="avatars">${ks.slice(0, 5).map((k) => avatar(k, 26)).join('')}</span><span class="mono small">${ks.slice(0, 2).map((k) => esc(firstLabel(k))).join(', ')}${ks.length > 2 ? ` +${ks.length - 2}` : ''}</span>`
    : `<span class="muted small">Nobody yet. The first person to do its upkeep will be named here.</span>`;
  return `<article class="mcard mcard-${variant}" data-asset="${esc(a.account)}">
  <header class="mcard-head">
    <span class="mcard-icon">${ctx.icon}</span>
    <div class="mcard-id">
      <p class="mcard-name">${esc(a.display_name)}</p>
      <p class="mono mcard-acct">${esc(a.account)}</p>
    </div>
  </header>
  <div class="mcard-badges">
    <span class="status ${a.in_service ? 'ok' : 'off'}"><i></i>${a.in_service ? 'In service' : 'Out of service'}</span>
    <span class="badge badge-sim" title="Emulated device: no physical printer is involved">Simulated</span>
    <span class="badge">${a.full_access_keys === 0 ? 'Keyless' : `${a.full_access_keys} full-access key`}</span>
  </div>
  <div class="mrow">
    <div class="mrow-top"><span class="mrow-label">Upkeep</span><span class="mono mrow-rule">${esc(p.rule)}</span></div>
    <div class="ruler${p.due ? ' due' : ''}" style="--f:${p.frac.toFixed(3)}" role="img" aria-label="${p.cur} ${esc(p.since)}; rule: ${esc(p.ruleText)}"><span class="ruler-fill"></span></div>
    <p class="mrow-val"><b class="mono">${p.cur}</b> <span class="muted">${esc(p.since)}</span></p>
    <p class="mrow-rule-line"><span class="muted">rule: ${esc(p.ruleText)}</span>${p.due ? '<span class="due-chip">due</span>' : ''}</p>
    ${demoLabel(p.rule, p.trigger, ctx)}
  </div>
  <div class="mrow">
    <div class="mrow-top"><span class="mrow-label">Float vs cap</span><span class="muted small">above the cap → DAO</span></div>
    <div class="floatbar" style="--f:${Math.min(1, ffrac).toFixed(3)}" role="img" aria-label="${near(float)} of ${near(cap)} NEAR"><span class="floatbar-fill"></span><span class="floatbar-cap"></span></div>
    <p class="mrow-val"><b class="mono">${near(float)}</b> <span class="muted">of ${near(cap)} NEAR cap</span></p>
  </div>
  <div class="mrow mrow-keepers">
    <span class="mrow-label">Kept alive by</span>
    <div class="keepers">${keepersHtml}</div>
  </div>
  <footer class="mcard-foot">${sourceLabel(ctx)}<a class="mcard-link" href="/app/a/${esc(a.account)}">Open<span class="sr"> ${esc(a.display_name)}</span> →</a></footer>
</article>`;
}

export function taskCard(a: AssetSnap, ctx: CardCtx): string {
  const t = openTask(a);
  if (t) {
    return `<article class="tcard">
  <p class="tcard-k"><span class="mono">UPKEEP TASK #${esc(t.id)}</span><span class="status due"><i></i>${esc(t.status)}</span></p>
  <p class="tcard-title">${esc(ctx.titles[t.rule_id] ?? t.rule_id)}</p>
  <p class="tcard-why">${esc(t.rationale)}</p>
  <p class="tcard-reward"><span class="mono">${t.reward_rights}×</span> usage right${t.reward_rights === 1 ? '' : 's'} · valid ${ctx.rightValidityDays} days · non-transferable</p>
  <p class="tcard-by mono">opened by ${esc(firstLabel(t.opened_by))}${t.claimer ? ` · claimed by ${esc(firstLabel(t.claimer))}` : ''}</p>
</article>`;
  }
  const md = mostDue(a);
  const rule = md?.rule;
  const due = rule?.due === true;
  return `<article class="tcard">
  <p class="tcard-k"><span class="mono">UPKEEP TASK</span>${due ? '<span class="status due"><i></i>Due · not opened yet</span>' : '<span class="status idle"><i></i>None open</span>'}</p>
  <p class="tcard-title">${rule ? esc(ctx.titles[rule.rule_id] ?? rule.rule_id) : 'No rule'}</p>
  <p class="tcard-why">${rule ? (due ? 'Due — waiting for the agent to open the task.' : `Opens by itself ${esc(triggerText(rule.trigger))}. The agent can only open it once the printer's own counter crosses that line.`) : ''}</p>
  ${rule ? demoLabel(rule.rule_id, rule.trigger, ctx) : ''}
  ${rule ? `<p class="tcard-reward"><span class="mono">${rule.reward_rights}×</span> usage right${rule.reward_rights === 1 ? '' : 's'} for whoever does it · valid ${ctx.rightValidityDays} days</p>` : ''}
</article>`;
}
