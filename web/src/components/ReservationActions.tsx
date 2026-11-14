import type { Profile, Reservation } from '../data/types';
import { gasFor } from '../lib/gas';
import { slotStartNs } from '../lib/time';
import { formatNear, toYocto } from '../lib/near';
import type { ContractCall } from '../wallet/wallet';
import { useWallet } from '../wallet/wallet';
import { useContractAction } from '../wallet/useContractAction';
import { TxLink } from './TxLink';

/** cancel_reservation / mark_no_show call; 150 Tgas when the reservation holds a right (D-756). */
export function reservationCall(assetId: string, method: 'cancel_reservation' | 'mark_no_show', r: Reservation): ContractCall {
  return { receiverId: assetId, methodName: method, args: { id: r.id }, deposit: 0n, gas: gasFor(method, { usesRight: r.right_id !== null }) };
}

/** Holder: cancel before the start; anyone: mark a no-show after the start window closed. */
export function ReservationActions({ assetId, r, profile, nowMs, inService = true, floatFree }: { assetId: string; r: Reservation; profile: Profile; nowMs: number; inService?: boolean; floatFree?: string }) {
  const wallet = useWallet();
  const action = useContractAction();
  const receipt = action.data && <TxLink hash={action.data.txHash} label={action.variables?.methodName === 'mark_no_show' ? 'View no-show transaction' : 'View cancellation transaction'} />;
  if (wallet.status !== 'connected' || r.status !== 'Confirmed') return receipt ?? null;
  const nowNs = BigInt(nowMs) * 1_000_000n;
  const startNs = slotStartNs(r.start_slot, profile.slot_minutes);
  const windowEndNs = startNs + BigInt(profile.start_window_minutes) * 60_000_000_000n;
  const early = nowNs + BigInt(profile.slot_minutes) * 60_000_000_000n <= startNs;
  const fee = !inService || early ? toYocto(r.fee_paid) - toYocto(r.protocol_fee) : 0n;
  const deposit = toYocto(r.deposit_paid);
  const short = floatFree !== undefined && toYocto(floatFree) < fee;
  const feeOwed = !inService && short ? fee : 0n;
  const refund = deposit + fee - feeOwed;
  const send = (method: 'cancel_reservation' | 'mark_no_show') =>
    action.mutate(reservationCall(assetId, method, r));
  return (
    <>
      {r.holder === wallet.accountId && (!inService || nowNs < startNs) && (
        <>
        <p className="max-w-56 text-right text-xs text-text-3">
          Cancel now: {formatNear(refund)} NEAR refund
          {feeOwed > 0n ? `; ${formatNear(feeOwed)} NEAR usage fee owed until the machine is funded.` : '.'}
          {inService && !early && toYocto(r.fee_paid) > 0n && ` The ${formatNear(r.fee_paid)} NEAR usage fee is retained: less than ${profile.slot_minutes} min before start.`}
          {inService && short && ' The machine needs funding before it can refund the fee.'}
          {' Gas is not refunded.'}
        </p>
        <button type="button" disabled={action.isPending || (inService && short)} onClick={() => send('cancel_reservation')} className="text-xs text-danger hover:underline">
          {action.isPending ? 'confirming…' : 'cancel'}
        </button>
        </>
      )}
      {nowNs > windowEndNs && (
        <button type="button" disabled={action.isPending} onClick={() => send('mark_no_show')} className="text-xs text-accent hover:underline">
          {action.isPending ? 'confirming…' : 'mark no-show'}
        </button>
      )}
      {receipt}
    </>
  );
}
