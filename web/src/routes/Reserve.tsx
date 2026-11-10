import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAssetSnapshot } from '../data/hooks';
import { useDataSource } from '../data/source';
import { SimulatedBadge } from '../components/Badges';
import { LoadError, Loading } from '../components/Section';
import { useToast } from '../components/Toast';
import { WalletGate } from '../components/WalletGate';
import { useDemoLink } from '../demo/demo';
import { ERROR_MESSAGES } from '../lib/errors';
import { formatNear, toYocto } from '../lib/near';
import { formatTime, slotOf, slotStartNs } from '../lib/time';
import { useWallet } from '../wallet/wallet';

const SHOWN = 16;

/** `/a/:assetId/reserve` — pick slots, see the exact attached amount, sign `reserve`. */
export function ReservePage() {
  const { assetId = '' } = useParams();
  const ds = useDataSource();
  const q = useAssetSnapshot(assetId);
  const wallet = useWallet();
  const toast = useToast();
  const link = useDemoLink();
  const [start, setStart] = useState<number | null>(null);
  const [count, setCount] = useState(1);
  const [useRight, setUseRight] = useState(false);

  const slotMinutes = q.data?.profile.slot_minutes ?? 60;
  const firstSlot = slotOf(BigInt(ds.now()) * 1_000_000n, slotMinutes) + 1n;
  const avail = useQuery({
    queryKey: ['availability', ds.kind, assetId, firstSlot.toString(), SHOWN],
    enabled: !!q.data,
    queryFn: () => ds.asset(assetId).get_availability(firstSlot.toString(), SHOWN),
  });

  if (q.error) return <LoadError error={q.error} />;
  if (!q.data || !avail.data) return <Loading what="availability" />;
  const p = q.data.profile;
  const sim = p.adapter === 'simulator';
  // Holding reservation id per slot (null = free), from get_availability's SlotInfo list.
  const slots = avail.data.map((x) => x.reservation_id);

  const chosen = start === null ? [] : slots.slice(start, start + count);
  const taken = chosen.some((h) => h !== null) || (start !== null && start + count > slots.length);
  const tooMany = count > (useRight ? p.right_max_slots : p.max_slots_per_reservation);
  const fee = useRight ? 0n : toYocto(p.price_per_slot) * BigInt(count);
  const deposit = toYocto(p.deposit);
  const attached = fee + deposit;
  const problem = start === null ? null : taken ? ERROR_MESSAGES.E_SLOT_TAKEN : tooMany ? ERROR_MESSAGES.E_TOO_MANY_SLOTS : null;

  const submit = () =>
    wallet
      .signAndSendTransaction({
        receiverId: assetId,
        methodName: 'reserve',
        args: { start_slot: (firstSlot + BigInt(start ?? 0)).toString(), slots: count, right_id: null },
        deposit: attached,
      })
      .catch((e: unknown) => toast.showError(e));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link to={link(`/a/${assetId}`)} className="text-sm text-ink-2 hover:underline">
          ← {q.data.meta.display_name}
        </Link>
        <h1 className="mt-1 flex flex-wrap items-center gap-3 text-3xl font-extrabold">
          Reserve {sim && <SimulatedBadge />}
        </h1>
        <p className="text-sm text-ink-2">
          {p.slot_minutes}-minute slots, up to {p.max_slots_per_reservation} per reservation. Times in UTC.
        </p>
      </div>

      {p.required_credential && (
        <p className="rounded-tag border border-cred/40 bg-danger-soft p-3 text-sm">
          This machine needs a <span className="num font-semibold">{p.required_credential}</span> credential card. Without it the contract rejects
          the reservation and refunds everything: <em>{ERROR_MESSAGES.E_CREDENTIAL_MISSING}</em>
        </p>
      )}

      <fieldset>
        <legend className="eyebrow mb-2">Pick a start slot</legend>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
          {slots.map((holder, i) => {
            const selected = start !== null && i >= start && i < start + count;
            return (
              <button
                key={i}
                type="button"
                disabled={holder !== null}
                onClick={() => setStart(i)}
                aria-pressed={selected}
                className={`rounded-md border px-1 py-2 text-center text-xs ${
                  holder !== null
                    ? 'cursor-not-allowed border-transparent bg-surface-2 text-ink-3 line-through'
                    : selected
                      ? 'border-alive bg-alive text-paper'
                      : 'border-line-strong bg-surface hover:border-ink'
                }`}
              >
                <span className="num">{formatTime(slotStartNs(firstSlot + BigInt(i), p.slot_minutes))}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          Slots
          <input
            type="number"
            min={1}
            max={8}
            value={count}
            onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
            className="num w-16 rounded-md border border-line-strong bg-surface px-2 py-1"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={useRight} onChange={(e) => setUseRight(e.target.checked)} />
          Use a usage right (no fee, up to {p.right_max_slots} slots, same group <span className="num">{p.group_id}</span>)
        </label>
      </div>

      {problem && (
        <p role="alert" className="rounded-tag bg-danger-soft p-3 text-sm text-danger">
          {problem}
        </p>
      )}

      <dl className="tag divide-y divide-line text-sm">
        <div className="flex justify-between p-3">
          <dt>Fee {useRight ? '(paid by your right)' : `(${count} × ${formatNear(p.price_per_slot)})`}</dt>
          <dd className="num">{formatNear(fee)} NEAR</dd>
        </div>
        <div className="flex justify-between p-3">
          <dt>
            Deposit <span className="text-xs text-ink-3">refunded after a clean return · {formatNear(p.deposit_trusted)} after {p.trusted_after} clean returns</span>
          </dt>
          <dd className="num">{formatNear(deposit)} NEAR</dd>
        </div>
        <div className="flex justify-between p-3 font-semibold">
          <dt>Attached exactly</dt>
          <dd className="num key-num" style={{ ['--key-base' as string]: '1.1rem' }}>
            {formatNear(attached)} NEAR
          </dd>
        </div>
      </dl>
      <p className="text-xs text-ink-3">The contract checks the amount to the yocto; anything else fails with: {ERROR_MESSAGES.E_WRONG_AMOUNT}</p>

      <WalletGate action="Signing a reservation">
        <button type="button" disabled={start === null || !!problem} onClick={() => void submit()} className="rounded-full bg-ink px-5 py-2 font-medium text-paper disabled:opacity-50">
          Sign reserve
        </button>
      </WalletGate>
    </div>
  );
}
