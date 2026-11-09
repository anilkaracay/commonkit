import { Link } from 'react-router';
import { useAllAssets, useCommunities } from '../data/hooks';
import { Empty, LoadError, Loading, Section } from '../components/Section';
import { SimulatedBadge } from '../components/Badges';
import { WalletGate } from '../components/WalletGate';
import { Account } from '../components/TxLink';
import { useDemoLink } from '../demo/demo';
import { formatNear, toYocto } from '../lib/near';

/** `/approvals` — stewards confirm returns, verifiers approve work, council gives second approvals. */
export function ApprovalsPage() {
  const all = useAllAssets();
  const comms = useCommunities();
  const link = useDemoLink();
  if (all.error) return <LoadError error={all.error} />;
  if (!all.data) return <Loading what="pending approvals" />;

  const returns = all.data.flatMap(({ deployed, snap }) => snap.reservations.filter((r) => r.status === 'Finished').map((r) => ({ deployed, r })));
  const toVerify = all.data.flatMap(({ deployed, snap }) => snap.tasks.filter((t) => t.status === 'Submitted').map((t) => ({ deployed, snap, t })));
  const toCouncil = all.data.flatMap(({ deployed, snap }) => snap.tasks.filter((t) => t.status === 'Approved' && !t.council_approver).map((t) => ({ deployed, snap, t })));
  const trainings = (comms.data ?? []).flatMap((c) => c.trainings.filter((t) => t.status === 'Proposed').map((t) => ({ c, t })));

  const groups = [
    {
      title: 'Returns to confirm',
      who: 'steward · not the holder',
      empty: 'No finished sessions waiting for a return check.',
      rows: returns.map(({ deployed, r }) => (
        <li key={`${deployed.alias}-${r.id}`} className="flex items-center gap-2 py-2.5 text-sm">
          <Link to={link(`/a/${deployed.asset_id}`)} className="hover:underline">{deployed.alias}</Link> #{r.id} · <Account id={r.holder} />
          {deployed.simulated && <SimulatedBadge />}
        </li>
      )),
    },
    {
      title: 'Work to verify',
      who: 'verifier · not the claimer, agent or bridge',
      empty: 'No submitted maintenance waiting for a verifier.',
      rows: toVerify.map(({ deployed, snap, t }) => (
        <li key={`${deployed.alias}-${t.id}`} className="py-2.5 text-sm">
          <Link to={link(`/t/${deployed.asset_id}/${t.id}`)} className="hover:underline">{snap.profile.rules.find((r) => r.rule_id === t.rule_id)?.title}</Link> · {t.kind} · {deployed.alias} · by <Account id={t.claimer} />
          {toYocto(t.expense) > 0n && <span className="num text-xs text-ink-2"> · expense {formatNear(t.expense)} NEAR with receipt</span>}
        </li>
      )),
    },
    {
      title: 'Council second approvals',
      who: 'council · not the claimer or verifier',
      empty: 'Nothing needs a second approval.',
      rows: toCouncil.map(({ deployed, t }) => (
        <li key={`${deployed.alias}-${t.id}`} className="py-2.5 text-sm">
          <Link to={link(`/t/${deployed.asset_id}/${t.id}`)} className="hover:underline">task #{t.id}</Link> · {deployed.alias} · verified by <Account id={t.verifier} />
        </li>
      )),
    },
    {
      title: 'Credentials to approve',
      who: 'verifier · not the trainer or trainee',
      empty: 'No proposed trainings.',
      rows: trainings.map(({ c, t }) => (
        <li key={`${c.community.slug}-${t.id}`} className="py-2.5 text-sm">
          <Account id={t.trainer} /> → <Account id={t.trainee} /> · <span className="num">{t.kind}</span>
        </li>
      )),
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold">Approvals</h1>
        <p className="text-sm text-ink-2">Every approval comes from someone other than the person who did the work. The contracts enforce it.</p>
      </div>
      <WalletGate action="Approving" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {groups.map((g) => (
          <Section key={g.title} title={g.title} eyebrow={g.who}>
            {g.rows.length === 0 ? <Empty>{g.empty}</Empty> : <ul className="tag divide-y divide-line px-4">{g.rows}</ul>}
          </Section>
        ))}
      </div>
    </div>
  );
}
