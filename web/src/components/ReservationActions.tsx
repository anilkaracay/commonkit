import type { Profile, Reservation } from '../data/types';
import { gasFor } from '../lib/gas';
import { slotStartNs } from '../lib/time';
import type { ContractCall } from '../wallet/wallet';
import { useWallet } from '../wallet/wallet';
import { useContractAction } from '../wallet/useContractAction';

/** cancel_reservation / mark_no_show call; 150 Tgas when the reservation holds a right (D-756). */
export function reservationCall(assetId: string, method: 'cancel_reservation' | 'mark_no_show', r: Reservation): ContractCall {
  return { receiverId: assetId, methodName: method, args: { id: r.id }, deposit: 0n, gas: gasFor(method, { usesRight: r.right_id !== null }) };
}

/** Holder: cancel before the start; anyone: mark a no-show after the start window closed. */
export function ReservationActions({ assetId, r, profile, nowMs }: { assetId: string; r: Reservation; profile: Profile; nowMs: number }) {
  const wallet = useWallet();
  const action = useContractAction();
  if (wallet.status !== 'connected' || r.status !== 'Confirmed') return null;
  const nowNs = BigInt(nowMs) * 1_000_000n;
  const startNs = slotStartNs(r.start_slot, profile.slot_minutes);
  const windowEndNs = startNs + BigInt(profile.start_window_minutes) * 60_000_000_000n;
  const send = (method: 'cancel_reservation' | 'mark_no_show') =>
    action.mutate(reservationCall(assetId, method, r));
  return (
    <>
      {r.holder === wallet.accountId && nowNs < startNs && (
        <button type="button" disabled={action.isPending} onClick={() => send('cancel_reservation')} className="text-xs text-danger hover:underline">
          {action.isPending ? 'confirming…' : 'cancel'}
        </button>
      )}
      {nowNs > windowEndNs && (
        <button type="button" disabled={action.isPending} onClick={() => send('mark_no_show')} className="text-xs text-accent hover:underline">
          {action.isPending ? 'confirming…' : 'mark no-show'}
        </button>
      )}
    </>
  );
}
