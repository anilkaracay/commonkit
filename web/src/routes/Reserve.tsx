import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAssetSnapshot, useDeployment } from '../data/hooks';
import { useDataSource } from '../data/source';
import { SimulatedBadge } from '../components/Badges';
import { LoadError, Loading } from '../components/Section';
import { WalletGate } from '../components/WalletGate';
import { useDemoLink } from '../demo/demo';
import { ERROR_MESSAGES } from '../lib/errors';
import { formatNear, toYocto } from '../lib/near';
import { formatDateTime, formatTime, slotOf, slotStartNs } from '../lib/time';
import { useWallet } from '../wallet/wallet';
import { Near } from '../components/Near';
import { TxLink } from '../components/TxLink';
import { useContractAction } from '../wallet/useContractAction';

const SHOWN = 16;

/** `/a/:assetId/reserve` — pick slots, see the exact attached amount, sign `reserve`. */
export function ReservePage() {
  const { assetId = '' } = useParams();
  const ds = useDataSource();
  const q = useAssetSnapshot(assetId);
  const dep = useDeployment();
  const wallet = useWallet();
  const action = useContractAction();
  const link = useDemoLink();
  const [start, setStart] = useState<number | null>(null);
  const [count, setCount] = useState(1);
  const [useRight, setUseRight] = useState(false);
  const [rightId, setRightId] = useState('');
  const member = useQuery({
    queryKey: ['reservation-member', ds.kind, assetId, wallet.accountId, q.data?.wiring.commons_id],
    enabled: !!wallet.accountId && !!q.data,
    queryFn: async () => {
      const account = wallet.accountId!;
      const [reputation, cards] = await Promise.all([
        ds.asset(assetId).get_reputation(account),
        ds.commons(q.data!.wiring.commons_id).get_cards_for_owner(account),
      ]);
      return { reputation, cards };
    },
  });

  const slotMinutes = q.data?.profile.slot_minutes ?? 60;
  const [bookingTime] = useState(() => ds.now());
  const firstSlot = slotOf(BigInt(bookingTime) * 1_000_000n, slotMinutes) + 1n;
  const avail = useQuery({
    queryKey: ['availability', ds.kind, assetId, firstSlot.toString(), SHOWN],
    enabled: !!q.data,
    queryFn: () => ds.asset(assetId).get_availability(firstSlot.toString(), SHOWN),
  });
  const reservationId = action.data?.reservationId;
  const booked = useQuery({
    queryKey: ['reservation-result', ds.kind, assetId, reservationId],
    enabled: reservationId !== undefined,
    queryFn: () => ds.asset(assetId).get_reservation(reservationId!),
    retry: 1,
  });
  const refreshBooking = () => {
    ds.invalidateViews?.();
    void booked.refetch();
  };

  if (q.error || avail.error || member.error) return <LoadError error={q.error ?? avail.error ?? member.error} />;
  if (!q.data || !avail.data) return <Loading what="availability" />;
  const p = q.data.profile;
  const rights = (member.data?.cards ?? []).filter((c) =>
    c.owner_id === wallet.accountId && !c.expired && (!c.expires_at || BigInt(c.expires_at) > BigInt(ds.now()) * 1_000_000n)
    && c.kind.type === 'UsageRight' && c.kind.group_id === p.group_id && c.kind.status.state === 'Active');
  const selectedRight = rights.find((c) => c.token_id === rightId) ?? rights[0];
  const rightMax = selectedRight?.kind.type === 'UsageRight' ? Math.min(p.right_max_slots, selectedRight.kind.max_slots) : p.right_max_slots;
  const memberReady = !wallet.accountId || !!member.data;
  const trusted = (member.data?.reputation.clean_returns ?? 0) >= p.trusted_after;
  const sim = p.adapter === 'simulator' || !!dep.data?.assets.find((a) => a.asset_id === assetId)?.simulated;
  // Holding reservation id per slot (null = free), from get_availability's SlotInfo list.
  const slots = avail.data.map((x) => x.reservation_id);

  const chosen = start === null ? [] : slots.slice(start, start + count);
  const taken = chosen.some((h) => h !== null) || (start !== null && start + count > slots.length);
  const tooMany = count > (useRight ? Math.min(p.max_slots_per_reservation, rightMax) : p.max_slots_per_reservation);
  const fee = useRight ? 0n : toYocto(p.price_per_slot) * BigInt(count);
  const baseDeposit = toYocto(trusted ? p.deposit_trusted : p.deposit);
  const deposit = useRight && baseDeposit < 10_000_000_000_000_000_000_000n ? 10_000_000_000_000_000_000_000n : baseDeposit;
  const attached = fee + deposit;
  const feeCutoff = start === null ? null : slotStartNs(firstSlot + BigInt(start), p.slot_minutes) - BigInt(p.slot_minutes) * 60_000_000_000n;
  const lateCancellation = feeCutoff !== null && BigInt(ds.now()) * 1_000_000n > feeCutoff;
  const protocolFee = p.protocol_fee_receiver ? fee * BigInt(p.protocol_fee_bps) / 10_000n : 0n;
  const rejectedAttached = booked.data ? toYocto(booked.data.fee_paid) + toYocto(booked.data.deposit_paid) : 0n;
  const storageCost = booked.data ? toYocto(booked.data.storage_cost) : 0n;
  const retainedStorage = storageCost < rejectedAttached ? storageCost : rejectedAttached;
  // The success refresh marks our submitted slots taken before the mutation settles.
  // That is not a new-selection conflict; clear the completed selection on success.
  const problem = start === null || action.isPending ? null : taken ? ERROR_MESSAGES.E_SLOT_TAKEN : tooMany ? ERROR_MESSAGES.E_TOO_MANY_SLOTS : null;

  const submit = () => {
    if (start === null || problem || !memberReady || action.isPending || (useRight && !selectedRight) || !q.data.service.in_service) return;
    action.mutate({
        receiverId: assetId,
        methodName: 'reserve',
        args: { start_slot: (firstSlot + BigInt(start)).toString(), slots: count, right_id: useRight ? selectedRight!.token_id : null },
        deposit: attached,
      }, { onSuccess: () => setStart(null) });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <div>
        <Link to={link(`/a/${assetId}`)} className="text-sm text-text-3 no-underline hover:text-accent">
          ← {q.data.meta.display_name}
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          <h1 className="display text-[34px] sm:text-[44px]">Reserve</h1>
          {sim && <SimulatedBadge />}
        </div>
        <p className="mt-2 text-sm text-text-3">
          {p.slot_minutes} min slots · up to {p.max_slots_per_reservation} · UTC
        </p>
      </div>

      {useRight && (
        <label className="block text-sm">
          Usage right
          <select className="field mt-2 block w-full" value={selectedRight?.token_id ?? ''} onChange={(e) => setRightId(e.target.value)} disabled={!rights.length || action.isPending}>
            {!rights.length && <option value="">No active usage rights for this machine</option>}
            {rights.map((c) => <option key={c.token_id} value={c.token_id}>{c.token_id} · {c.kind.type === 'UsageRight' ? c.kind.max_slots : 0} slots</option>)}
          </select>
        </label>
      )}

      {p.required_credential && (
        <p className="rounded-md bg-bg-alt p-4 text-sm text-text-2">
          Needs a <span className="font-mono text-xs text-text">{p.required_credential}</span> credential card. {ERROR_MESSAGES.E_CREDENTIAL_MISSING}
        </p>
      )}

      <fieldset className="mx-0 min-w-0 border-0 p-0">
        <legend className="mb-3 text-sm text-text-3">Pick a start slot</legend>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {slots.map((holder, i) => {
            const selected = start !== null && i >= start && i < start + count;
            return (
              <button
                key={i}
                type="button"
                disabled={holder !== null}
                onClick={() => setStart(i)}
                aria-pressed={selected}
                className={`rounded-sm py-2.5 text-center text-sm transition-colors ${
                  holder !== null
                    ? 'cursor-not-allowed bg-bg-alt text-text-3 line-through'
                    : selected
                      ? 'bg-accent font-medium text-on-accent'
                      : 'bg-surface shadow-[inset_0_0_0_1px_var(--ck-line-strong)] hover:shadow-[inset_0_0_0_1px_var(--ck-accent)]'
                }`}
              >
                <span className="num">{formatTime(slotStartNs(firstSlot + BigInt(i), p.slot_minutes))}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <label className="flex items-center gap-3 text-sm">
          Slots
          <input
            type="number"
            min={1}
            max={useRight ? Math.min(p.max_slots_per_reservation, rightMax) : p.max_slots_per_reservation}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.trunc(Number(e.target.value) || 1)))}
            className="field num w-20"
          />
        </label>
        <label className="flex items-start gap-2.5 text-sm text-text-2">
          <input type="checkbox" checked={useRight} onChange={(e) => setUseRight(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--ck-accent)]" />
          <span>
            Use a usage right (no fee, up to {p.right_max_slots} slots, group <span className="font-mono text-xs">{p.group_id}</span>)
          </span>
        </label>
      </div>

      {problem && (
        <p role="alert" className="rounded-md bg-danger-soft p-4 text-sm text-danger">
          {problem}
        </p>
      )}

      <div className="ck-card p-5 sm:p-6">
        <dl className="text-sm">
          <div className="flex justify-between gap-4 pb-3">
            <dt className="text-text-2">Fee {useRight ? '(paid by your right)' : `(${count} × ${formatNear(p.price_per_slot)})`}</dt>
            <dd className="whitespace-nowrap">
              <Near value={fee} />
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-line py-3">
            <dt className="text-text-2">
              Deposit
              <span className="block text-xs text-text-3">
                {trusted ? 'Trusted member deposit · ' : ''}Refunded after a clean return · {formatNear(p.deposit_trusted)} after {p.trusted_after} clean returns
              </span>
            </dt>
            <dd className="whitespace-nowrap">
              <Near value={deposit} />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-line pt-4">
            <dt className="font-medium">Attached exactly</dt>
            <dd className="key-num display whitespace-nowrap" style={{ ['--key-base' as string]: '1.75rem' }}>
              <Near value={attached} />
            </dd>
          </div>
        </dl>
        <div className="mt-5 space-y-2 text-sm text-text-2" aria-label="Cancellation policy">
          <p>Cancel at least {p.slot_minutes} min before start to refund the usage fee{protocolFee > 0n ? ' minus the protocol fee' : ''}. Later cancellations before start refund only the deposit. Gas is not refunded.</p>
          {feeCutoff !== null && fee > 0n && (
            <p>{lateCancellation
              ? `For this time, the ${formatNear(fee)} NEAR usage fee would be retained if you cancel; only the ${formatNear(deposit)} NEAR deposit would be refunded.`
              : `For this time, cancel by ${formatDateTime(feeCutoff)} to refund ${formatNear(fee - protocolFee)} NEAR of usage fee plus the ${formatNear(deposit)} NEAR deposit.`}</p>
          )}
          {useRight && <p>Cancelling releases your usage right and refunds the deposit; there is no usage fee to refund.</p>}
        </div>
        <div className="mt-6">
          <WalletGate action="Signing a reservation">
            <button type="button" disabled={start === null || !!problem || !memberReady || action.isPending || (useRight && !selectedRight) || !q.data.service.in_service} onClick={submit} className="ck-btn ck-btn--lg w-full sm:w-auto">
              {action.isPending ? 'Confirming reservation…' : 'Sign reserve'}
            </button>
          </WalletGate>
          {!q.data.service.in_service && <p role="alert" className="mt-3 text-sm">This machine is out of service.</p>}
          {action.data && <div className="mt-3 space-y-2 text-sm">
            <p>{reservationId === undefined ? 'Wallet returned a transaction.' : 'Transaction confirmed.'} <TxLink hash={action.data.txHash} label="View reservation transaction" /></p>
            {reservationId === undefined ? (
              <p role="status">This wallet did not return a reservation id, so booking authorization is not verified here.</p>
            ) : booked.isError ? (
              <p role="alert">Could not read reservation #{reservationId}. The transaction may have completed; check its status before booking again.</p>
            ) : !booked.data ? (
              <p role="status">{booked.isFetching ? `Reading reservation #${reservationId}…` : `Reservation #${reservationId} is not visible yet. Refresh its status before booking again.`}</p>
            ) : booked.data.status === 'Rejected' ? (
              <p role="alert">Reservation #{reservationId} was rejected. Expected refund: {formatNear(rejectedAttached - retainedStorage)} NEAR; {formatNear(retainedStorage)} NEAR retained for recorded storage. Check the refund operation in the machine's records. Gas is not refunded.</p>
            ) : (
              <p role="status">{booked.data.status === 'PendingAuthorization' ? `Reservation #${reservationId}: authorization pending. Wait for Confirmed before treating it as booked.` : `Reservation #${reservationId}: ${booked.data.status}.`}</p>
            )}
            {reservationId !== undefined && <button type="button" onClick={refreshBooking} disabled={booked.isFetching} className="text-link">Refresh booking status</button>}
            <p><Link to={`${link(`/a/${assetId}`)}#reservations`}>Check the live reservation and refund records</Link>. Transaction success alone does not prove booking authorization.</p>
          </div>}
        </div>
      </div>
    </div>
  );
}
