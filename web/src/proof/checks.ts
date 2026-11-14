/**
 * The eleven checks of scripts/verify.sh (docs/TEST_PLAN.md §6), computed live in the browser
 * from the same sources. Order, numbering and pass/fail rules stay one-to-one with verify.sh.
 */
import type { DataSource } from '../data/source';
import type { EvidenceStep } from '../data/offchain';
import type { Task } from '../data/types';
import { formatNearUnit, toYocto } from '../lib/near';
import { formatDateTime } from '../lib/time';
import { JUDGE_FLOW_STEPS as EXPECTED_STEPS } from '../demo/flow';
import { castText } from '../lib/cast';

export type CheckStatus = 'pass' | 'fail' | 'warn';

export interface ProofItem {
  label: string;
  value: string;
  ok: boolean;
  /** Information only, like verify.sh's ℹ️ lines: never fails the check. */
  info?: boolean;
  /** Account or tx to open in the explorer. */
  account?: string;
  tx?: string;
}

export interface ProofCheck {
  id: number;
  title: string;
  status: CheckStatus;
  summary: string;
  items: ProofItem[];
}

const statusOf = (items: ProofItem[], warnIfEmpty = false): CheckStatus =>
  items.length === 0 ? (warnIfEmpty ? 'warn' : 'pass') : items.every((i) => i.ok || i.info) ? 'pass' : 'fail';

export const PROOF_CHECKS = [
  { id: 1, title: 'Asset and commons accounts are keyless' },
  { id: 2, title: 'All assets run the same code' },
  { id: 3, title: 'All commons run the same code' },
  { id: 4, title: 'Each asset is governed by a Sputnik DAO' },
  { id: 5, title: 'Ledgers cover every obligation' },
  { id: 6, title: 'Swept totals match sweep transfers' },
  { id: 7, title: 'Every usage right traces to a rewarded task or an approved training' },
  { id: 8, title: 'Every escalation is a real DAO proposal' },
  { id: 9, title: 'Reimbursements stay within their caps' },
  { id: 10, title: 'Every out-of-service period ended properly' },
  { id: 11, title: 'Every judge step is in the evidence' },
] as const;

