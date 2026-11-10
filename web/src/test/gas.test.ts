// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GAS, TGAS, gasFor } from '../lib/gas';
import { reservationCall } from '../components/ReservationActions';
import type { Reservation } from '../data/types';

const res = (right_id: string | null): Reservation => ({
  id: '7', holder: 'ali.testnet', start_slot: '100', slots: 1, fee_paid: '0', protocol_fee: '0', deposit_paid: '0', right_id,
  status: 'Confirmed', created_at: '0', session_started_at: null, session_finished_at: null, metrics_delta: null,
  return_result: null, right_op_id: null, storage_cost: '0', fee_refund_owed: '0',
});

describe('attached gas mirrors CONTRACT_SPEC §8', () => {
  it('cancel and no-show attach 150 Tgas when a right is involved, 60 otherwise (D-756)', () => {
    expect(gasFor('cancel_reservation', { usesRight: true })).toBe(150n * TGAS);
    expect(gasFor('mark_no_show', { usesRight: true })).toBe(150n * TGAS);
    expect(gasFor('cancel_reservation')).toBe(60n * TGAS);
    expect(reservationCall('a.testnet', 'cancel_reservation', res('right-3')).gas).toBe(GAS.releasesRight);
    expect(reservationCall('a.testnet', 'mark_no_show', res(null)).gas).toBe(GAS.noRight);
    expect(reservationCall('a.testnet', 'cancel_reservation', res('right-3')).args).toEqual({ id: '7' });
  });

  it('other methods follow the table', () => {
    expect(gasFor('reserve')).toBe(120n * TGAS);
    expect(gasFor('confirm_return')).toBe(60n * TGAS);
    expect(gasFor('approve_task')).toBeGreaterThanOrEqual(125n * TGAS);
    expect(gasFor('sync_escalation')).toBe(50n * TGAS);
    expect(gasFor('report_fault')).toBe(30n * TGAS);
  });
});
