import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { useCardsFor, useDeployment } from '../data/hooks';
import { useDataSource } from '../data/source';
import { CardTile } from '../components/CardTile';
import { Pill } from '../components/Badges';
import { Empty, Loading, Section } from '../components/Section';
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
          const [reservations, reputation] = await Promise.all([v.get_reservations_by_holder(account ?? '', 0, 50), v.get_reputation(account ?? '')]);
          return { a, reservations, reputation };
        }),
      ),
  });

  if (!account) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="text-3xl font-extrabold">My cards</h1>
        <WalletGate action="Seeing your own cards" />
        <Section title="Or look at a member" eyebrow="cards are public on-chain">
          <ul className="tag divide-y divide-line px-4">
            {(dep.data?.members ?? []).map((m) => (
              <li key={m.account_id} className="flex items-center justify-between py-2.5">
                <Link to={link(`/me?as=${m.account_id}`)} className="hover:underline">
                  {m.display_name}
                </Link>
                <Pill tone={m.kind === 'demo-bot' ? 'sim' : 'muted'}>{m.kind}</Pill>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    );
  }

  const simCommunity = (slug: string) => dep.data?.communities.find((c) => c.slug === slug)?.simulated ?? false;
  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">{wallet.accountId ? 'connected' : 'read-only view'}</p>
        <h1 className="text-3xl font-extrabold">
          <Account id={account} />
        </h1>
        <p className="mono-id">{account}</p>
      </div>
      <Section title="Cards" eyebrow="rights and credentials">
        {!cards.data ? (
          <Loading what="cards" />
        ) : cards.data.length === 0 ? (
          <Empty>No cards yet. Maintain a machine or get trained to earn one.</Empty>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cards.data.map(({ card, community }) => (
              <CardTile key={`${community.slug}-${card.token_id}`} card={card} simulated={simCommunity(community.slug)} communityName={community.name} />
            ))}
          </div>
        )}
      </Section>
      <Section title="Reservations and reputation" eyebrow="per machine">
        <ul className="tag divide-y divide-line px-4">
          {(perAsset.data ?? []).filter((x) => x.reservations.length > 0 || x.reputation.sessions > 0 || x.reputation.maintenances > 0).map(({ a, reservations, reputation }) => (
            <li key={a.asset_id} className="py-3 text-sm">
              <p className="font-medium">
                <Link to={link(`/a/${a.asset_id}`)} className="hover:underline">{a.alias}</Link>{' '}
                <span className="text-xs text-ink-3">
                  {reputation.sessions} sessions · {reputation.clean_returns} clean · {reputation.maintenances} maintenances
                </span>
              </p>
              <p className="mt-1 flex flex-wrap gap-1">
                {reservations.map((r) => (
                  <Pill key={r.id} tone="muted">#{r.id} {r.status}</Pill>
                ))}
              </p>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
