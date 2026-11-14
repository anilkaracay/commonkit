import { describe, expect, it } from 'vitest';
import { reservationIdOf } from '../wallet/nearConnect';

describe('exact reservation ids from full wallet outcomes', () => {
  it('decodes the real reserve outcome shape and preserves U64 precision', () => {
    expect(reservationIdOf({ status: { SuccessValue: 'IjMi' } })).toBe('3');
    expect(reservationIdOf({ status: { SuccessValue: btoa('"18446744073709551615"') } })).toBe('18446744073709551615');
    expect(reservationIdOf({ status: { SuccessValue: btoa('"0"') } })).toBe('0');
  });
  it.each([null, {}, { transaction: { hash: 'hash-only' } }, { status: { SuccessValue: '' } }, { status: { SuccessValue: btoa('true') } }, { status: { SuccessValue: btoa('3') } }, { status: { SuccessValue: btoa('"-1"') } }, { status: { SuccessValue: btoa('"18446744073709551616"') } }, { receipts_outcome: [{ outcome: { status: { SuccessValue: btoa('"7"') } } }] }])('does not invent an id from an unknown response: %j', (outcome) => {
    expect(reservationIdOf(outcome)).toBeUndefined();
  });
});
