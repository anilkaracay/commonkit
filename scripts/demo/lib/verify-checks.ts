/**
 * TEST_PLAN §6 checks 6–11, read-only and keyless (views + evidence files only). Written for
 * scripts/verify.ts to import (`runEvidenceChecks`); step 21 runs them too while verify.ts does not
 * have them yet. Every check yields ✅/❌ lines with the evidence it looked at.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { yoctoToNear } from '@commonkit/sdk';

export interface CheckLine {
  check: number;
  ok: boolean;
  /** `info` lines never fail the run (e.g. an out-of-service period still open). */
  info?: boolean;
  text: string;
}

export interface ViewFn {
  <T>(contract: string, method: string, args?: object): Promise<T>;
}

interface Op { id: string; kind: string; amount: string; ref_id: string | null; status: string; to: string }
interface Task { id: string; rule_id: string; kind: string; status: string; claimer: string | null; minted_right_ids: string[]; receipt_hash: string | null }
interface Esc { id: string; proposal_id: string | null; status: string }
interface Period { seq: string; started_at: string; ended_by: { RepairRewarded?: { task_id: string }; Council?: { account: string } } | null }
interface Card { token_id: string; owner_id: string; kind: { type: string; source?: { type: string; asset?: string; task_id?: string; training_id?: string } } }

/** Page through a view. Asset views take `from_index` as U64 (string); commons views as u64 (number). */
async function all<T>(view: ViewFn, id: string, method: string, numeric = false, page = 100): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const chunk = await view<T[]>(id, method, { from_index: numeric ? from : String(from), limit: page });
    out.push(...chunk);
    if (chunk.length < page) return out;
  }
}

