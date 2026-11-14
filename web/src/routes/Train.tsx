import { useCommunities } from '../data/hooks';
import { Mark } from '../components/Badges';
import { Empty, LoadError, Loading, PageHead, Section } from '../components/Section';
import { WalletGate } from '../components/WalletGate';
import { Account } from '../components/TxLink';
import { formatDateTime } from '../lib/time';
import { useState } from 'react';
import { useWallet } from '../wallet/wallet';
import { useContractAction } from '../wallet/useContractAction';
import { TxLink } from '../components/TxLink';

/** `/train` — trainers propose credentials; independent verifiers approve. */
export function TrainPage() {
  const comms = useCommunities();
  const wallet = useWallet();
  const action = useContractAction();
  const [communityId, setCommunityId] = useState('');
  const [kind, setKind] = useState('');
  const [trainee, setTrainee] = useState('');
  if (comms.error) return <LoadError error={comms.error} />;
  if (!comms.data) return <Loading what="trainings" />;
  const trainings = comms.data.flatMap((c) => c.trainings.map((t) => ({ c, t })));
  const hasRole = (c: typeof comms.data[number], role: string) => c.roles.some((r) => r.account_id === wallet.accountId && r.roles.includes(role));
  const trainerCommunities = comms.data.filter((c) => hasRole(c, 'trainer') && c.credentialKinds.length > 0);
  const community = trainerCommunities.find((c) => c.community.commons_id === communityId) ?? trainerCommunities[0];
  const credential = community?.credentialKinds.find((k) => k.kind === kind) ?? community?.credentialKinds[0];
  const validTrainee = trainee.length >= 2 && trainee.length <= 64 && /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(trainee) && trainee !== wallet.accountId;
  return (
    <div className="space-y-14">
      <PageHead title="Trainings">
        <span className="text-[15px]">Trainer proposes, a different verifier approves.</span>
      </PageHead>
      <Section title="Credential trainings" note="All communities">
        {trainings.length === 0 ? (
          <Empty>No trainings yet.</Empty>
        ) : (
          <ul className="panel divide-y divide-line">
            {trainings.map(({ c, t }) => (
              <li id={`training-${c.community.slug}-${t.id}`} key={`${c.community.slug}-${t.id}`} className="flex flex-wrap items-start gap-4 px-5 py-4">
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
                {t.status === 'Proposed' && hasRole(c, 'verifier') && wallet.accountId !== t.trainer && wallet.accountId !== t.trainee && (
                  <button type="button" className="ck-btn" disabled={action.isPending} onClick={() => action.mutate({ receiverId: c.community.commons_id, methodName: 'approve_credential', args: { training_id: t.id }, deposit: 0n })}>
                    {action.isPending ? 'Confirming…' : 'Approve credential'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
      {action.data && <p role="status" className="text-sm">Transaction confirmed. <TxLink hash={action.data.txHash} label="View training transaction" /></p>}
      <WalletGate action="Proposing a training">
        {community && credential ? (
          <Section title="Propose a credential" note="An independent verifier must approve">
            <form className="max-w-xl space-y-4" onSubmit={(e) => {
              e.preventDefault();
              if (!validTrainee || action.isPending) return;
              action.mutate({ receiverId: community.community.commons_id, methodName: 'propose_credential', args: { trainee, kind: credential.kind, notes_hash: null }, deposit: 0n });
            }}>
              <label className="block text-sm">Community
                <select className="field mt-2 block w-full" value={community.community.commons_id} onChange={(e) => { setCommunityId(e.target.value); setKind(''); }}>
                  {trainerCommunities.map((c) => <option key={c.community.commons_id} value={c.community.commons_id}>{c.community.name}</option>)}
                </select>
              </label>
              <label className="block text-sm">Credential
                <select className="field mt-2 block w-full" value={credential.kind} onChange={(e) => setKind(e.target.value)}>
                  {community.credentialKinds.map((k) => <option key={k.kind} value={k.kind}>{k.title}</option>)}
                </select>
              </label>
              <label className="block text-sm">Trainee testnet account
                <input className="field mt-2 block w-full" value={trainee} onChange={(e) => setTrainee(e.target.value.trim())} placeholder="member.testnet" autoCapitalize="none" autoCorrect="off" />
              </label>
              <button className="ck-btn" type="submit" disabled={!validTrainee || action.isPending}>{action.isPending ? 'Confirming proposal…' : 'Propose credential'}</button>
            </form>
          </Section>
        ) : <p className="text-sm text-text-3">Proposing a credential requires the community trainer role.</p>}
      </WalletGate>
    </div>
  );
}
