/**
 * QR deep links on the asset page (pilot sheets, bridge manual_qr links):
 * `?action=reserve` → reservation sheet, `?action=return` → steward return confirmation
 * (bridge for manual_qr items, `confirm_return` on chain otherwise), `?action=fault` → report a fault.
 * Without a wallet the visitor goes through /pilot first and comes back here (`next`).
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import type { AssetSnapshot } from '../data/hooks';
import { useDataSource } from '../data/source';
import { useLang } from '../pilot/lang';
import { useWallet } from '../wallet/wallet';
import { bridgeMessage, confirmManual, manualSession, type ManualLoan } from '../bridge/client';
import { formatDateTime } from '../lib/time';
import { useToast } from './Toast';
import { Account, TxLink } from './TxLink';
import { SimulatedBadge } from './Badges';
import { useContractAction } from '../wallet/useContractAction';

export type DeepAction = 'reserve' | 'return' | 'fault';

export function parseAction(v: string | null): DeepAction | null {
  return v === 'reserve' || v === 'return' || v === 'fault' ? v : null;
}

async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="ck-card p-5 sm:p-6" aria-label={title}>
      <h2 className="text-xl">{title}</h2>
      <div className="mt-3 space-y-4 text-sm">{children}</div>
    </section>
  );
}

export function AssetAction({ action, snap }: { action: DeepAction; snap: AssetSnapshot }) {
  const { t } = useLang();
  const wallet = useWallet();
  const { pathname, search } = useLocation();

  if (wallet.status !== 'connected') {
    const next = encodeURIComponent(`${pathname}${search}`);
    return (
      <Panel title={t.needWalletTitle}>
        <p className="text-text-2">{t.needWalletBody}</p>
        <Link to={`/pilot?next=${next}`} className="ck-btn">
          {t.goPilot}
        </Link>
      </Panel>
    );
  }
  if (action === 'reserve') return <Navigate to={`/a/${snap.assetId}/reserve${search}`} replace />;
  if (action === 'fault') return <FaultDialog snap={snap} />;
  return <ReturnPanel snap={snap} />;
}

function FaultDialog({ snap }: { snap: AssetSnapshot }) {
  const { t } = useLang();
  const wallet = useWallet();
  const toast = useToast();
  const reportRules = snap.profile.rules.filter((r) => 'Report' in r.trigger);
  const [rule, setRule] = useState(reportRules[0]?.rule_id ?? '');
  const [note, setNote] = useState('');
  const [tx, setTx] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      const note_hash = await sha256Hex(note.trim());
      const r = await wallet.signAndSendTransaction({ receiverId: snap.assetId, methodName: 'report_fault', args: { rule_id: rule, note_hash }, deposit: 0n });
      setTx(r.txHash);
    } catch (e) {
      toast.showError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={t.faultTitle}>
      <p className="text-text-2">{t.faultBody}</p>
      <p className="flex flex-wrap items-center gap-2 text-xs text-text-3"><SimulatedBadge /> {t.simulatedNote}</p>
      {reportRules.length === 0 ? (
        <p className="text-due">{t.faultNoRule}</p>
      ) : (
        <>
          <label className="block">
            <span className="text-xs text-text-3">{t.faultRule}</span>
            <select value={rule} onChange={(e) => setRule(e.target.value)} className="field mt-1">
              {reportRules.map((r) => (
                <option key={r.rule_id} value={r.rule_id}>
                  {r.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-text-3">{t.faultNote}</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="field mt-1" />
          </label>
          <button type="button" disabled={busy || note.trim().length < 3} onClick={() => void send()} className="ck-btn">
            {t.faultSend}
          </button>
          {tx && (
            <p className="text-accent">
              {t.sent} <TxLink hash={tx} />
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

function ReturnPanel({ snap }: { snap: AssetSnapshot }) {
  const { t } = useLang();
  const wallet = useWallet();
  const ds = useDataSource();
  const toast = useToast();
  const action = useContractAction();
  const qc = useQueryClient();
  const [tx, setTx] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const manual = snap.profile.adapter === 'manual_qr';
  const roles = useQuery({
    queryKey: ['roles', ds.kind, snap.assetId, wallet.accountId],
    queryFn: () => ds.asset(snap.assetId).get_roles(wallet.accountId as string),
  });
  const loans = useQuery({ queryKey: ['manual', snap.assetId], enabled: manual, queryFn: () => manualSession(snap.assetId), retry: false });
  const isSteward = roles.data?.includes('steward') ?? false;
  const finished = snap.reservations.filter((r) => r.status === 'Finished');

  const confirm = async (target: { id: string; clean: boolean } | { loan: ManualLoan }) => {
    // A ref blocks even two clicks before React has rendered the pending state.
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    let contractSubmitted = false;
    try {
      if ('loan' in target) {
        await confirmManual(wallet, snap.assetId, target.loan, 'return');
        ds.invalidateViews?.();
        await qc.invalidateQueries();
        setTx('bridge');
      } else {
        const result = target.clean ? 'Clean' : { Damage: { note_hash: await sha256Hex(`damage:${snap.assetId}:${target.id}`) } };
        contractSubmitted = true;
        const r = await action.mutateAsync({ receiverId: snap.assetId, methodName: 'confirm_return', args: { id: target.id, result }, deposit: 0n });
        setTx(r.txHash);
      }
    } catch (e) {
      // Contract errors are already shown by useContractAction.
      if (!contractSubmitted) toast.showError(new Error(bridgeMessage(e)));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return (
    <Panel title={t.returnTitle}>
      <p className="text-text-2">{t.returnStewardOnly}</p>
      {busy && <p role="status">{t.returnPending}</p>}
      {manual ? (
        loans.isError ? (
          <p className="text-due">{t.bridgeUnreachable}</p>
        ) : (
          <ul className="space-y-2">
            {[...(loans.data?.current ? [loans.data.current] : []), ...(loans.data?.outstanding ?? [])].map((loan) => (
              <li key={loan.session_id} className="flex flex-wrap items-center gap-2">
                <span className="num">#{loan.reservation_id ?? '—'}</span>
                <button
                  type="button"
                  disabled={!isSteward || busy || loan.holder === wallet.accountId}
                  className="ck-btn ck-btn--sm"
                  onClick={() => void confirm({ loan })}
                >
                  {t.confirmManualReturn}
                </button>
              </li>
            ))}
            {loans.data && !loans.data.current && loans.data.outstanding.length === 0 && <li className="text-text-3">{t.returnNone}</li>}
          </ul>
        )
      ) : finished.length === 0 ? (
        <p className="text-text-3">{t.returnNone}</p>
      ) : (
        <ul className="space-y-2">
          {finished.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2">
              <span className="num">#{r.id}</span> <Account id={r.holder} />
              {r.session_finished_at && <span className="text-xs text-text-3">{formatDateTime(r.session_finished_at)}</span>}
              <button type="button" disabled={!isSteward || busy || r.holder === wallet.accountId} onClick={() => void confirm({ id: r.id, clean: true })} className="ck-btn ck-btn--sm">
                {t.confirmClean}
              </button>
              <button type="button" disabled={!isSteward || busy || r.holder === wallet.accountId} onClick={() => void confirm({ id: r.id, clean: false })} className="ck-btn ck-btn--sm ck-btn--danger">
                {t.reportDamage}
              </button>
            </li>
          ))}
        </ul>
      )}
      {tx && tx !== 'bridge' && <TxLink hash={tx} />}
      {tx === 'bridge' && <p className="text-accent">{t.sent}</p>}
    </Panel>
  );
}
