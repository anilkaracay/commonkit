import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAssetSnapshot, useDeployment } from '../data/hooks';
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
import { Near } from '../components/Near';

const SHOWN = 16;

/** `/a/:assetId/reserve` — pick slots, see the exact attached amount, sign `reserve`. */
export function ReservePage() {
  const { assetId = '' } = useParams();
  const ds = useDataSource();
  const q = useAssetSnapshot(assetId);
  const dep = useDeployment();
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
  const sim = p.adapter === 'simulator' || !!dep.data?.assets.find((a) => a.asset_id === assetId)?.simulated;
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
            max={8}
            value={count}
            onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
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
                Refunded after a clean return · {formatNear(p.deposit_trusted)} after {p.trusted_after} clean returns
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
        <div className="mt-6">
          <WalletGate action="Signing a reservation">
            <button type="button" disabled={start === null || !!problem} onClick={() => void submit()} className="ck-btn ck-btn--lg w-full sm:w-auto">
              Sign reserve
            </button>
          </WalletGate>
        </div>
      </div>
    </div>
  );
}
