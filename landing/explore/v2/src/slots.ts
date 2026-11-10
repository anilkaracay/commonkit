/** Build-time HTML for every number on the page (no layout shift, works without JS).
 * Each value comes from the testnet snapshot or evidence/ via virtual:ck-data; nothing is typed by hand. */
import { explorer, headlineRule, int, near, nameOf, pct, ratio, readTime, short, sum, threshold, type Asset, type CkData, type Rule } from './format.ts';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const UNIT: Record<string, string> = { nozzle_seconds: 's', jobs_total: 'jobs', filament_used_mm: 'mm', cycles: 'cycles', run_seconds: 's', temp_high_samples: 'samples' };
const RULE_NAME: Record<string, string> = {
  nozzle_clean: 'Nozzle clean', bed_level: 'Bed level', filament_spool: 'Filament spool', fault_repair: 'Fault repair',
};
const SHORT: Record<string, string> = { printer_3d: '3D printer', laser_cutter: 'Laser cutter', washer: 'Washer', community_fridge: 'Community fridge' };
const COMMUNITY: Record<string, string> = { makerlab: 'Makerlab', 'dorm-b': 'Dorm B' };
const POSTER: Record<string, string> = { printer_3d: 'printer', laser_cutter: 'laser', washer: 'washer', community_fridge: 'fridge' };

function override(d: CkData, a: Asset, r: Rule) {
  return d.overrides.find((o) => o.asset === a.account && o.rule === r.id);
}

function gauge(v: number, label: string): string {
  return `<div class="gauge" role="img" aria-label="${esc(label)}"><span style="--v:${pct(v)}"></span></div>`;
}

function tile(a: Asset): string {
  const f = ratio(a.floatFree, a.floatCap);
  const label = `Float ${near(a.floatFree)} of ${near(a.floatCap)} NEAR`;
  return `<li class="tile">
  <figure class="tile-art"><img src="posters/${POSTER[a.kind]}-800.webp" width="800" height="800" alt="${esc(SHORT[a.kind] ?? a.kind)}, rendered model" loading="lazy" decoding="async"></figure>
  <div class="tile-meta"><span class="tile-name">${esc(SHORT[a.kind] ?? a.kind)}</span><span class="tile-com">${esc(COMMUNITY[a.community] ?? a.community)}</span></div>
  ${gauge(f, label)}
  <p class="tile-num"><span class="num">${near(a.floatFree)}</span><span class="of"> / ${near(a.floatCap)} NEAR</span></p>
</li>`;
}

function ruleRow(d: CkData, a: Asset, r: Rule): string {
  const m = r.trigger.Metric;
  if (!m) return '';
  const o = override(d, a, r);
  const v = Number(r.dueValue) / Math.max(1, threshold(r));
  const unit = UNIT[m.metric] ?? '';
  const status = r.openTask !== null
    ? `<span class="due-dot" aria-hidden="true"></span>Task #${esc(r.openTask)} open`
    : o ? 'Demo threshold' : r.due ? 'Due' : '';
  return `<li class="rule">
  <span class="rule-name">${esc(RULE_NAME[r.id] ?? r.id)}</span>
  <span class="rule-val num">${int(r.dueValue)} / ${int(m.threshold)} ${unit}</span>
  ${gauge(v, `${RULE_NAME[r.id] ?? r.id}: ${r.dueValue} of ${m.threshold} ${unit}`)}
  <span class="rule-status">${status}</span>
</li>`;
}

export function slots(d: CkData): Record<string, string> {
  const p = d.assets.find((a) => a.kind === 'printer_3d')!;
  const nozzle = headlineRule(p);
  const nozzleOv = override(d, p, nozzle);
  const open = p.rules.find((r) => r.openTask !== null);
  const order = ['printer_3d', 'laser_cutter', 'washer', 'community_fridge'];
  const lineup = order.map((k) => d.assets.find((a) => a.kind === k)).filter((a): a is Asset => !!a);
  const swept = sum(d.assets.map((a) => a.swept));
  const daos = new Set(d.assets.filter((a) => BigInt(a.swept) > 0n).map((a) => a.dao)).size;
  const earnedTask = p.tasks.find((t) => t.status === 'Rewarded');
  const refusedRows = d.refused.map((r) => {
    const what = /revoke/i.test(r.label) ? 'Revoke a right' : /burn/i.test(r.label) ? 'Burn a right' : 'Council transfer';
    const why = r.code === 'PROTOCOL:MethodNotFound' ? 'No such method' : r.code;
    return `<li><span class="x" aria-hidden="true"></span><span class="what">${what}</span><a class="why" href="${explorer(r.hash)}" rel="noopener">${esc(why)}<span class="tx num"> · ${short(r.hash)}</span></a></li>`;
  }).join('');

  return {
    readAt: readTime(d.takenAt),
    takenAt: d.takenAt,
    'p.float': near(p.floatFree),
    'p.cap': near(p.floatCap),
    'p.floatPct': pct(ratio(p.floatFree, p.floatCap)),
    'p.nozzle': int(nozzle.dueValue),
    'p.nozzleMax': int(threshold(nozzle)),
    'p.nozzleNote': nozzleOv ? 'Nozzle time · demo threshold' : 'Nozzle time',
    'p.task': open ? `Task #${open.openTask} open` : 'No open task',
    'p.taskNote': open ? (RULE_NAME[open.id] ?? open.id) : 'Upkeep',
    'p.account': p.account,
    'p.name': p.name,
    'p.price': near(d.printerProfile.price),
    'p.deposit': near(d.printerProfile.deposit, 0),
    'p.slot': String(d.printerProfile.slotMinutes),
    'p.rules': p.rules.map((r) => ruleRow(d, p, r)).join(''),
    'p.floatGauge': gauge(ratio(p.floatFree, p.floatCap), `Float ${near(p.floatFree)} of ${near(p.floatCap)} NEAR`),
    'p.inService': p.inService ? 'In service' : 'Out of service',
    lineup: lineup.map(tile).join(''),
    swept: near(swept),
    sweptDaos: String(daos),
    'earn.count': String(earnedTask?.rewardRights ?? d.earned.rights.length),
    'earn.by': nameOf(earnedTask?.claimer ?? d.earned.by),
    'earn.verifier': nameOf(earnedTask?.verifier ?? ''),
    'earn.task': earnedTask ? `#${earnedTask.id}` : '',
    'earn.rule': RULE_NAME[earnedTask?.rule ?? ''] ?? '',
    'earn.tx': d.earned.tx,
    'earn.txShort': short(d.earned.tx),
    'earn.validity': String(d.printerProfile.validityDays),
    'earn.group': d.printerProfile.group,
    refused: refusedRows,
    codeHash: short(p.codeHash),
  };
}

export function fill(html: string, d: CkData): string {
  const s = slots(d);
  return html.replace(/\{\{([\w.]+)\}\}/g, (_, k: string) => {
    if (!(k in s)) throw new Error(`unknown slot ${k}`);
    return s[k]!;
  });
}
