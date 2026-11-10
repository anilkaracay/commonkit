import { useCommunities } from '../data/hooks';
import { Mark } from '../components/Badges';
import { Empty, LoadError, Loading, PageHead, Section } from '../components/Section';
import { WalletGate } from '../components/WalletGate';
import { Account } from '../components/TxLink';
import { formatDateTime } from '../lib/time';

/** `/train` — trainers propose credentials; independent verifiers approve. */
export function TrainPage() {
  const comms = useCommunities();
  if (comms.error) return <LoadError error={comms.error} />;
  if (!comms.data) return <Loading what="trainings" />;
  const trainings = comms.data.flatMap((c) => c.trainings.map((t) => ({ c, t })));
  return (
    <div className="space-y-14">
      <PageHead title="Trainings">
        A trainer proposes a credential; a different verifier approves. The trainee gets a credential card, the trainer earns usage rights.
      </PageHead>
      <Section title="Credential trainings" note="All communities">
        {trainings.length === 0 ? (
          <Empty>No trainings yet.</Empty>
        ) : (
          <ul className="panel divide-y divide-line">
            {trainings.map(({ c, t }) => (
              <li key={`${c.community.slug}-${t.id}`} className="flex items-start gap-4 px-5 py-4">
                <span className="num w-7 shrink-0 pt-px text-sm text-text-3">#{t.id}</span>
                <div className="min-w-0 flex-1">
                  <p>
                    <Account id={t.trainer} /> <span className="text-text-3">trained</span> <Account id={t.trainee} />{' '}
                    <span className="text-text-3">for</span> <span className="font-mono text-xs">{t.kind}</span>
                  </p>
                  <p className="mt-1 text-sm text-text-3">
                    {c.community.name} · {formatDateTime(t.created_at)}
                    {t.approver && (
                      <>
                        {' '}
                        · approved by <Account id={t.approver} />
                      </>
                    )}
                    {t.minted.length > 0 && ` · minted ${t.minted.join(', ')}`}
                  </p>
                </div>
                <Mark tone={t.status === 'Approved' ? 'ok' : t.status === 'Rejected' ? 'danger' : 'quiet'}>{t.status}</Mark>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <WalletGate action="Proposing a training" />
    </div>
  );
}
