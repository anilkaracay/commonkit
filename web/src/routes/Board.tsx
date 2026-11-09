import { Link } from 'react-router';
import { useAllAssets, useCommunities, useDeployment } from '../data/hooks';
import { useDataSource } from '../data/source';
import { AssetCard } from '../components/AssetCard';
import { Pill, SimulatedBadge } from '../components/Badges';
import { SameContractStrip } from '../components/SameContractStrip';
import { Empty, LoadError, Loading, Section } from '../components/Section';
import { TaskRow } from '../components/TaskRow';
import { Account, TxLink } from '../components/TxLink';
import { ProposalRow } from '../components/ProposalRow';
import { useDemoLink } from '../demo/demo';
import { formatAgo } from '../lib/time';

/** `/` — the board. No hero: the machines are the page. */
export function BoardPage() {
  const ds = useDataSource();
  const dep = useDeployment();
  const all = useAllAssets();
  const comms = useCommunities();
  const link = useDemoLink();
  const now = ds.now();
  const rowTx = (key: string) => ds.rowTx(key);

  if (dep.error || all.error) return <LoadError error={dep.error ?? all.error} />;
  if (!dep.data || !all.data) return <Loading what="the board" />;

  const openTasks = all.data.flatMap(({ deployed, snap }) =>
    snap.tasks.filter((t) => ['Open', 'Claimed', 'Submitted', 'Approved'].includes(t.status)).map((task) => ({ deployed, snap, task })),
  );
  const minted = all.data
    .flatMap(({ deployed, snap }) =>
      snap.tasks.filter((t) => t.status === 'Rewarded').map((task) => ({ deployed, snap, task })),
    )
    .sort((a, b) => Number(BigInt(b.task.created_at) - BigInt(a.task.created_at)));
  const proposals = (comms.data ?? [])
    .flatMap((c) => c.proposals.map((p) => ({ c, p })))
    .sort((a, b) => Number(BigInt(b.p.submission_time) - BigInt(a.p.submission_time)))
    .slice(0, 5);

  return (
    <div className="space-y-10">
      <p className="max-w-2xl text-ink-2">
        Shared things that pay for their own upkeep. Each machine below runs in its own keyless NEAR account; its money and rules live there, not
        in an admin's spreadsheet.
      </p>

      {dep.data.communities.map((c) => {
        const assets = all.data.filter((a) => a.deployed.community === c.slug);
        return (
          <Section
            key={c.slug}
            id={`community-${c.slug}`}
            eyebrow="community"
            sub={c.dao_id}
            title={c.name}
            action={
              <span className="flex items-center gap-2">
                {c.simulated && <SimulatedBadge />}
                <Link to={link(`/c/${c.slug}`)} className="text-sm underline decoration-dotted">
                  community
                </Link>
              </span>
            }
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {assets.map(({ deployed, snap }) => (
                <AssetCard key={deployed.asset_id} deployed={deployed} snap={snap} />
              ))}
            </div>
          </Section>
        );
      })}

      <SameContractStrip assets={all.data.map(({ deployed, snap }) => ({ deployed, codeHash: snap.account.code_hash }))} />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <Section title="Open tasks" eyebrow="maintenance the machines asked for">
          {openTasks.length === 0 ? (
            <Empty>No open maintenance. The agent opens a task only when telemetry crosses a profile threshold.</Empty>
          ) : (
            <ul className="tag divide-y divide-line px-4">
              {openTasks.map(({ deployed, snap, task }) => (
                <TaskRow
                  key={`${deployed.asset_id}-${task.id}`}
                  task={task}
                  assetId={deployed.asset_id}
                  assetName={deployed.alias}
                  rule={snap.profile.rules.find((r) => r.rule_id === task.rule_id)}
                  simulated={deployed.simulated}
                  nowMs={now}
                  txHash={rowTx(`task-${deployed.alias}-${task.id}`)}
                />
              ))}
            </ul>
          )}
        </Section>

        <Section title="Rights earned" eyebrow="latest usage rights minted">
          {minted.length === 0 ? (
            <Empty>No rights minted yet.</Empty>
          ) : (
            <ul className="tag divide-y divide-line px-4">
              {minted.map(({ deployed, snap, task }) => (
                <li key={`${deployed.asset_id}-${task.id}`} className="flex items-center gap-3 py-3">
                  <span className="num grid h-9 min-w-9 place-items-center rounded-lg bg-alive-soft px-2 text-sm font-bold text-alive">
                    +{task.minted_right_ids.length}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      <Account id={task.claimer} /> <span className="text-ink-3">for</span>{' '}
                      <Link to={link(`/t/${deployed.asset_id}/${task.id}`)} className="hover:underline">
                        {snap.profile.rules.find((r) => r.rule_id === task.rule_id)?.title ?? task.rule_id}
                      </Link>
                    </p>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                      {deployed.alias} · {snap.profile.group_id} · {formatAgo(task.created_at, now)}
                      {deployed.simulated && <SimulatedBadge />}
                    </p>
                  </div>
                  <TxLink hash={rowTx(`mint-${deployed.alias}-${task.id}`)} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Latest proposals" eyebrow="Sputnik DAO governance">
        {proposals.length === 0 ? (
          <Empty>No proposals yet.</Empty>
        ) : (
          <ul className="tag divide-y divide-line px-4">
            {proposals.map(({ c, p }) => (
              <ProposalRow key={`${c.community.slug}-${p.id}`} proposal={p} daoId={c.community.dao_id} assetIds={dep.data.assets.map((a) => a.asset_id)} nowMs={now} />
            ))}
          </ul>
        )}
        {comms.isLoading && <Loading what="proposals" />}
        <p className="text-xs text-ink-3">
          <Pill tone="muted">opened by the machine</Pill> marks proposals the asset contract created itself (escalations above its cash cap).
        </p>
      </Section>
    </div>
  );
}
