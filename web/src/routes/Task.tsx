import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAssetSnapshot, useDemoThresholds, useDeployment } from '../data/hooks';
import { useDataSource } from '../data/source';
import { CardTile } from '../components/CardTile';
import { Mark, SimulatedBadge } from '../components/Badges';
import { taskTone } from '../components/TaskRow';
import { Empty, LoadError, Loading, Section } from '../components/Section';
import { WalletGate } from '../components/WalletGate';
import { Account, TxLink } from '../components/TxLink';
import { useDemoLink } from '../demo/demo';
import { rewardStateLabel } from '../lib/enums';
import { ruleProgress } from '../lib/metrics';
import { RuleThreshold } from '../components/DemoThreshold';
import { formatNear, parseNear, toYocto } from '../lib/near';
import { KindChip } from '../components/UpkeepKind';
import type { ExpenseState } from '../data/types';
import { formatDateTime } from '../lib/time';
import { NotFoundPage } from './NotFound';
import { Near } from '../components/Near';
import { displayRationale } from '../lib/cast';
import { useWallet } from '../wallet/wallet';
import { useContractAction } from '../wallet/useContractAction';
import { useToast } from '../components/Toast';

function expenseLabel(e: ExpenseState): string {
  if (typeof e !== 'string') return `escalated to the DAO (#${e.Escalated.escalation_id})`;
  return { None: 'awaiting approval', Reserved: 'reserved from float', NeedsEscalation: 'needs a DAO proposal', Paid: 'paid', Denied: 'denied' }[e];
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** `/t/:assetId/:taskId` — why the machine asked, who did it, who checked it, what was earned. */
export function TaskPage() {
  const { assetId = '', taskId = '' } = useParams();
  const ds = useDataSource();
  const dep = useDeployment();
  const q = useAssetSnapshot(assetId);
  const link = useDemoLink();
  const wallet = useWallet();
  const action = useContractAction();
  const toast = useToast();
  const [hash, setHash] = useState<string | null>(null);
  const [receiptHash, setReceiptHash] = useState<string | null>(null);
  const [expense, setExpense] = useState('0');
  const roles = useQuery({
    queryKey: ['task-roles', ds.kind, assetId, wallet.accountId],
    enabled: !!wallet.accountId,
    queryFn: () => ds.asset(assetId).get_roles(wallet.accountId!),
  });
  const task = q.data?.tasks.find((t) => t.id === taskId);
  const demo = useDemoThresholds(assetId, q.data?.rules ?? []);
  const cards = useQuery({
    queryKey: ['task-cards', ds.kind, assetId, taskId],
    enabled: !!task?.claimer && !!q.data,
    queryFn: async () => {
      const cards = await ds.commons(q.data?.wiring.commons_id ?? '').get_cards_for_owner(task?.claimer ?? '');
      return cards.filter((c) => task?.minted_right_ids.includes(c.token_id));
    },
  });

  if (q.error) return <LoadError error={q.error} />;
  if (!q.data) return <Loading what="the task" />;
  if (!task) return <NotFoundPage what={`task #${taskId}`} />;
  const s = q.data;
  const rule = s.profile.rules.find((r) => r.rule_id === task.rule_id);
  const status = s.rules.find((r) => r.rule_id === task.rule_id);
  // D-022: every testnet asset is simulated (emulated device or simulator).
  const sim = s.profile.adapter === 'simulator' || !!dep.data?.assets.find((a) => a.asset_id === assetId)?.simulated;
  const progress = status ? ruleProgress(status) : null;
  const alias = dep.data?.assets.find((a) => a.asset_id === assetId)?.alias ?? assetId;
  const isOperator = wallet.accountId === s.wiring.agent_id || wallet.accountId === s.wiring.bridge_id;
  const independent = !!wallet.accountId && wallet.accountId !== task.claimer && !isOperator;
  const canVerify = independent && roles.data?.includes('verifier') && task.status === 'Submitted' && !task.verifier;
  const canCouncil = independent && roles.data?.includes('council') && task.status === 'Submitted'
    && !!task.verifier && task.verifier !== wallet.accountId && task.needs_council;
  const testPassed = !task.requires_verification_test || !!task.verification?.passed;
  let expenseYocto = 0n;
  let expenseProblem: string | null = null;
  try {
    expenseYocto = parseNear(expense);
    if (expenseYocto < 0n || expenseYocto > toYocto(task.reimbursable_max)) expenseProblem = 'Expense must be within the task reimbursement cap.';
    else if (expenseYocto > 0n && !receiptHash) expenseProblem = 'Attach a receipt for this expense.';
  } catch { expenseProblem = 'Enter an expense in NEAR, for example 0.25.'; }
  const send = (methodName: string, args: Record<string, unknown> = { task_id: task.id }) => {
    if (!action.isPending) action.mutate({ receiverId: assetId, methodName, args, deposit: 0n });
  };
  const reimbursable = (task.kind === 'Restock' || task.kind === 'Repair') && toYocto(task.reimbursable_max) > 0n;

  const timeline: [string, boolean, ReactNode][] = [
    ['Opened by the agent', true, <><Account id={task.opened_by} /> · {formatDateTime(task.created_at)}</>],
    ['Claimed', !!task.claimer, task.claimer ? <><Account id={task.claimer} />{task.claimed_at && ` · ${formatDateTime(task.claimed_at)}`}</> : 'waiting for a member'],
    ['Evidence submitted', !!task.evidence_hash, task.evidence_hash ? <span className="font-mono text-xs break-all">sha256 {task.evidence_hash}</span> : 'photo hash, computed in the browser'],
    ...(task.receipt_hash ? [['Receipt attached', true, <span key="r" className="font-mono text-xs break-all">sha256 {task.receipt_hash}</span>] as [string, boolean, ReactNode]] : []),
    ['Verification test', !!task.verification, rule?.requires_verification_test ? (task.verification ? `${task.verification.passed ? 'passed' : 'failed'} · bridge report` : 'bridge runs it after submission') : 'not required by this rule'],
    ['Approved by an independent verifier', !!task.verifier, task.verifier ? <Account id={task.verifier} /> : 'verifier ≠ claimer, agent or bridge'],
    ...(task.needs_council || task.council_approver ? [['Council second approval', !!task.council_approver, task.council_approver ? <Account id={task.council_approver} /> : 'needed'] as [string, boolean, ReactNode]] : []),
    ['Rewarded', task.status === 'Rewarded', rewardStateLabel(task.reward_state)],
  ];

  return (
    <div className="space-y-16">
      <div>
        <Link to={link(`/a/${assetId}`)} className="text-sm text-text-3 no-underline hover:text-accent">
          ← {s.meta.display_name}
        </Link>
        <p className="mt-4 flex flex-wrap items-center gap-x-3 text-sm text-text-3">
          <KindChip kind={task.kind} />
          <span className="num">task #{task.id} · {alias}</span>
        </p>
        <h1 className="display mt-2 text-[34px] sm:text-[44px]">{rule?.title ?? task.rule_id}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          <Mark tone={taskTone[task.status]}>{task.status}</Mark>
          {sim && <SimulatedBadge />}
        </div>
      </div>

      <figure className="border-l-2 border-due-fill pl-5 sm:pl-6">
        <figcaption className="text-sm text-text-3">Why the machine asked</figcaption>
        <blockquote className="mt-2 max-w-3xl text-lg leading-snug tracking-tight sm:text-[22px]">{displayRationale(task.rationale)}</blockquote>
        <details className="group mt-2">
          <summary className="cursor-pointer list-none text-xs text-text-3 hover:text-accent [&::-webkit-details-marker]:hidden">
            On-chain rationale <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span>
          </summary>
          <p data-raw className="mt-1.5 max-w-3xl rounded-sm bg-bg-alt px-3 py-2 font-mono text-xs break-words text-text-2">{task.rationale}</p>
        </details>
        <p className="mt-3">
          <TxLink hash={ds.rowTx(`task-${alias}-${task.id}`)} label="task_opened tx" />
        </p>
      </figure>

      <div className="grid grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-10">
        <Section title="Rule facts" note="Why it was due">
          <dl className="ck-rows text-sm">
            <div>
              <dt>Trigger</dt>
              <dd><RuleThreshold trigger={task.trigger} demo={demo.get(task.rule_id)} /></dd>
            </div>
            <div>
              <dt>Due value at open</dt>
              <dd className="num">{progress ? progress.format(BigInt(task.due_value_at_open)) : String(task.due_value_at_open)}</dd>
            </div>
            <div>
              <dt>Opened</dt>
              <dd>{task.manual ? 'Manually by the council (due check bypassed, recorded)' : 'By the agent, due check passed'}</dd>
            </div>
            <div>
              <dt>Reward</dt>
              <dd>
                {task.reward_rights} usage right(s) in <span className="font-mono text-xs">{s.profile.group_id}</span>
                {rule && toYocto(rule.reimbursable_max) > 0n && <span className="block text-xs font-normal text-text-3">Documented expense reimbursable up to {formatNear(rule.reimbursable_max)} NEAR</span>}
              </dd>
            </div>
          </dl>
          {toYocto(task.expense) > 0n && (
            <div className="rounded-md bg-bg-alt p-4 text-sm">
              <p className="text-text-3">Expense claimed</p>
              <p className="num mt-1 font-semibold">
                <Near value={task.expense} /> <span className="font-normal text-text-3">· {expenseLabel(task.expense_state)}</span>
              </p>
              {task.receipt_hash && <p className="mono-id mt-1 break-all">receipt sha256 {task.receipt_hash}</p>}
              <p className="mt-2 text-xs text-text-3">Paid from the float only, never from deposits; above the cash cap it goes through a DAO proposal.</p>
            </div>
          )}
        </Section>
        <Section title="Progress" note="No one approves their own work">
          <ol className="relative space-y-5 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-line">
            {timeline.map(([label, done, detail]) => (
              <li key={label} className="relative flex gap-4">
                <span aria-hidden className={`relative mt-1.5 size-[11px] shrink-0 rounded-full ${done ? 'bg-accent' : 'border border-line-strong bg-surface'}`} />
                <div className="min-w-0">
                  <p className={done ? 'font-medium' : 'text-text-3'}>{label}</p>
                  <p className="mt-0.5 text-sm text-text-3">{detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      {task.minted_right_ids.length > 0 && (
        <Section title="Cards earned" note="Non-transferable. Nobody can take them back.">
          {cards.isLoading && <Loading what="cards" />}
          {cards.data?.length === 0 && <Empty>The minted cards are no longer listed for this member.</Empty>}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {(cards.data ?? []).map((c) => (
              <CardTile key={c.token_id} card={c} simulated={sim} />
            ))}
          </div>
        </Section>
      )}

      {action.data && <p role="status" className="text-sm">Transaction confirmed. <TxLink hash={action.data.txHash} label="View task transaction" /></p>}

      {(canVerify || canCouncil) && (
        <Section title="Approve this work" note="Independent approval is enforced on chain">
          {!testPassed && <p className="text-sm text-text-3">Waiting for a passed bridge verification test.</p>}
          <button type="button" className="ck-btn" disabled={action.isPending || !testPassed} onClick={() => send(canCouncil ? 'council_approve_task' : 'approve_task')}>
            {action.isPending ? 'Confirming approval…' : canCouncil ? 'Give council approval' : 'Approve task'}
          </button>
        </Section>
      )}

      {['Open', 'Claimed'].includes(task.status) && (
        <Section title="Do this task" note="Claim, attach evidence, submit">
          <div className="ck-card space-y-5 p-5 text-sm sm:p-6">
            {task.status === 'Claimed' && task.claimer === wallet.accountId && <>
            <label className="block">
              <span className="font-medium">Evidence photo</span>
              <span className="mt-0.5 block text-text-3">Only its SHA-256 goes on-chain. The photo never leaves this device.</span>
              <input
                type="file"
                accept="image/*"
                className="mt-3 block w-full text-sm text-text-2 file:mr-3 file:rounded-full file:border-0 file:bg-bg-alt file:px-4 file:py-2 file:text-sm file:font-medium file:text-text"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setHash(null);
                  if (f) void sha256Hex(f).then(setHash).catch(toast.showError);
                }}
              />
            </label>
            {hash && <p className="mono-id break-all">sha256 {hash}</p>}
            {reimbursable && <>
              <label className="block">Expense in NEAR (up to {formatNear(task.reimbursable_max)})
                <input className="field mt-2 block w-full" inputMode="decimal" value={expense} onChange={(e) => setExpense(e.target.value)} />
              </label>
              <label className="block">Receipt (photo or PDF; only its hash goes on chain)
                <input type="file" accept="image/*,application/pdf" className="mt-2 block w-full" onChange={(e) => {
                  setReceiptHash(null);
                  const f = e.target.files?.[0];
                  if (f) void sha256Hex(f).then(setReceiptHash).catch(toast.showError);
                }} />
              </label>
              {expenseProblem && <p role="alert">{expenseProblem}</p>}
            </>}
            </>}
            <WalletGate action="Claiming and submitting a task">
              {task.status === 'Open' ? (
                <button type="button" className="ck-btn" disabled={action.isPending || isOperator} onClick={() => send('claim_task')}>
                  {action.isPending ? 'Confirming claim…' : 'Claim'}
                </button>
              ) : task.claimer === wallet.accountId ? (
                <button type="button" className="ck-btn" disabled={action.isPending || !hash || !!expenseProblem} onClick={() => {
                  if (!hash || expenseProblem) return;
                  send('submit_task', { task_id: task.id, evidence_hash: hash, evidence_uri: null, expense: expenseYocto.toString(), receipt_hash: expenseYocto > 0n ? receiptHash : null });
                }}>
                  {action.isPending ? 'Confirming submission…' : 'Submit evidence'}
                </button>
              ) : <p>This task has been claimed by another member.</p>}
            </WalletGate>
          </div>
        </Section>
      )}
    </div>
  );
}
