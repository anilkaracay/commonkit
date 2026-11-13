import { Link } from 'react-router';
import { useAllAssets, useCommunities } from '../data/hooks';
import { Empty, LoadError, Loading, PageHead, Section } from '../components/Section';
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
      who: 'Steward · not the holder',
      empty: 'No finished sessions waiting for a return check.',
      rows: returns.map(({ deployed, r }) => (
        <li key={`${deployed.alias}-${r.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-5 py-3.5 text-sm">
          <Link to={link(`/a/${deployed.asset_id}`)} className="font-medium no-underline hover:text-accent">{deployed.alias}</Link> <span className="num text-text-3">#{r.id}</span> · <Account id={r.holder} />
          {deployed.simulated && <SimulatedBadge />}
        </li>
      )),
    },
    {
      title: 'Work to verify',
      who: 'Verifier · not the claimer, agent or bridge',
      empty: 'No submitted maintenance waiting for a verifier.',
      rows: toVerify.map(({ deployed, snap, t }) => (
        <li key={`${deployed.alias}-${t.id}`} className="px-5 py-3.5 text-sm">
          <Link to={link(`/t/${deployed.asset_id}/${t.id}`)} className="font-medium no-underline hover:text-accent">{snap.profile.rules.find((r) => r.rule_id === t.rule_id)?.title}</Link> · {t.kind} · {deployed.alias} · by <Account id={t.claimer} />
          {toYocto(t.expense) > 0n && <span className="num text-text-3"> · expense {formatNear(t.expense)} NEAR with receipt</span>}
        </li>
      )),
    },
    {
      title: 'Council second approvals',
      who: 'Council · not the claimer or verifier',
      empty: 'Nothing needs a second approval.',
      rows: toCouncil.map(({ deployed, t }) => (
        <li key={`${deployed.alias}-${t.id}`} className="px-5 py-3.5 text-sm">
          <Link to={link(`/t/${deployed.asset_id}/${t.id}`)} className="font-medium no-underline hover:text-accent">task #{t.id}</Link> · {deployed.alias} · verified by <Account id={t.verifier} />
        </li>
      )),
    },
    {
      title: 'Credentials to approve',
      who: 'Verifier · not the trainer or trainee',
      empty: 'No proposed trainings.',
      rows: trainings.map(({ c, t }) => (
        <li key={`${c.community.slug}-${t.id}`} className="px-5 py-3.5 text-sm">
          <Account id={t.trainer} /> → <Account id={t.trainee} /> · <span className="font-mono text-xs">{t.kind}</span>
        </li>
      )),
    },
  ];

  return (
    <div className="space-y-14">
      <PageHead title="Approvals">
        <span className="text-[15px]">Never by the person who did the work.</span>
      </PageHead>
      <WalletGate action="Approving" />
      <div className="grid grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-10">
        {groups.map((g) => (
          <Section key={g.title} title={g.title} note={g.who}>
            {g.rows.length === 0 ? <Empty>{g.empty}</Empty> : <ul className="panel divide-y divide-line">{g.rows}</ul>}
          </Section>
        ))}
      </div>
    </div>
  );
}