export async function runEvidenceChecks(
  view: ViewFn,
  d: { communities: Record<string, { dao_id: string; commons_id: string; assets: string[] }> },
  evidenceDir: string,
  totalSteps = 21,
): Promise<CheckLine[]> {
  const L: CheckLine[] = [];
  const push = (check: number, ok: boolean, text: string, info = false) => L.push({ check, ok, text, ...(info ? { info } : {}) });

  for (const c of Object.values(d.communities)) {
    const roles = await all<{ account_id: string; roles: string[] }>(view, c.commons_id, 'get_all_roles', true);
    const council = new Set(roles.filter((r) => r.roles.includes('council')).map((r) => r.account_id));
    const tokens: Card[] = [];
    for (let from = 0; ; from += 50) {
      const chunk = await view<{ token_id: string }[]>(c.commons_id, 'nft_tokens', { from_index: String(from), limit: 50 });
      for (const t of chunk) {
        const card = await view<Card | null>(c.commons_id, 'get_card', { token_id: t.token_id });
        if (card) tokens.push(card);
      }
      if (chunk.length < 50) break;
    }
    const tasksByAsset = new Map<string, Task[]>();

    for (const asset of c.assets) {
      const name = asset.split('.')[0];
      const [ledger, ops, tasks, escs, log, service, profile] = await Promise.all([
        view<{ total_swept: string }>(asset, 'get_ledger'),
        all<Op>(view, asset, 'get_ops'),
        all<Task>(view, asset, 'get_tasks'),
        all<Esc>(view, asset, 'get_escalations'),
        all<Period>(view, asset, 'get_service_log'),
        view<{ in_service: boolean }>(asset, 'get_service_status'),
        view<{ rules: { rule_id: string; reimbursable_max: string }[] }>(asset, 'get_profile'),
      ]);
      tasksByAsset.set(asset, tasks);

      // 6. total_swept = Σ succeeded Sweep ops to the DAO.
      const swept = ops.filter((o) => o.kind === 'Sweep' && o.status === 'Succeeded');
      const sum = swept.reduce((s, o) => s + BigInt(o.amount), 0n);
      push(6, sum === BigInt(ledger.total_swept) && swept.every((o) => o.to === c.dao_id), `${name} total_swept ${yoctoToNear(ledger.total_swept)} NEAR = ${swept.length} Sweep op(s) to ${c.dao_id} (${yoctoToNear(sum)} NEAR)`);

      // 7 (asset side). Every Rewarded task's minted ids exist, owned by the claimer, sourced from it.
      for (const t of tasks.filter((x) => x.status === 'Rewarded')) {
        const cards = t.minted_right_ids.map((id) => tokens.find((k) => k.token_id === id));
        const ok = cards.every((k) => k && k.owner_id === t.claimer && k.kind.source?.type === 'Maintenance' && k.kind.source.asset === asset && k.kind.source.task_id === t.id);
        push(7, ok, `${name} task #${t.id} Rewarded → ${t.minted_right_ids.join(', ') || 'no rights'} owned by ${t.claimer?.split('.')[0]}`);
      }

      // 8. Every escalation with a proposal id resolves in the DAO.
      for (const e of escs.filter((x) => x.proposal_id !== null)) {
        const p = await view<{ status: string } | null>(c.dao_id, 'get_proposal', { id: Number(e.proposal_id) }).catch(() => null);
        push(8, p !== null, `${name} escalation #${e.id} → ${c.dao_id}#${e.proposal_id} ${p?.status ?? 'NOT FOUND'} (asset: ${e.status})`);
      }

      // 9. Reimbursements: capped by the rule, only for Restock/Repair tasks with a receipt.
      for (const o of ops.filter((x) => x.kind === 'Reimbursement')) {
        const t = tasks.find((x) => x.id === o.ref_id);
        const max = profile.rules.find((r) => r.rule_id === t?.rule_id)?.reimbursable_max;
        const ok = !!t && ['Restock', 'Repair'].includes(t.kind) && !!t.receipt_hash && max !== undefined && BigInt(o.amount) <= BigInt(max);
        push(9, ok, `${name} Reimbursement op #${o.id} ${yoctoToNear(o.amount)} NEAR for task #${o.ref_id} (${t?.kind}, rule max ${max ? yoctoToNear(max) : '?'} NEAR, receipt ${t?.receipt_hash ? 'yes' : 'no'})`);
      }

      // 10. Out-of-service periods: closed by a Rewarded Repair task or a council member / the DAO.
      for (const p of log) {
        if (!p.ended_by) {
          push(10, !service.in_service, `${name} out-of-service period #${p.seq} open since ${new Date(Number(BigInt(p.started_at) / 1_000_000n)).toISOString()}`, true);
          continue;
        }
        const r = p.ended_by.RepairRewarded;
        if (r) {
          const t = tasks.find((x) => x.id === r.task_id);
          push(10, t?.status === 'Rewarded' && t.kind === 'Repair', `${name} period #${p.seq} closed by Rewarded Repair task #${r.task_id}`);
        } else {
          const acct = p.ended_by.Council?.account ?? '';
          push(10, acct === c.dao_id || council.has(acct), `${name} period #${p.seq} closed by ${acct}`);
        }
      }
    }

    // 7 (commons side). Every usage right's source exists and is Rewarded (or an Approved training); no duplicates.
    const seen = new Set<string>();
    for (const k of tokens.filter((x) => x.kind.type === 'UsageRight')) {
      const s = k.kind.source;
      let ok = !seen.has(k.token_id);
      seen.add(k.token_id);
      let what = '';
      if (s?.type === 'Maintenance') {
        const t = tasksByAsset.get(s.asset ?? '')?.find((x) => x.id === s.task_id);
        ok &&= t?.status === 'Rewarded' && t.minted_right_ids.includes(k.token_id);
        what = `task ${s.asset?.split('.')[0]}#${s.task_id} ${t?.status ?? 'missing'}`;
      } else if (s?.type === 'Training') {
        const tr = await view<{ status: string; minted: string[] } | null>(c.commons_id, 'get_training', { training_id: s.training_id });
        ok &&= tr?.status === 'Approved' && tr.minted.includes(k.token_id);
        what = `training #${s.training_id} ${tr?.status ?? 'missing'}`;
      } else ok = false;
      push(7, ok, `${c.commons_id.split('.')[1]} ${k.token_id} ← ${what}`);
    }
  }

  // 11. evidence/steps.json: every judge step passed, with tx hashes or a stated reason.
  const path = join(evidenceDir, 'steps.json');
  const steps = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as { step: number; status?: string; txHashes: string[]; no_tx_reason?: string }[]) : [];
  for (let n = 1; n <= totalSteps; n++) {
    const s = steps.find((x) => x.step === n);
    const ok = !!s && s.status !== 'failed' && (s.txHashes.length > 0 || !!s.no_tx_reason);
    push(11, ok || n === totalSteps, `evidence step ${n}: ${s ? `${s.status ?? 'recorded'}, ${s.txHashes.length} tx${s.no_tx_reason ? ` (${s.no_tx_reason})` : ''}` : 'missing'}`, n === totalSteps && !s);
  }
  return L;
}
