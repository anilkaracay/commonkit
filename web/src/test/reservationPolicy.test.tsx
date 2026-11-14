import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders, makeQueryClient } from '../App';
import { ReservationActions } from '../components/ReservationActions';
import { createMockSource } from '../data/mock/mockSource';
import { A } from '../data/mock/fixtures';
import type { Reservation } from '../data/types';
import { parseNear } from '../lib/near';
import type { WalletProvider } from '../wallet/wallet';
import { routes } from '../routes';

const startMs = Date.parse('2026-11-14T14:00:00Z');
const r: Reservation = {
  id: '21', holder: A.ali, start_slot: String(startMs / (30 * 60_000)), slots: 1,
  fee_paid: parseNear('0.25').toString(), protocol_fee: '0', deposit_paid: parseNear('2').toString(), right_id: null,
  status: 'Confirmed', created_at: '0', session_started_at: null, session_finished_at: null, metrics_delta: null,
  return_result: null, right_op_id: null, storage_cost: '0', fee_refund_owed: '0',
};

async function show({ beforeMinutes = 30, inService = true, floatFree = '3', reservation = r } = {}) {
  const source = createMockSource();
  const profile = await source.asset(A.printer).get_profile();
  const wallet: WalletProvider = { status: 'connected', accountId: A.ali, connect: vi.fn(), disconnect: vi.fn(), signMessage: vi.fn(), signAndSendTransaction: vi.fn() };
  render(<AppProviders source={source} wallet={wallet} queryClient={makeQueryClient()}><RouterProvider router={createMemoryRouter([{ path: '/', element: <ReservationActions assetId={A.printer} r={reservation} profile={profile} nowMs={startMs - beforeMinutes * 60_000} inService={inService} floatFree={parseNear(floatFree).toString()} /> }])} /></AppProviders>);
}

describe('cancellation amount shown before signing', () => {
  it('keeps the cancellation transaction visible after refreshed chain state is Cancelled', async () => {
    const source = createMockSource();
    const asset = source.asset;
    let cancelled = false;
    source.asset = (id) => ({ ...asset(id), get_reservations: async () => [{ ...r, status: cancelled ? 'Cancelled' : 'Confirmed' }] });
    const wallet: WalletProvider = {
      status: 'connected', accountId: A.ali, connect: vi.fn(), disconnect: vi.fn(), signMessage: vi.fn(),
      signAndSendTransaction: vi.fn(async () => { cancelled = true; return { txHash: 'cancelConfirmedTx' }; }),
    };
    render(<AppProviders source={source} wallet={wallet} queryClient={makeQueryClient()}><RouterProvider router={createMemoryRouter(routes, { initialEntries: [`/a/${A.printer}`] })} /></AppProviders>);
    fireEvent.click(await screen.findByRole('button', { name: 'cancel' }));
    await screen.findByText('Cancelled');
    expect(await screen.findByRole('link', { name: 'View cancellation transaction' })).toHaveAttribute('href', expect.stringContaining('cancelConfirmedTx'));
    expect(screen.queryByRole('button', { name: 'cancel' })).toBeNull();
  });

  it('includes fee exactly at the one-slot cutoff', async () => {
    await show();
    expect(screen.getByText(/Cancel now: 2.25 NEAR refund/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'cancel' })).toBeEnabled();
  });
  it('shows deposit only and the retained fee just inside the cutoff', async () => {
    await show({ beforeMinutes: 29.99 });
    expect(screen.getByText(/Cancel now: 2 NEAR refund/)).toHaveTextContent('0.25 NEAR usage fee is retained: less than 30 min before start');
  });
  it('excludes a configured protocol fee from the early refund', async () => {
    await show({ reservation: { ...r, protocol_fee: parseNear('0.01').toString() } });
    expect(screen.getByText(/Cancel now: 2.24 NEAR refund/)).toBeInTheDocument();
  });
  it('offers out-of-service cancellation after start and distinguishes a fee still owed', async () => {
    await show({ beforeMinutes: -10, inService: false, floatFree: '0.1' });
    expect(screen.getByRole('button', { name: 'cancel' })).toBeEnabled();
    expect(screen.getByText(/Cancel now: 2 NEAR refund/)).toHaveTextContent('0.25 NEAR usage fee owed until the machine is funded');
  });
  it('disables an early cancellation whose fee the live float cannot cover', async () => {
    await show({ floatFree: '0.1' });
    expect(screen.getByRole('button', { name: 'cancel' })).toBeDisabled();
    expect(screen.getByText(/machine needs funding/)).toBeInTheDocument();
  });
  it('shows only the paid deposit for a right-based reservation', async () => {
    await show({ reservation: { ...r, fee_paid: '0', right_id: 'right-4', deposit_paid: parseNear('0.01').toString() } });
    expect(screen.getByText(/Cancel now: 0.01 NEAR refund/)).toBeInTheDocument();
    expect(screen.queryByText(/usage fee is retained/)).toBeNull();
  });
});
