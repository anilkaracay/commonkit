import { useCommunities } from '../data/hooks';
import { Pill } from '../components/Badges';
import { Empty, LoadError, Loading, Section } from '../components/Section';
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
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold">Trainings</h1>
        <p className="max-w-xl text-sm text-ink-2">
          A trainer proposes a credential for a trainee; a different verifier approves. The trainee gets a non-transferable credential card, the
          trainer earns usage rights. Trainer and trainee can never approve it themselves.
        </p>
      </div>
      <Section title="Credential trainings" eyebrow="all communities">
        {trainings.length === 0 ? (
          <Empty>No trainings yet.</Empty>
        ) : (
          <ul className="tag divide-y divide-line px-4">
            {trainings.map(({ c, t }) => (
              <li key={`${c.community.slug}-${t.id}`} className="flex items-start gap-3 py-3 text-sm">
                <span className="num w-8 shrink-0 text-xs text-ink-3">#{t.id}</span>
                <div className="min-w-0 flex-1">
                  <p>
                    <Account id={t.trainer} /> <span className="text-ink-3">trained</span> <Account id={t.trainee} />{' '}
                    <span className="text-ink-3">for</span> <span className="num font-semibold text-cred">{t.kind}</span>
                  </p>
                  <p className="text-xs text-ink-3">
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
                <Pill tone={t.status === 'Approved' ? 'alive' : t.status === 'Rejected' ? 'danger' : 'due'}>{t.status}</Pill>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <WalletGate action="Proposing a training" />
    </div>
  );
}
