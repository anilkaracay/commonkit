import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { BRIDGE_URL, bridgeMessage, requestAccess, type AccessResult } from '../bridge/client';
import { useWallet } from '../wallet/wallet';
import { useAssetSnapshot } from '../data/hooks';
import { useDataSource } from '../data/source';
import { Mark, SimulatedBadge } from '../components/Badges';
import { LoadError, Loading } from '../components/Section';
import { WalletGate } from '../components/WalletGate';
import { Account } from '../components/TxLink';
import { useDemoLink } from '../demo/demo';
import { formatDateTime } from '../lib/time';
import { NotFoundPage } from './NotFound';

/** `/a/:assetId/access/:reservationId` — "Start": NEP-413 sign → bridge → device. */
export function AccessPage() {
  const { assetId = '', reservationId = '' } = useParams();
  const ds = useDataSource();
  const q = useAssetSnapshot(assetId);
  const link = useDemoLink();
  const wallet = useWallet();
  const [result, setResult] = useState<AccessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const r = q.data?.reservations.find((x) => x.id === reservationId);
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await requestAccess(wallet, assetId, reservationId));
    } catch (e) {
      setError(bridgeMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const check = useQuery({
    queryKey: ['can_access', ds.kind, assetId, reservationId, r?.holder],
    enabled: !!r,
    queryFn: () => ds.asset(assetId).can_access(r?.holder ?? '', reservationId),
  });

  if (q.error) return <LoadError error={q.error} />;
  if (!q.data) return <Loading what="the reservation" />;
  if (!r) return <NotFoundPage what={`reservation #${reservationId}`} />;
  const sim = q.data.profile.adapter === 'simulator';

  const steps = [
    'Your wallet signs a NEP-413 message naming this reservation. No transaction, no fee.',
    <>
      The bridge next to the machine verifies the signature and calls <span className="font-mono text-xs">can_access</span> on this account.
    </>,
    `Only if the chain says yes does it unlock the ${q.data.profile.adapter === 'smart_plug' ? 'plug' : 'device'} and report the session start.`,
  ];

  return (
    <div className="mx-auto max-w-xl space-y-10">
      <div>
        <Link to={link(`/a/${assetId}`)} className="text-sm text-text-3 no-underline hover:text-accent">
          ← {q.data.meta.display_name}
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          <h1 className="display text-[34px] sm:text-[44px]">Start reservation #{r.id}</h1>
          {sim && <SimulatedBadge />}
        </div>
      </div>

      <dl className="ck-rows text-sm">
        <div>
          <dt>Holder</dt>
          <dd>
            <Account id={r.holder} />
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <Mark tone="ok">{r.status}</Mark>
          </dd>
        </div>
        {check.data && (
          <>
            <div>
              <dt>Start window</dt>
              <dd className="num">
                {formatDateTime(check.data.window_start)} → {formatDateTime(check.data.window_end)}
              </dd>
            </div>
            <div>
              <dt>
                <span className="font-mono text-xs">can_access</span> now
              </dt>
              <dd className={check.data.ok ? 'text-accent' : 'text-text-2'}>
                {check.data.ok ? 'yes' : 'no'} <span className="font-normal text-text-3">({check.data.reason})</span>
              </dd>
            </div>
          </>
        )}
      </dl>

      <ol className="space-y-4">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-4 text-text-2">
            <span className="num grid size-7 shrink-0 place-items-center rounded-full bg-bg-alt text-sm font-medium text-text">{i + 1}</span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>

      <WalletGate action="Starting a session">
        <button type="button" disabled={busy} onClick={() => void start()} className="ck-btn ck-btn--lg">
          Start
        </button>
        <p className="mt-3 text-xs text-text-3">Bridge: {BRIDGE_URL}</p>
      </WalletGate>
      {error && (
        <p role="alert" className="rounded-md bg-danger-soft p-4 text-sm text-danger">
          {error}
        </p>
      )}
      {result && (
        <div className="ck-card space-y-1.5 p-5 text-sm">
          <p className="font-medium text-accent">
            Session {result.resumed ? 'resumed' : 'started'} · {result.session_id}
          </p>
          <p className="flex flex-wrap items-center gap-2 text-xs text-text-3">
            Signed with a {result.key_permission} key · emulated device <SimulatedBadge />
          </p>
          {result.device?.manual_qr && (
            <p>
              Handover code for the steward: <span className="num font-semibold">{result.device.manual_qr.handover_code}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
