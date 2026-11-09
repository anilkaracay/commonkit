import { Link, useParams } from 'react-router';
import { useCommunities } from '../data/hooks';
import { useDataSource } from '../data/source';
import { SimulatedBadge, Pill } from '../components/Badges';
import { Empty, LoadError, Loading, Section } from '../components/Section';
import { Account } from '../components/TxLink';
import { ProposalRow } from '../components/ProposalRow';
import { formatNear } from '../lib/near';
import { shortAccount } from '../lib/enums';
import { useDemoLink } from '../demo/demo';
import { NotFoundPage } from './NotFound';

/** `/c/:community` — DAO, council, treasury, commons, groups, credential kinds, roles, governance. */
export function CommunityPage() {
  const { community } = useParams();
  const ds = useDataSource();
  const comms = useCommunities();
  const link = useDemoLink();
  if (comms.error) return <LoadError error={comms.error} />;
  if (!comms.data) return <Loading what="the community" />;
  const c = comms.data.find((x) => x.community.slug === community);
  if (!c) return <NotFoundPage what={`community "${community}"`} />;

  const council = c.policy.roles.find((r) => r.name === 'council');
  const councilMembers = council && typeof council.kind === 'object' && 'Group' in council.kind ? council.kind.Group : [];
  const groups = new Map<string, string[]>();
  for (const [assetId, entry] of c.assets) groups.set(entry.group_id, [...(groups.get(entry.group_id) ?? []), assetId]);

  return (
    <div className="space-y-10">
      <header className={`tag p-5 ${c.community.simulated ? 'tag-sim' : ''}`}>
        <p className="eyebrow">community</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold">{c.community.name}</h1>
          {c.community.simulated && <SimulatedBadge />}
        </div>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="eyebrow">DAO treasury</dt>
            <dd className="num key-num font-semibold" style={{ ['--key-base' as string]: '1.75rem' }}>
              {formatNear(c.treasury.amount, { maxDecimals: 2 })} <span className="text-base text-ink-3">NEAR</span>
            </dd>
            <dd className="mono-id">{c.community.dao_id}</dd>
          </div>
          <div>
            <dt className="eyebrow">Council</dt>
            <dd className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {councilMembers.map((m) => (
                <Account key={m} id={m} />
              ))}
            </dd>
            <dd className="mt-1 text-xs text-ink-3">proposal bond {formatNear(c.policy.proposal_bond)} NEAR</dd>
          </div>
          <div>
            <dt className="eyebrow">Commons contract</dt>
            <dd className="mono-id mt-1">{c.community.commons_id}</dd>
            <dd className="text-xs text-ink-3">roles, credentials, usage-right cards</dd>
          </div>
        </dl>
      </header>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <Section title="Groups" eyebrow="rights are shared inside a group">
          <ul className="tag divide-y divide-line px-4">
            {[...groups].map(([g, ids]) => (
              <li key={g} className="py-3">
                <p className="num font-medium">{g}</p>
                <p className="mt-1 flex flex-wrap gap-2">
                  {ids.map((id) => (
                    <Link key={id} to={link(`/a/${id}`)} className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-xs hover:underline">
                      {shortAccount(id)}
                    </Link>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Credential kinds" eyebrow="needed for risky machines">
          {c.credentialKinds.length === 0 ? (
            <Empty>No credential kinds. Every machine here is open to all members.</Empty>
          ) : (
            <ul className="tag divide-y divide-line px-4">
              {c.credentialKinds.map((k) => (
                <li key={k.kind} className="py-3 text-sm">
                  <p>
                    <span className="num font-semibold text-cred">{k.kind}</span> · {k.title}
                  </p>
                  <p className="text-xs text-ink-2">
                    valid {k.validity_days ? `${k.validity_days} days` : 'without expiry'} · trainer earns {k.trainer_reward_rights} right(s) in{' '}
                    <span className="num">{k.reward_group}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Roles" eyebrow="set only by DAO proposals">
        <ul className="tag divide-y divide-line px-4">
          {c.roles.map(([account, roles]) => (
            <li key={account} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <Account id={account} />
              <span className="flex flex-wrap gap-1">
                {roles.map((r) => (
                  <Pill key={r} tone={r === 'council' ? 'liability' : r === 'trainer' ? 'due' : 'alive'}>
                    {r}
                  </Pill>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Governance" eyebrow="recent Sputnik proposals">
        <ul className="tag divide-y divide-line px-4">
          {[...c.proposals].reverse().map((p) => (
            <ProposalRow key={p.id} proposal={p} daoId={c.community.dao_id} assetIds={c.assets.map(([id]) => id)} nowMs={ds.now()} />
          ))}
        </ul>
      </Section>
    </div>
  );
}
