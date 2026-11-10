import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { BRIDGE_URL, bridgeMessage, requestAccess, type AccessResult } from '../bridge/client';
import { useWallet } from '../wallet/wallet';
import { useAssetSnapshot } from '../data/hooks';
import { useDataSource } from '../data/source';
import { Pill, SimulatedBadge } from '../components/Badges';
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

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link to={link(`/a/${assetId}`)} className="text-sm text-ink-2 hover:underline">
        ← {q.data.meta.display_name}
      </Link>
      <h1 className="flex flex-wrap items-center gap-3 text-3xl font-extrabold">
        Start reservation #{r.id} {sim && <SimulatedBadge />}
      </h1>

      <div className="tag space-y-2 p-4 text-sm">
        <p>
          Holder <Account id={r.holder} /> · <Pill tone="liability">{r.status}</Pill>
        </p>
        {check.data && (
          <>
            <p>
              Start window {formatDateTime(check.data.window_start)} → {formatDateTime(check.data.window_end)}
            </p>
            <p className={check.data.ok ? 'text-alive' : 'text-due'}>
              can_access for the holder right now: <strong>{check.data.ok ? 'yes' : 'no'}</strong> ({check.data.reason})
            </p>
          </>
        )}
      </div>

      <ol className="space-y-2 text-sm text-ink-2">
        <li>1. Your wallet signs a NEP-413 message naming this reservation (no transaction, no fee).</li>
        <li>2. The bridge next to the machine verifies the signature and calls <span className="num">can_access</span> on this account.</li>
        <li>3. Only if the chain says yes does it unlock the {q.data.profile.adapter === 'smart_plug' ? 'plug' : 'device'} and report the session start.</li>
      </ol>

      <WalletGate action="Starting a session">
        <button type="button" disabled={busy} onClick={() => void start()} className="rounded-full bg-ink px-5 py-2 font-medium text-paper disabled:opacity-50">
          Start
        </button>
        <p className="mt-2 text-xs text-ink-3">Bridge: {BRIDGE_URL}</p>
      </WalletGate>
      {error && (
        <p role="alert" className="rounded-tag bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}
      {result && (
        <div className="tag space-y-1 p-4 text-sm">
          <p className="font-medium text-alive">
            Session {result.resumed ? 'resumed' : 'started'} · {result.session_id}
          </p>
          <p className="text-xs text-ink-3">signed with a {result.key_permission} key · emulated device (SIMULATED)</p>
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
