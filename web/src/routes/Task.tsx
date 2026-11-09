import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAssetSnapshot, useDeployment } from '../data/hooks';
import { useDataSource } from '../data/source';
import { CardTile } from '../components/CardTile';
import { Pill, SimulatedBadge } from '../components/Badges';
import { LoadError, Loading, Section } from '../components/Section';
import { WalletGate } from '../components/WalletGate';
import { Account, TxLink } from '../components/TxLink';
import { useDemoLink } from '../demo/demo';
import { rewardStateLabel } from '../lib/enums';
import { formatMetric, metricLabel } from '../lib/metrics';
import { formatDateTime } from '../lib/time';
import { NotFoundPage } from './NotFound';

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
  const sim = s.profile.adapter === 'simulator';
  const alias = dep.data?.assets.find((a) => a.asset_id === assetId)?.alias ?? assetId;

  const timeline: [string, boolean, ReactNode][] = [
    ['Opened by the agent', true, <><Account id={task.opened_by} /> · {formatDateTime(task.created_at)}</>],
    ['Claimed', !!task.claimer, task.claimer ? <><Account id={task.claimer} />{task.claimed_at && ` · ${formatDateTime(task.claimed_at)}`}</> : 'waiting for a member'],
    ['Evidence submitted', !!task.evidence_hash, task.evidence_hash ? <span className="num break-all">sha256 {task.evidence_hash}</span> : 'photo hash, computed in the browser'],
    ['Verification test', !!task.verification, rule?.requires_verification_test ? (task.verification ? `${task.verification.passed ? 'passed' : 'failed'} · bridge report` : 'bridge runs it after submission') : 'not required by this rule'],
    ['Approved by an independent verifier', !!task.verifier, task.verifier ? <Account id={task.verifier} /> : 'verifier ≠ claimer, agent or bridge'],
    ...(task.needs_council || task.council_approver ? [['Council second approval', !!task.council_approver, task.council_approver ? <Account id={task.council_approver} /> : 'needed'] as [string, boolean, ReactNode]] : []),
    ['Rewarded', task.status === 'Rewarded', rewardStateLabel(task.reward_state)],
  ];

  return (
    <div className="space-y-8">
      <div>
        <Link to={link(`/a/${assetId}`)} className="text-sm text-ink-2 hover:underline">
          ← {s.meta.display_name}
        </Link>
        <p className="eyebrow mt-2">task #{task.id} · {alias}</p>
        <h1 className="flex flex-wrap items-center gap-3 text-3xl font-extrabold">
          {rule?.title ?? task.rule_id} <Pill tone={task.status === 'Rewarded' ? 'alive' : 'due'}>{task.status}</Pill> {sim && <SimulatedBadge />}
        </h1>
      </div>

      <blockquote className="tag border-l-4 border-l-due-fill p-4">
        <p className="eyebrow">why the machine asked</p>
        <p className="mt-1 text-lg leading-snug">{task.rationale}</p>
        <TxLink hash={ds.rowTx(`task-${alias}-${task.id}`)} label="task_opened tx" />
      </blockquote>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Section title="Rule facts" eyebrow="from on-chain telemetry">
          <dl className="tag grid grid-cols-2 gap-4 p-4 text-sm">
            <div><dt className="text-xs text-ink-3">metric</dt><dd className="num">{rule?.metric}</dd></div>
            <div><dt className="text-xs text-ink-3">threshold</dt><dd className="num">{rule && formatMetric(rule.metric, rule.threshold)}</dd></div>
            <div><dt className="text-xs text-ink-3">{rule && metricLabel(rule.metric)} at open</dt><dd className="num">{rule && formatMetric(rule.metric, task.metric_value_at_open)}</dd></div>
            <div><dt className="text-xs text-ink-3">baseline now</dt><dd className="num">{rule && status && formatMetric(rule.metric, status.baseline)}</dd></div>
            <div className="col-span-2"><dt className="text-xs text-ink-3">reward</dt><dd>{task.reward_rights} usage right(s) in <span className="num">{s.profile.group_id}</span></dd></div>
          </dl>
        </Section>
        <Section title="Progress" eyebrow="no one approves their own work">
          <ol className="tag space-y-3 p-4 text-sm">
            {timeline.map(([label, done, detail]) => (
              <li key={label} className="flex gap-3">
                <span aria-hidden className={`mt-1 size-3 shrink-0 rounded-full border-2 ${done ? 'border-alive bg-alive' : 'border-line-strong'}`} />
                <div className="min-w-0">
                  <p className={done ? 'font-medium' : 'text-ink-3'}>{label}</p>
                  <p className="text-xs text-ink-2">{detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      {task.minted_right_ids.length > 0 && (
        <Section title="Cards earned" eyebrow="non-transferable, never revocable">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(cards.data ?? []).map((c) => (
              <CardTile key={c.token_id} card={c} simulated={sim} />
            ))}
          </div>
        </Section>
      )}

      {['Open', 'Claimed'].includes(task.status) && (
        <Section title="Do this task" eyebrow="claim · evidence · submit">
          <div className="tag space-y-3 p-4 text-sm">
            <label className="block">
              <span className="font-medium">Evidence photo</span>
              <span className="block text-xs text-ink-3">Only its SHA-256 goes on-chain. The photo never leaves this device.</span>
              <input type="file" accept="image/*" className="mt-2 block w-full text-xs" onChange={(e) => { const f = e.target.files?.[0]; if (f) void sha256Hex(f).then(setHash); }} />
            </label>
            {hash && <p className="num text-xs break-all">sha256 {hash}</p>}
            <WalletGate action="Claiming and submitting a task">
              <button type="button" className="rounded-full bg-ink px-5 py-2 font-medium text-paper">{task.status === 'Open' ? 'Claim' : 'Submit evidence'}</button>
            </WalletGate>
          </div>
        </Section>
      )}
    </div>
  );
}
