import { Link } from 'react-router';
import { useAgentLimits, useAllAssets } from '../data/hooks';
import { useDataSource } from '../data/source';
import { Pill, SimulatedBadge } from '../components/Badges';
import { Empty, LoadError, Loading, Section } from '../components/Section';
import { TxLink } from '../components/TxLink';
import { useDemoLink } from '../demo/demo';
import { formatNear } from '../lib/near';
import { formatAgo } from '../lib/time';

/** `/agent` — what the operations agent did, why, and the limits it cannot cross. */
export function AgentPage() {
  const ds = useDataSource();
  const all = useAllAssets();
  const limits = useAgentLimits();
  const link = useDemoLink();
  if (all.error) return <LoadError error={all.error} />;
  if (!all.data) return <Loading what="the agent feed" />;
  const now = ds.now();

  const feed = all.data
    .flatMap(({ deployed, snap }) => [
      ...snap.tasks
        .filter((t) => t.opened_by === snap.wiring.agent_id || t.opened_by.startsWith('agent'))
        .map((t) => ({ at: BigInt(t.created_at), key: `t-${deployed.alias}-${t.id}`, deployed, kind: 'opened task' as const, title: snap.profile.rules.find((r) => r.rule_id === t.rule_id)?.title ?? t.rule_id, text: t.rationale, href: `/t/${deployed.asset_id}/${t.id}`, tx: ds.rowTx(`task-${deployed.alias}-${t.id}`) })),
      ...snap.escalations.map((e) => ({ at: 0n, key: `e-${deployed.alias}-${e.id}`, deployed, kind: 'escalated' as const, title: `${formatNear(e.amount)} NEAR ${e.kind} → DAO proposal #${e.proposal_id ?? '—'}`, text: e.reason, href: `/a/${deployed.asset_id}`, tx: ds.rowTx(`esc-${deployed.alias}-${e.id}`) })),
    ])
    .sort((a, b) => Number(b.at - a.at));

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">operations agent</p>
        <h1 className="text-3xl font-extrabold">The machine's operator, on a short leash</h1>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <p className="tag p-3"><span className="font-medium text-alive">Can</span> open a maintenance task when on-chain telemetry crossed a profile threshold, annotate it, and ask the DAO for purchases.</p>
          <p className="tag p-3"><span className="font-medium text-danger">Cannot</span> approve work, pay anyone, change profiles, or open a task the telemetry does not justify. The DAO can switch it off.</p>
        </div>
      </div>

      <Section title="Feed" eyebrow="actions with their rationale">
        {feed.length === 0 ? (
          <Empty>The agent has not acted yet.</Empty>
        ) : (
          <ol className="space-y-3">
            {feed.map((f) => (
              <li key={f.key} className={`tag p-4 ${f.deployed.simulated ? 'tag-sim' : ''}`}>
                <p className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                  <Pill tone={f.kind === 'opened task' ? 'due' : 'liability'}>{f.kind}</Pill>
                  <span className="num">{f.deployed.alias}</span>
                  {f.at > 0n && <span>· {formatAgo(f.at, now)}</span>}
                  {f.deployed.simulated && <SimulatedBadge />}
                  <span className="ml-auto"><TxLink hash={f.tx} /></span>
                </p>
                <Link to={link(f.href)} className="mt-1 block font-medium hover:underline">{f.title}</Link>
                <p className="mt-1 text-sm text-ink-2">{f.text}</p>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Limits demo" eyebrow="each attempt must fail with the expected code">
        {!limits.data ? (
          <Loading what="limits evidence" />
        ) : (
          <ul className="tag divide-y divide-line px-4">
            {limits.data.map((l) => (
              <li key={l.attempt} className="flex items-start gap-3 py-3 text-sm">
                <span className={l.ok ? 'text-alive' : 'text-danger'} aria-label={l.ok ? 'as expected' : 'unexpected'}>{l.ok ? '✓' : '✗'}</span>
                <div className="min-w-0 flex-1">
                  <p>{l.attempt}</p>
                  <p className="num text-xs text-ink-2">expected {l.expected} · observed {l.observed}</p>
                </div>
                <TxLink hash={l.tx_hash} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
