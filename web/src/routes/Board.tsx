import { Link } from 'react-router';
import { useAllAssets, useCatalog, useCommunities, useDeployment } from '../data/hooks';
import { ScenarioMatrix } from '../components/ScenarioMatrix';
import { KIND_LABEL, KindIcon } from '../components/UpkeepKind';
import { UPKEEP_KINDS } from '../data/types';
import { useDataSource } from '../data/source';
import { AssetCard } from '../components/AssetCard';
import { SimulatedBadge } from '../components/Badges';
import { SameContractStrip } from '../components/SameContractStrip';
import { Empty, LoadError, Loading, Section } from '../components/Section';
import { TaskRow } from '../components/TaskRow';
import { Account, TxLink } from '../components/TxLink';
import { ProposalRow } from '../components/ProposalRow';
import { useDemoLink } from '../demo/demo';
import { formatAgo } from '../lib/time';

/** `/` — the board. The machines are the page. */
export function BoardPage() {
  const ds = useDataSource();
  const dep = useDeployment();
  const all = useAllAssets();
  const comms = useCommunities();
  const catalog = useCatalog();
  const link = useDemoLink();
  const now = ds.now();
  const rowTx = (key: string) => ds.rowTx(key);

  if (dep.error || all.error) return <LoadError error={dep.error ?? all.error} />;
  if (!dep.data || !all.data) return <Loading what="the board" />;

  const openTasks = all.data.flatMap(({ deployed, snap }) =>
    snap.tasks.filter((t) => ['Open', 'Claimed', 'Submitted', 'Approved'].includes(t.status)).map((task) => ({ deployed, snap, task })),
  );
  const minted = all.data
    .flatMap(({ deployed, snap }) => snap.tasks.filter((t) => t.status === 'Rewarded').map((task) => ({ deployed, snap, task })))
    .sort((a, b) => Number(BigInt(b.task.created_at) - BigInt(a.task.created_at)));
  const proposals = (comms.data ?? [])
    .flatMap((c) => c.proposals.map((p) => ({ c, p })))
    .sort((a, b) => Number(BigInt(b.p.submission_time) - BigInt(a.p.submission_time)))
    .slice(0, 5);
  const count = all.data.length;
  const keyless = all.data.every(({ deployed }) => deployed.keyless === true);

  return (
    <div className="space-y-16 sm:space-y-20">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 className="display text-[30px] sm:text-[36px]">Machines</h1>
        <p className="text-sm text-text-3">
          {count} {keyless ? 'keyless ' : ''}accounts · live from NEAR testnet
        </p>
      </div>

      {/* ≥1280 px: communities side by side, two machines each → four cards across. */}
      <div className="grid grid-cols-1 gap-x-8 gap-y-14 xl:grid-cols-2">
        {dep.data.communities.map((c) => {
          const assets = all.data.filter((a) => a.deployed.community === c.slug);
          return (
            <section key={c.slug} aria-labelledby={`community-${c.slug}`} className="min-w-0 space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <h2 id={`community-${c.slug}`} className="text-xl">
                    <Link to={link(`/c/${c.slug}`)} className="no-underline hover:text-accent">
                      {c.name}
                    </Link>
                  </h2>
                  <p className="mono-id mt-1">{c.dao_id}</p>
                </div>
                <span className="flex items-center gap-4">
                  {c.simulated && <SimulatedBadge />}
                  <Link to={link(`/c/${c.slug}`)} className="text-link text-sm">
                    Community →
                  </Link>
                </span>
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {assets.map(({ deployed, snap }) => (
                  <AssetCard key={deployed.asset_id} deployed={deployed} snap={snap} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-10">
        <Section title="Open tasks">
          {openTasks.length === 0 ? (
            <Empty>No open upkeep. The agent opens a task only when a profile rule is due.</Empty>
          ) : (
            <div className="space-y-5">
              {UPKEEP_KINDS.filter((k) => openTasks.some((o) => o.task.kind === k)).map((kind) => (
                <div key={kind} className="space-y-2">
                  <h3 className="flex items-center gap-2 text-sm font-medium text-text-2">
                    <span className="text-slate-400">
                      <KindIcon kind={kind} />
                    </span>
                    {KIND_LABEL[kind]}
                  </h3>
                  <ul className="panel divide-y divide-line">
                    {openTasks
                      .filter((o) => o.task.kind === kind)
                      .map(({ deployed, snap, task }) => (
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
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Rights earned">
          {minted.length === 0 ? (
            <Empty>No rights minted yet.</Empty>
          ) : (
            <ul className="panel divide-y divide-line">
              {minted.map(({ deployed, snap, task }) => (
                <li key={`${deployed.asset_id}-${task.id}`} className="flex items-center gap-4 px-5 py-4">
                  <span className="num w-9 shrink-0 text-xl font-semibold text-accent">+{task.minted_right_ids.length}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      <Account id={task.claimer} /> <span className="text-text-3">for</span>{' '}
                      <Link to={link(`/t/${deployed.asset_id}/${task.id}`)} className="no-underline hover:text-accent">
                        {snap.profile.rules.find((r) => r.rule_id === task.rule_id)?.title ?? task.rule_id}
                      </Link>
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-3">
                      <span>
                        {deployed.alias} · <span className="font-mono text-xs">{snap.profile.group_id}</span> · {formatAgo(task.created_at, now)}
                      </span>
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

      <Section title="Same contract, different commons">
        <div className="space-y-5">
          <SameContractStrip
            assets={all.data.map(({ deployed, snap }) => ({
              deployed,
              codeHash: snap.account.code_hash,
              assetType: snap.profile.asset_type,
            }))}
          />
          {catalog.data ? <ScenarioMatrix catalog={catalog.data} /> : <Loading what="profiles" />}
        </div>
      </Section>

      <Section title="Latest proposals" note="Sputnik DAO">
        {proposals.length === 0 ? (
          <Empty>No proposals yet.</Empty>
        ) : (
          <ul className="panel divide-y divide-line">
            {proposals.map(({ c, p }) => (
              <ProposalRow
                key={`${c.community.slug}-${p.id}`}
                proposal={p}
                daoId={c.community.dao_id}
                assetIds={dep.data.assets.map((a) => a.asset_id)}
                nowMs={now}
              />
            ))}
          </ul>
        )}
        {comms.isLoading && <Loading what="proposals" />}
      </Section>
    </div>
  );
}