/** Reports only completed checks. A snapshot is never used as a proof result. */
export async function runProofChecks(ds: DataSource, onCheck?: (check: ProofCheck) => void): Promise<ProofCheck[]> {
  const dep = await ds.getDeployment();
  const hashCheck = async (id: number, title: string, accounts: string[], rec: { code_hash: string; build: string }): Promise<ProofCheck> => {
    const expected = rec.code_hash || null;
    const states = await Promise.all(accounts.map((a) => ds.viewAccount(a)));
    const first = states[0]?.code_hash ?? '';
    const items: ProofItem[] = states.map((s, i) => ({
      label: accounts[i] as string,
      value: s.code_hash,
      ok: s.code_hash === first && (expected === null || s.code_hash === expected),
      account: accounts[i],
    }));
    const allSame = states.every((s) => s.code_hash === first);
    let status = statusOf(items);
    let summary = allSame ? `${accounts.length} accounts share code_hash ${first}` : 'code_hash differs between accounts';
    if (allSame && expected === null) {
      status = 'warn';
      summary += '; no build hash recorded, so it is printed but not compared';
    } else if (allSame && first !== expected) {
      summary += ` ≠ recorded ${expected}`;
    } else if (allSame && rec.build !== 'reproducible') {
      // verify.sh: ✅ matches the deployments record, ℹ️ for the local and Docker rebuilds.
      summary += ' = hash recorded at deployment';
      items.push({
        label: 'build',
        value: `${rec.build} build: compared with the deployments record; verify.sh also prints the local and Docker reproducible rebuilds as information`,
        ok: true,
        info: true,
      });
    } else if (allSame) {
      summary += ' = reproducible build';
    }
    return { id, title, status, summary, items };
  };
  const jobs = [
    async (): Promise<ProofCheck> => {
      // 1. keyless
      const keyItems = await Promise.all(
        dep.keyless_accounts.map(async ({ account_id: id, keyless }): Promise<ProofItem> => {
          const keys = await ds.viewAccessKeyList(id);
          const value =
            keys.length === 0 ? 'no access keys' : `${keys.length} access key(s)${keyless === 'pending' ? ' · key deletion pending' : ''}`;
          return { label: id, value, ok: keys.length === 0, account: id };
        }),
      );
      return { id: 1, title: 'Asset and commons accounts are keyless', status: statusOf(keyItems), summary: `${keyItems.filter((i) => i.ok).length}/${keyItems.length} accounts have an empty access key list`, items: keyItems };
    },
    () => hashCheck(2, 'All assets run the same code', dep.assets.map((a) => a.asset_id), dep.code.asset),
    () => hashCheck(3, 'All commons run the same code', dep.communities.map((c) => c.commons_id), dep.code.commons),
    async (): Promise<ProofCheck> => {
      // 4. DAO created by the factory
      const [daoIds, wirings] = await Promise.all([ds.getDaoList(dep.sputnik_factory), Promise.all(dep.assets.map((a) => ds.asset(a.asset_id).get_wiring()))]);
      const daoList = new Set(daoIds);
      const daoItems: ProofItem[] = dep.assets.map((a, i) => {
        const dao = wirings[i]?.dao_id ?? '';
        return { label: a.asset_id, value: `dao ${dao}`, ok: daoList.has(dao), account: dao };
      });
      return { id: 4, title: `Each asset is governed by a ${dep.sputnik_factory} DAO`, status: statusOf(daoItems), summary: `${daoItems.filter((i) => i.ok).length}/${daoItems.length} DAO ids found in get_dao_list`, items: daoItems };
    },
    async (): Promise<ProofCheck> => {
      // 5. ledgers
      const assetData = await Promise.all(dep.assets.map(async (a) => {
        const v = ds.asset(a.asset_id);
        const [ledger, profile] = await Promise.all([v.get_ledger(), v.get_profile()]);
        return { a, ledger, profile };
      }));
      const ledgerItems: ProofItem[] = assetData.flatMap(({ a, ledger, profile }) => {
        const storageCost = toYocto(ledger.storage_usage) * toYocto(ledger.storage_byte_cost);
        const storageOk = storageCost * 10n <= toYocto(ledger.storage_reserve) * 8n;
        return [
          { label: `${a.alias} invariant_ok`, value: String(ledger.invariant_ok), ok: ledger.invariant_ok, account: a.asset_id },
          {
            label: `${a.alias} float ≤ cap`,
            value: `${formatNearUnit(ledger.float_free)} ≤ ${formatNearUnit(profile.float_cap)}`,
            ok: toYocto(ledger.float_free) <= toYocto(profile.float_cap),
            account: a.asset_id,
          },
          {
            label: `${a.alias} storage ≤ 80% of reserve`,
            value: `${formatNearUnit(storageCost)} of ${formatNearUnit(ledger.storage_reserve)}`,
            ok: storageOk,
            account: a.asset_id,
          },
        ];
      });
      return { id: 5, title: 'Ledgers cover every obligation', status: statusOf(ledgerItems), summary: 'balance ≥ storage reserve + float + deposits + reserved rewards + pending; float never above cap', items: ledgerItems };
    },
    async (): Promise<ProofCheck> => {
      const assetData = await Promise.all(dep.assets.map(async (a) => {
        const v = ds.asset(a.asset_id);
        const [ledger, ops] = await Promise.all([v.get_ledger(), v.get_ops(0, 1000)]);
        return { a, ledger, ops };
      }));
      // 6. swept totals vs sweep transfers (best effort, like verify.sh)
      const sweepItems: ProofItem[] = assetData.map(({ a, ledger, ops }) => {
        const sent = ops.filter((o) => o.kind === 'Sweep' && o.status === 'Succeeded').reduce((s, o) => s + toYocto(o.amount), 0n);
        return { label: `${a.alias} total_swept`, value: `${formatNearUnit(ledger.total_swept)} = ${formatNearUnit(sent)} in sweep transfers`, ok: sent === toYocto(ledger.total_swept), account: a.asset_id };
      });
      return { id: 6, title: 'Swept totals match sweep transfers', status: statusOf(sweepItems), summary: "each asset's total_swept equals the sum of its succeeded Sweep transfers (get_ops)", items: sweepItems };
    },
    async (): Promise<ProofCheck> => {
      const assetDataP = Promise.all(dep.assets.map(async (a) => {
        const v = ds.asset(a.asset_id);
        const [tasks] = await Promise.all([v.get_tasks(0, 1000)]);
        return { a, tasks };
      }));
      const commonsDataP = Promise.all(dep.communities.map(async (c) => {
        const cv = ds.commons(c.commons_id);
        const [cards, trainings] = await Promise.all([
          cv.nft_tokens(0, 100).then(async (tokens) => {
            const owners = [...new Set(tokens.map((t) => t.owner_id))];
            return (await Promise.all(owners.map((o) => cv.get_cards_for_owner(o)))).flat();
          }),
          cv.get_trainings(0, 1000),
        ]);
        return { c, cards, trainings };
      }));
      const [assetData, commonsData] = await Promise.all([assetDataP, commonsDataP]);
      // 7. rights ↔ tasks
      const rightsItems: ProofItem[] = [];
      for (const { c, cards, trainings } of commonsData) {
        const byId = new Map(cards.map((card) => [card.token_id, card]));
        const tasksByAsset = new Map<string, Task[]>(assetData.filter((d) => d.a.community === c.slug).map((d) => [d.a.asset_id, d.tasks]));
        const seen = new Set<string>();
        for (const card of cards) {
          if (card.kind.type !== 'UsageRight') continue;
          const src = card.kind.source;
          if (src.type === 'Maintenance') {
            const task = tasksByAsset.get(src.asset)?.find((t) => t.id === src.task_id);
            const ok = !!task && task.status === 'Rewarded' && task.minted_right_ids.includes(card.token_id);
            rightsItems.push({ label: `${c.slug} ${card.token_id}`, value: task ? `task #${task.id} ${task.status}` : 'source task missing', ok });
          } else {
            // Same rule as verify.sh: a training right must be minted by an Approved training.
            const tr = trainings.find((t) => t.id === src.training_id);
            const ok = !!tr && tr.status === 'Approved' && tr.minted.includes(card.token_id);
            rightsItems.push({ label: `${c.slug} ${card.token_id}`, value: tr ? `training #${tr.id} ${tr.status}` : 'source training missing', ok });
          }
        }
        for (const [assetId, tasks] of tasksByAsset) {
          for (const task of tasks.filter((t) => t.status === 'Rewarded')) {
            for (const tokenId of task.minted_right_ids) {
              const card = byId.get(tokenId);
              const dup = seen.has(`${c.slug}:${tokenId}`);
              seen.add(`${c.slug}:${tokenId}`);
              const ok = !!card && card.owner_id === task.claimer && !dup;
              rightsItems.push({ label: `${assetId.split('.')[0]} task #${task.id} → ${tokenId}`, value: card ? `owner ${card.owner_id}` : 'card missing', ok });
            }
          }
        }
      }
      return { id: 7, title: 'Every usage right traces to a rewarded task or an approved training', status: statusOf(rightsItems), summary: 'no orphan right, no duplicate; task rights are owned by the claimer', items: rightsItems };
    },
    async (): Promise<ProofCheck> => {
      const wirings = await Promise.all(dep.assets.map((a) => ds.asset(a.asset_id).get_wiring()));
      // 8. escalations resolve to DAO proposals
      const escItems = (await Promise.all(dep.assets.map(async (a, i) => {
        const dao = wirings[i]?.dao_id ?? '';
        const escalations = await ds.asset(a.asset_id).get_escalations(0, 1000);
        return Promise.all(escalations.filter((x) => x.proposal_id !== null).map(async (e): Promise<ProofItem> => {
          const p = await ds.dao(dao).get_proposal(Number(e.proposal_id));
          return { label: `${a.alias} escalation #${e.id}`, value: p ? `proposal #${p.id} ${p.status}` : `proposal #${e.proposal_id} not found`, ok: !!p, account: dao };
        }));
      }))).flat();
      return { id: 8, title: 'Every escalation is a real DAO proposal', status: statusOf(escItems), summary: `${escItems.filter((i) => i.ok).length}/${escItems.length} proposals resolve via get_proposal`, items: escItems };
    },
    async (): Promise<ProofCheck> => {
      const assetData = await Promise.all(dep.assets.map(async (a) => {
        const v = ds.asset(a.asset_id);
        const [profile, tasks, ops] = await Promise.all([v.get_profile(), v.get_tasks(0, 1000), v.get_ops(0, 1000)]);
        return { a, profile, tasks, ops };
      }));
      // 9. reimbursements (D-017): every Reimbursement op within its rule's cap, on a Restock/Repair task with a receipt
      const reimbItems: ProofItem[] = [];
      for (const { a, profile, tasks, ops } of assetData) {
        for (const op of ops.filter((o) => o.kind === 'Reimbursement')) {
          const t = tasks.find((x) => x.id === op.ref_id);
          const rule = t ? profile.rules.find((r) => r.rule_id === t.rule_id) : undefined;
          const cap = rule ? toYocto(rule.reimbursable_max) : 0n;
          const ok = !!t && (t.kind === 'Restock' || t.kind === 'Repair') && !!t.receipt_hash && toYocto(op.amount) <= cap;
          reimbItems.push({
            label: `${a.alias} op #${op.id} → task #${op.ref_id ?? '—'}${t ? ` (${t.kind})` : ''}`,
            value: `${formatNearUnit(op.amount)} ≤ reimbursable_max ${formatNearUnit(cap)}${t?.receipt_hash ? ' · receipt' : ' · no receipt'}`,
            ok,
            account: a.asset_id,
          });
        }
      }
      return { id: 9, title: 'Reimbursements stay within their caps', status: statusOf(reimbItems), summary: `${reimbItems.length} Reimbursement op(s), each on a Restock/Repair task with a receipt and ≤ reimbursable_max`, items: reimbItems };
    },
    async (): Promise<ProofCheck> => {
      const [wirings, assetData] = await Promise.all([
        Promise.all(dep.assets.map((a) => ds.asset(a.asset_id).get_wiring())),
        Promise.all(dep.assets.map(async (a) => {
          const v = ds.asset(a.asset_id);
          const [tasks, serviceLog, service] = await Promise.all([v.get_tasks(0, 1000), v.get_service_log(0, 1000), v.get_service_status()]);
          return { a, tasks, serviceLog, service };
        })),
      ]);
      // 10. out-of-service periods (D-017)
      const oosItems: ProofItem[] = [];
      for (const { a, tasks, serviceLog, service } of assetData) {
        for (const p of serviceLog) {
          if (!p.ended_by) {
            // An open period is not a failure, but it must match the live service status.
            oosItems.push({ label: `${a.alias} period #${p.seq}`, value: `open since ${formatDateTime(p.started_at)}`, ok: !service.in_service, account: a.asset_id });
            continue;
          }
          if ('RepairRewarded' in p.ended_by) {
            const tid = p.ended_by.RepairRewarded.task_id;
            const t = tasks.find((x) => x.id === tid);
            oosItems.push({ label: `${a.alias} period #${p.seq}`, value: `ended by repair task #${tid} ${t ? `${t.kind} ${t.status}` : 'missing'}`, ok: !!t && t.kind === 'Repair' && t.status === 'Rewarded', account: a.asset_id });
          } else {
            const who = p.ended_by.Council.account;
            const roles = await ds.asset(a.asset_id).get_roles(who);
            const isDao = who === wirings.find((_, i) => dep.assets[i]?.asset_id === a.asset_id)?.dao_id;
            oosItems.push({ label: `${a.alias} period #${p.seq}`, value: `ended by ${isDao ? 'the DAO' : `council member ${who}`}`, ok: isDao || roles.includes('council'), account: a.asset_id });
          }
        }
      }
      return { id: 10, title: 'Every out-of-service period ended properly', status: statusOf(oosItems), summary: 'closed only by a rewarded Repair task or a council member', items: oosItems };
    },
    async (): Promise<ProofCheck> => {
      const steps = await ds.getEvidenceSteps();
      // 11. evidence completeness, with the rules of scripts/demo/lib/verify-checks.ts: a step passes
      // when it did not fail and has tx hashes or a no_tx_reason. The on-chain re-read of one tx per
      // step runs in verify.sh, not in the browser.
      const stepItems: ProofItem[] = evidenceItems(steps, EXPECTED_STEPS);
      const counted = stepItems.filter((i) => !i.info);
      return {
        id: 11,
        title: 'Every judge step is in the evidence',
        status: statusOf(stepItems),
        summary: `${counted.filter((i) => i.ok).length}/${EXPECTED_STEPS} steps complete · evidence completeness; the on-chain re-check of each step runs in verify.sh`,
        items: stepItems,
      };
    },
  ];
  const results = await Promise.allSettled(jobs.map(async (job) => {
    const check = await job();
    onCheck?.(check);
    return check;
  }));
  const failure = results.find((r) => r.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
  return results.flatMap((r) => r.status === 'fulfilled' ? [r.value] : []);
}
/** Check 11 lines, one per judge step, mirroring verify-checks.ts (evidence-only mode). */
export function evidenceItems(steps: EvidenceStep[], total: number): ProofItem[] {
  return Array.from({ length: total }, (_, i) => {
    const n = i + 1;
    const s = steps.find((x) => x.step === n);
    if (!s) {
      // verify.sh: the last step (verify.sh itself) may be missing; that line is information only.
      return { label: `step ${n}`, value: 'missing in evidence/steps.json', ok: n === total, ...(n === total ? { info: true } : {}) };
    }
    const passed = s.status !== 'failed';
    const tx = s.txHashes[0];
    if (s.txHashes.length === 0) {
      return { label: `step ${n} · ${castText(s.title)}`, value: `no tx: ${s.no_tx_reason ?? 'no reason given'}`, ok: passed && !!s.no_tx_reason };
    }
    return { label: `step ${n} · ${castText(s.title)}`, value: `${s.txHashes.length} tx`, ok: passed, ...(tx ? { tx } : {}) };
  });
}
