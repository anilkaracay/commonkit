import { Link } from 'react-router';
import { useAgentLimits, useAllAssets } from '../data/hooks';
import { useDataSource } from '../data/source';
import { Mark, SimulatedBadge } from '../components/Badges';
import { Empty, LoadError, Loading, PageHead, Section } from '../components/Section';
import { TxLink } from '../components/TxLink';
import { useDemoLink } from '../demo/demo';
import { formatNear } from '../lib/near';
import { formatAgo } from '../lib/time';
import { NearText } from '../components/Near';
import { displayRationale } from '../lib/cast';

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
        .map((t) => ({ at: BigInt(t.created_at), key: `t-${deployed.alias}-${t.id}`, deployed, kind: 'Opened a task' as const, title: snap.profile.rules.find((r) => r.rule_id === t.rule_id)?.title ?? t.rule_id, text: t.rationale, href: `/t/${deployed.asset_id}/${t.id}`, tx: ds.rowTx(`task-${deployed.alias}-${t.id}`) })),
      ...snap.escalations.map((e) => ({ at: 0n, key: `e-${deployed.alias}-${e.id}`, deployed, kind: 'Escalated' as const, title: `${formatNear(e.amount)} NEAR ${e.kind} → DAO proposal #${e.proposal_id ?? '—'}`, text: e.reason, href: `/a/${deployed.asset_id}`, tx: ds.rowTx(`esc-${deployed.alias}-${e.id}`) })),
    ])
    .sort((a, b) => Number(b.at - a.at));
  const passed = limits.data?.filter((l) => l.ok).length ?? 0;

  return (
    <div className="space-y-16 sm:space-y-20">
      <PageHead title="Agent">
        <span className="text-[15px]">Opens upkeep only when on-chain telemetry crosses a rule. Cannot approve, pay or change profiles.</span>
      </PageHead>

      <Section title="Feed">
        {feed.length === 0 ? (
          <Empty>The agent has not acted yet.</Empty>
        ) : (
          <ol className="panel divide-y divide-line">
            {feed.map((f) => (
              <li key={f.key} className="px-5 py-5 sm:px-6">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-3">
                  <Mark tone={f.kind === 'Opened a task' ? 'due' : 'quiet'}>{f.kind}</Mark>
                  <span>{f.deployed.alias}</span>
                  {f.at > 0n && <span>{formatAgo(f.at, now)}</span>}
                  {f.deployed.simulated && <SimulatedBadge />}
                  <span className="ml-auto">
                    <TxLink hash={f.tx} />
                  </span>
                </p>
                <Link to={link(f.href)} className="mt-2 block text-lg font-medium no-underline hover:text-accent">
                  <NearText text={f.title} />
                </Link>
                <p className="mt-1 max-w-3xl text-text-2">{displayRationale(f.text)}</p>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Limits demo" note="Each attempt must be refused">
        {!limits.data ? (
          <Loading what="limits evidence" />
        ) : (
          <div className="space-y-4">
            <p className="flex items-baseline gap-3">
              <span className="key-num display leading-none" style={{ ['--key-base' as string]: '2.25rem' }}>
                {passed}/{limits.data.length}
              </span>
              <span className="text-text-2">refused as expected</span>
            </p>
            <ul className="panel divide-y divide-line">
              {limits.data.map((l) => (
                <li key={l.attempt} className="flex items-start gap-4 px-5 py-4">
                  <span
                    className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ${l.ok ? 'bg-accent' : 'bg-danger'}`}
                    aria-label={l.ok ? 'as expected' : 'unexpected'}
                  >
                    {l.ok ? '✓' : '✗'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p>{l.attempt}</p>
                    <p className="mt-1 text-sm text-text-3">
                      expected <span className="font-mono text-xs text-text-2">{l.expected}</span> · observed <span className="font-mono text-xs text-text-2">{l.observed}</span>
                    </p>
                  </div>
                  <TxLink hash={l.tx_hash} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
    </div>
  );
}
