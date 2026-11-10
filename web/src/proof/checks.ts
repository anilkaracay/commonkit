/**
 * The eleven checks of scripts/verify.sh (docs/TEST_PLAN.md §6), computed live in the browser
 * from the same sources. Order, numbering and pass/fail rules stay one-to-one with verify.sh.
 */
import type { DataSource } from '../data/source';
import type { Card, Task } from '../data/types';
import { formatNearUnit, toYocto } from '../lib/near';
import { formatDateTime } from '../lib/time';
import { JUDGE_FLOW_STEPS as EXPECTED_STEPS } from '../demo/flow';

export type CheckStatus = 'pass' | 'fail' | 'warn';

export interface ProofItem {
  label: string;
  value: string;
  ok: boolean;
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
  items.length === 0 ? (warnIfEmpty ? 'warn' : 'pass') : items.every((i) => i.ok) ? 'pass' : 'fail';


export async function runProofChecks(ds: DataSource): Promise<ProofCheck[]> {
  const dep = await ds.getDeployment();
  const checks: ProofCheck[] = [];

  // 1. keyless
  const keyItems = await Promise.all(
    dep.keyless_accounts.map(async ({ account_id: id, keyless }): Promise<ProofItem> => {
      const keys = await ds.viewAccessKeyList(id);
      const value =
        keys.length === 0 ? 'no access keys' : `${keys.length} access key(s)${keyless === 'pending' ? ' · key deletion pending' : ''}`;
      return { label: id, value, ok: keys.length === 0, account: id };
    }),
  );
  checks.push({ id: 1, title: 'Asset and commons accounts are keyless', status: statusOf(keyItems), summary: `${keyItems.filter((i) => i.ok).length}/${keyItems.length} accounts have an empty access key list`, items: keyItems });

  // 2 & 3. same code hash
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
      status = 'warn';
      summary += ' = hash recorded at deployment; the build is not reproducible, so it is not compared with a rebuilt wasm';
    } else if (allSame) {
      summary += ' = reproducible build';
    }
    return { id, title, status, summary, items };
  };
  checks.push(await hashCheck(2, 'All assets run the same code', dep.assets.map((a) => a.asset_id), dep.code.asset));
  checks.push(await hashCheck(3, 'All commons run the same code', dep.communities.map((c) => c.commons_id), dep.code.commons));

  // 4. DAO created by the factory
  const daoList = new Set(await ds.getDaoList(dep.sputnik_factory));
  const wirings = await Promise.all(dep.assets.map((a) => ds.asset(a.asset_id).get_wiring()));
  const daoItems: ProofItem[] = dep.assets.map((a, i) => {
    const dao = wirings[i]?.dao_id ?? '';
    return { label: a.asset_id, value: `dao ${dao}`, ok: daoList.has(dao), account: dao };
  });
  checks.push({ id: 4, title: `Each asset is governed by a ${dep.sputnik_factory} DAO`, status: statusOf(daoItems), summary: `${daoItems.filter((i) => i.ok).length}/${daoItems.length} DAO ids found in get_dao_list`, items: daoItems });

  // 5. ledgers
  const assetData = await Promise.all(
    dep.assets.map(async (a) => {
      const v = ds.asset(a.asset_id);
      const [ledger, profile, ops, tasks, escalations, serviceLog] = await Promise.all([
        v.get_ledger(),
        v.get_profile(),
        v.get_ops(0, 1000),
        v.get_tasks(0, 1000),
        v.get_escalations(0, 1000),
        v.get_service_log(0, 1000),
      ]);
      return { a, ledger, profile, ops, tasks, escalations, serviceLog };
    }),
  );
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
  checks.push({ id: 5, title: 'Ledgers cover every obligation', status: statusOf(ledgerItems), summary: 'balance ≥ storage reserve + float + deposits + reserved rewards + pending; float never above cap', items: ledgerItems });

  // 6. swept totals vs sweep transfers (best effort, like verify.sh)
  const sweepItems: ProofItem[] = assetData.map(({ a, ledger, ops }) => {
    const sent = ops.filter((o) => o.kind === 'Sweep' && o.status === 'Succeeded').reduce((s, o) => s + toYocto(o.amount), 0n);
    return { label: `${a.alias} total_swept`, value: `${formatNearUnit(ledger.total_swept)} = ${formatNearUnit(sent)} in sweep transfers`, ok: sent === toYocto(ledger.total_swept), account: a.asset_id };
  });
  checks.push({ id: 6, title: 'Swept totals match sweep transfers', status: statusOf(sweepItems), summary: 'total_swept equals the succeeded Sweep transfers to the DAO (best effort)', items: sweepItems });

  // 7. rights ↔ tasks
  const rightsItems: ProofItem[] = [];
  for (const c of dep.communities) {
    const cv = ds.commons(c.commons_id);
    const tokens = await cv.nft_tokens(0, 100);
    const owners = [...new Set(tokens.map((t) => t.owner_id))];
    const cards: Card[] = (await Promise.all(owners.map((o) => cv.get_cards_for_owner(o)))).flat();
    const byId = new Map(cards.map((card) => [card.token_id, card]));
    const tasksByAsset = new Map<string, Task[]>(assetData.filter((d) => d.a.community === c.slug).map((d) => [d.a.asset_id, d.tasks]));
    const seen = new Set<string>();
    for (const card of cards) {
      if (card.kind.type !== 'UsageRight') continue;
      const src = card.kind.source;
      if (src.type !== 'Maintenance') continue;
      const task = tasksByAsset.get(src.asset)?.find((t) => t.id === src.task_id);
      const ok = !!task && task.status === 'Rewarded' && task.minted_right_ids.includes(card.token_id);
      rightsItems.push({ label: `${c.slug} ${card.token_id}`, value: task ? `task #${task.id} ${task.status}` : 'source task missing', ok });
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
  checks.push({ id: 7, title: 'Every right comes from a rewarded task', status: statusOf(rightsItems), summary: 'no orphan right, no duplicate, owner = task claimer', items: rightsItems });

  // 8. escalations resolve to DAO proposals
  const escItems: ProofItem[] = [];
  for (const [i, { a, escalations }] of assetData.entries()) {
    const dao = wirings[i]?.dao_id ?? '';
    for (const e of escalations.filter((x) => x.proposal_id !== null)) {
      const p = await ds.dao(dao).get_proposal(Number(e.proposal_id));
      escItems.push({ label: `${a.alias} escalation #${e.id}`, value: p ? `proposal #${p.id} ${p.status}` : `proposal #${e.proposal_id} not found`, ok: !!p, account: dao });
    }
  }
  checks.push({ id: 8, title: 'Every escalation is a real DAO proposal', status: statusOf(escItems), summary: `${escItems.filter((i) => i.ok).length}/${escItems.length} proposals resolve via get_proposal`, items: escItems });

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
  checks.push({ id: 9, title: 'Reimbursements stay within their caps', status: statusOf(reimbItems), summary: `${reimbItems.length} Reimbursement op(s), each on a Restock/Repair task with a receipt and ≤ reimbursable_max`, items: reimbItems });

  // 10. out-of-service periods (D-017)
  const oosItems: ProofItem[] = [];
  for (const { a, tasks, serviceLog } of assetData) {
    const service = await ds.asset(a.asset_id).get_service_status();
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
  checks.push({ id: 10, title: 'Every out-of-service period ended properly', status: statusOf(oosItems), summary: 'closed only by a rewarded Repair task or a council member', items: oosItems });

  // 9. evidence
  const steps = await ds.getEvidenceSteps();
  const stepItems: ProofItem[] = Array.from({ length: EXPECTED_STEPS }, (_, i) => {
    const s = steps.find((x) => x.step === i + 1);
    const tx = s?.txHashes[0];
    return { label: `step ${i + 1}${s ? ` · ${s.title}` : ''}`, value: s ? `${s.txHashes.length} tx` : 'missing', ok: !!s && s.txHashes.length > 0, ...(tx ? { tx } : {}) };
  });
  checks.push({ id: 11, title: `Evidence has ${EXPECTED_STEPS} steps with tx hashes`, status: statusOf(stepItems), summary: `${stepItems.filter((i) => i.ok).length}/${EXPECTED_STEPS} steps recorded`, items: stepItems });

  return checks;
}
