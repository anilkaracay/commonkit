import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { useCardsFor, useDeployment } from '../data/hooks';
import { useDataSource } from '../data/source';
import { CardTile } from '../components/CardTile';
import { Mark } from '../components/Badges';
import { Empty, Loading, PageHead, Section } from '../components/Section';
import { WalletGate } from '../components/WalletGate';
import { Account } from '../components/TxLink';
import { useDemoLink } from '../demo/demo';
import { useWallet } from '../wallet/wallet';

/** `/me` — my cards, reservations, reputation. `?as=<account>` gives a read-only public view. */
export function MePage() {
  const wallet = useWallet();
  const [params] = useSearchParams();
  const ds = useDataSource();
  const dep = useDeployment();
  const link = useDemoLink();
  const account = wallet.accountId ?? params.get('as');
  const cards = useCardsFor(account);
  const perAsset = useQuery({
    queryKey: ['me-assets', ds.kind, account],
    enabled: !!account && !!dep.data,
    queryFn: () =>
      Promise.all(
        (dep.data?.assets ?? []).map(async (a) => {
          const v = ds.asset(a.asset_id);
          const [reservations, reputation] = await Promise.all([
            v.get_reservations_by_holder(account ?? '', 0, 50),
            v.get_reputation(account ?? ''),
          ]);
          return { a, reservations, reputation };
        }),
      ),
  });

  if (!account) {
    return (
      <div className="mx-auto max-w-xl space-y-10">
        <PageHead title="My cards" />
        <WalletGate action="Seeing your own cards" />
        <Section title="Or look at a member" note="Cards are public on-chain">
          <ul className="panel divide-y divide-line">
            {(dep.data?.members ?? []).map((m) => (
              <li key={m.account_id}>
                <Link
                  to={link(`/me?as=${m.account_id}`)}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 no-underline hover:bg-bg-alt"
                >
                  <span className="font-medium">{m.display_name}</span>
                  <span className="text-sm text-text-3">{m.kind} →</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    );
  }

  const active = (perAsset.data ?? []).filter(
    (x) => x.reservations.length > 0 || x.reputation.sessions > 0 || x.reputation.upkeeps > 0,
  );
  const simCommunity = (slug: string) =>
    dep.data?.communities.find((c) => c.slug === slug)?.simulated ?? false;
  return (
    <div className="space-y-16">
      <PageHead
        context={wallet.accountId ? 'Connected' : 'Read-only view'}
        title={<Account id={account} />}
      >
        <span className="mono-id">{account}</span>
      </PageHead>
      <Section title="Cards" note="Usage rights and credentials">
        {!cards.data ? (
          <Loading what="cards" />
        ) : cards.data.length === 0 ? (
          <Empty>No cards yet. Maintain a machine or get trained to earn one.</Empty>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {cards.data.map(({ card, community }) => (
              <CardTile
                key={`${community.slug}-${card.token_id}`}
                card={card}
                simulated={simCommunity(community.slug)}
                communityName={community.name}
              />
            ))}
          </div>
        )}
      </Section>
      <Section title="Reservations and reputation" note="Per machine">
        {!perAsset.data ? (
          <Loading what="reservations" />
        ) : active.length === 0 ? (
          <Empty>No reservations or upkeep yet.</Empty>
        ) : (
          <ul className="panel divide-y divide-line">
            {active.map(({ a, reservations, reputation }) => (
              <li key={a.asset_id} className="px-5 py-4 text-sm">
                <p className="flex flex-wrap items-baseline gap-x-3">
                  <Link
                    to={link(`/a/${a.asset_id}`)}
                    className="font-medium no-underline hover:text-accent"
                  >
                    {a.alias}
                  </Link>
                  <span className="num text-text-3">
                    {reputation.sessions} sessions · {reputation.clean_returns} clean ·{' '}
                    {reputation.upkeeps} upkeep · {reputation.fault_reports} fault reports
                  </span>
                </p>
                <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {reservations.map((r) => (
                    <Mark
                      key={r.id}
                      tone={r.status === 'Confirmed' || r.status === 'InSession' ? 'ok' : 'quiet'}
                    >
                      <span className="num">#{r.id}</span> {r.status}
                    </Mark>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
