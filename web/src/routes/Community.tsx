import { Link, useParams } from 'react-router';
import { useCatalog, useCommunities, useDeployment } from '../data/hooks';
import { useDataSource } from '../data/source';
import { SimulatedBadge } from '../components/Badges';
import { Empty, LoadError, Loading, Section } from '../components/Section';
import { Account } from '../components/TxLink';
import { ProposalRow } from '../components/ProposalRow';
import { MachineVisual } from '../components/MachineVisual';
import { shortAccount } from '../lib/enums';
import { useDemoLink } from '../demo/demo';
import { NotFoundPage } from './NotFound';
import { Near } from '../components/Near';

/** `/c/:community` — DAO, council, treasury, commons, groups, credential kinds, roles, governance. */
export function CommunityPage() {
  const { community } = useParams();
  const ds = useDataSource();
  const comms = useCommunities();
  const dep = useDeployment();
  const catalog = useCatalog();
  const link = useDemoLink();
  if (comms.error) return <LoadError error={comms.error} />;
  if (!comms.data) return <Loading what="the community" />;
  const c = comms.data.find((x) => x.community.slug === community);
  if (!c) return <NotFoundPage what={`community "${community}"`} />;

  const council = c.policy.roles.find((r) => r.name === 'council');
  const councilMembers = council && typeof council.kind === 'object' && 'Group' in council.kind ? council.kind.Group : [];
  const groups = new Map<string, string[]>();
  for (const a of c.assets) groups.set(a.group_id, [...(groups.get(a.group_id) ?? []), a.asset_id]);
  // Static files only (deployments + bundled profiles): no extra RPC reads on this page.
  const entryOf = (id: string) => {
    const file = dep.data?.assets.find((a) => a.asset_id === id)?.profile_file;
    return catalog.data?.find((e) => e.file === file || e.file.endsWith(`/${file}`));
  };
  const typeOf = (id: string) => entryOf(id)?.profile.asset_type;
  const nameOf = (id: string) => entryOf(id)?.meta.display_name ?? shortAccount(id);

  return (
    <div className="space-y-16 sm:space-y-20">
      <header className="space-y-8">
        <div>
          <p className="mb-3 text-sm text-text-3">Community</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <h1 className="display text-[34px] sm:text-[44px]">{c.community.name}</h1>
            {c.community.simulated && <SimulatedBadge />}
          </div>
        </div>
        <dl className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3">
          <div className="bg-surface p-5 sm:p-6">
            <dt className="text-sm text-text-3">DAO treasury</dt>
            <dd className="mt-1 flex items-baseline gap-1.5">
              <span className="key-num display leading-none" style={{ ['--key-base' as string]: '2.25rem' }}>
                <Near value={c.treasury.amount} opts={{ minDecimals: 2, maxDecimals: 2 }} />
              </span>
            </dd>
            <dd className="mono-id mt-3">{c.community.dao_id}</dd>
          </div>
          <div className="bg-surface p-5 sm:p-6">
            <dt className="text-sm text-text-3">Council</dt>
            <dd className="mt-2 flex flex-col gap-1">
              {councilMembers.map((m) => (
                <Account key={m} id={m} />
              ))}
            </dd>
            <dd className="mt-3 text-xs text-text-3">
              Proposal bond <Near value={c.policy.proposal_bond} />
            </dd>
          </div>
          <div className="bg-surface p-5 sm:p-6">
            <dt className="text-sm text-text-3">Commons contract</dt>
            <dd className="mono-id mt-2 text-text">{c.community.commons_id}</dd>
            <dd className="mt-3 text-xs text-text-3">Roles, credentials, usage-right cards</dd>
          </div>
        </dl>
      </header>

      <Section title="Groups" note="Rights are shared inside a group">
        <div className="space-y-8">
          {[...groups].map(([g, ids]) => (
            <div key={g} className="space-y-3">
              <p className="font-mono text-sm text-text-2">{g}</p>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {ids.map((id) => (
                  <li key={id}>
                    <Link to={link(`/a/${id}`)} className="group block no-underline">
                      <MachineVisual type={typeOf(id) ?? ''} className="rounded-md" />
                      <span className="mt-2 block truncate font-medium group-hover:text-accent">{nameOf(id)}</span>
                      <span className="mono-id block truncate">{shortAccount(id)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-10">
        <Section title="Credential kinds" note="Needed for risky machines">
          {c.credentialKinds.length === 0 ? (
            <Empty>No credential kinds. Every machine here is open to all members.</Empty>
          ) : (
            <ul className="panel divide-y divide-line">
              {c.credentialKinds.map((k) => (
                <li key={k.kind} className="px-5 py-4">
                  <p>
                    {k.title} <span className="font-mono text-xs text-text-3">{k.kind}</span>
                  </p>
                  <p className="mt-1 text-sm text-text-3">
                    Valid {k.validity_days ? `${k.validity_days} days` : 'without expiry'} · trainer earns {k.trainer_reward_rights} right(s) in{' '}
                    <span className="font-mono text-xs">{k.reward_group}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Roles" note="Set only by DAO proposals">
          <ul className="panel divide-y divide-line">
            {c.roles.map(({ account_id: account, roles }) => (
              <li key={account} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3.5">
                <Account id={account} />
                <span className="text-sm text-text-3">{roles.join(' · ')}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title="Governance" note="Recent Sputnik proposals">
        {c.proposals.length === 0 ? (
          <Empty>No proposals yet.</Empty>
        ) : (
          <ul className="panel divide-y divide-line">
            {[...c.proposals].reverse().map((p) => (
              <ProposalRow key={p.id} proposal={p} daoId={c.community.dao_id} assetIds={c.assets.map((a) => a.asset_id)} nowMs={ds.now()} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
