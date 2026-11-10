import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAssetSnapshot, useDeployment } from '../data/hooks';
import { useDataSource } from '../data/source';
import { CardTile } from '../components/CardTile';
import { Mark, SimulatedBadge } from '../components/Badges';
import { taskTone } from '../components/TaskRow';
import { Empty, LoadError, Loading, Section } from '../components/Section';
import { WalletGate } from '../components/WalletGate';
import { Account, TxLink } from '../components/TxLink';
import { useDemoLink } from '../demo/demo';
import { rewardStateLabel } from '../lib/enums';
import { describeTrigger, ruleProgress } from '../lib/metrics';
import { formatNear, toYocto } from '../lib/near';
import { KindChip } from '../components/UpkeepKind';
import type { ExpenseState } from '../data/types';
import { formatDateTime } from '../lib/time';
import { NotFoundPage } from './NotFound';

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
  const [hash, setHash] = useState<string | null>(null);
  const task = q.data?.tasks.find((t) => t.id === taskId);
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
        <blockquote className="mt-2 max-w-3xl text-lg leading-snug tracking-tight sm:text-[22px]">{task.rationale}</blockquote>
        <p className="mt-3">
          <TxLink hash={ds.rowTx(`task-${alias}-${task.id}`)} label="task_opened tx" />
        </p>
      </figure>

      <div className="grid grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-10">
        <Section title="Rule facts" note="Why it was due">
          <dl className="ck-rows text-sm">
            <div>
              <dt>Trigger</dt>
              <dd className="num">{rule ? describeTrigger(rule.trigger) : task.rule_id}</dd>
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
                {formatNear(task.expense)} NEAR <span className="font-normal text-text-3">· {expenseLabel(task.expense_state)}</span>
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

      {['Open', 'Claimed'].includes(task.status) && (
        <Section title="Do this task" note="Claim, attach evidence, submit">
          <div className="ck-card space-y-5 p-5 text-sm sm:p-6">
            <label className="block">
              <span className="font-medium">Evidence photo</span>
              <span className="mt-0.5 block text-text-3">Only its SHA-256 goes on-chain. The photo never leaves this device.</span>
              <input
                type="file"
                accept="image/*"
                className="mt-3 block w-full text-sm text-text-2 file:mr-3 file:rounded-full file:border-0 file:bg-bg-alt file:px-4 file:py-2 file:text-sm file:font-medium file:text-text"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void sha256Hex(f).then(setHash);
                }}
              />
            </label>
            {hash && <p className="mono-id break-all">sha256 {hash}</p>}
            <WalletGate action="Claiming and submitting a task">
              <button type="button" className="ck-btn">
                {task.status === 'Open' ? 'Claim' : 'Submit evidence'}
              </button>
            </WalletGate>
          </div>
        </Section>
      )}
    </div>
  );
}
