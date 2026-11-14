import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders, makeQueryClient } from '../App';
import { createMockSource } from '../data/mock/mockSource';
import { A } from '../data/mock/fixtures';
import type { DataSource } from '../data/source';
import type { Card, Reservation, Task } from '../data/types';
import { routes } from '../routes';
import { parseNear } from '../lib/near';
import type { WalletProvider } from '../wallet/wallet';

function setup(path: string, accountId: string = A.ayse, source = createMockSource(), result: Awaited<ReturnType<WalletProvider['signAndSendTransaction']>> = { txHash: 'confirmedTestTx' }) {
  const sign = vi.fn<WalletProvider['signAndSendTransaction']>(async () => result);
  const wallet: WalletProvider = { status: 'connected', accountId, connect: vi.fn(), disconnect: vi.fn(), signAndSendTransaction: sign, signMessage: vi.fn() };
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const clear = vi.fn();
  source.invalidateViews = clear;
  render(<AppProviders source={source} queryClient={makeQueryClient()} wallet={wallet}><RouterProvider router={router} /></AppProviders>);
  return { sign, clear, user: userEvent.setup() };
}

function reservationSource({ clean = 0, cards, trustedDeposit }: { clean?: number; cards?: Card[]; trustedDeposit?: string } = {}) {
  const source = createMockSource();
  const asset = source.asset;
  source.asset = (id) => {
    const a = asset(id);
    return { ...a,
      get_reputation: async () => ({ sessions: clean, clean_returns: clean, damages: 0, upkeeps: 0, fault_reports: 0 }),
      get_profile: async () => ({ ...await a.get_profile(), ...(trustedDeposit ? { deposit_trusted: trustedDeposit } : {}) }),
    };
  };
  if (cards) {
    const commons = source.commons;
    source.commons = (id) => ({ ...commons(id), get_cards_for_owner: async () => cards });
  }
  return source;
}

async function chooseSlot(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText('Attached exactly');
  const slots = screen.getAllByRole('button', { pressed: false });
  await user.click(slots.find((b) => !(b as HTMLButtonElement).disabled)!);
}

describe('reservation wallet transactions', () => {
  it('clears its completed selection after availability refresh without hiding a later real conflict', async () => {
    const source = reservationSource();
    const asset = source.asset;
    const base = (await asset(A.printer).get_reservations(0, 1))[0]!;
    let availabilityReads = 0;
    source.asset = (id) => ({ ...asset(id),
      get_reservation: async () => ({ ...base, id: '42', status: 'Confirmed' }),
      get_availability: async (...args) => {
        const slots = await asset(id).get_availability(...args);
        if (++availabilityReads > 1) {
          slots[0] = { ...slots[0]!, reservation_id: '42' };
          slots[2] = { ...slots[2]!, reservation_id: 'another-booking' };
        }
        return slots;
      },
    });
    const { sign, user } = setup(`/a/${A.printer}/reserve`, A.ali, source, { txHash: 'txWithReturnedId', reservationId: '42' });
    await chooseSlot(user);
    await user.click(screen.getByRole('button', { name: 'Sign reserve' }));
    await screen.findByText('Reservation #42: Confirmed.');
    expect(screen.getByRole('button', { name: '10:30' })).toBeDisabled();
    expect(screen.queryByText('Someone already booked one of these slots. Pick another time.')).toBeNull();
    const submit = screen.getByRole('button', { name: 'Sign reserve' });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(sign).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '11:00' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Slots' }), { target: { value: '2' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Someone already booked one of these slots');
    expect(submit).toBeDisabled();
    expect(sign).toHaveBeenCalledTimes(1);
  });

  it.each(['Confirmed', 'Rejected'] as const)('shows exact booking state %s instead of inferring it from transaction success', async (status) => {
    const source = reservationSource();
    const asset = source.asset;
    const base = (await asset(A.printer).get_reservations(0, 1))[0]!;
    source.asset = (id) => ({ ...asset(id), get_reservation: async () => ({ ...base, id: '42', status, fee_paid: parseNear('0.25').toString(), deposit_paid: parseNear('2').toString(), storage_cost: parseNear('0.003').toString() }) });
    const { user } = setup(`/a/${A.printer}/reserve`, A.ali, source, { txHash: 'txWithReturnedId', reservationId: '42' });
    await chooseSlot(user);
    await user.click(screen.getByRole('button', { name: 'Sign reserve' }));
    if (status === 'Confirmed') expect(await screen.findByText('Reservation #42: Confirmed.')).toBeInTheDocument();
    else {
      expect(await screen.findByText(/Reservation #42 was rejected/)).toHaveTextContent('Expected refund: 2.247 NEAR; 0.003 NEAR retained for recorded storage');
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Slots' }), { target: { value: '2' } });
      expect(screen.getByText(/Reservation #42 was rejected/)).toHaveTextContent('Expected refund: 2.247 NEAR; 0.003 NEAR retained for recorded storage');
    }
  });

  it('keeps a pending authorization distinct and refreshes it to Confirmed', async () => {
    const source = reservationSource();
    const asset = source.asset;
    let reservation: Reservation = { ...(await asset(A.printer).get_reservations(0, 1))[0]!, id: '42', status: 'PendingAuthorization' };
    source.asset = (id) => ({ ...asset(id), get_reservation: async () => reservation });
    const { user } = setup(`/a/${A.printer}/reserve`, A.ali, source, { txHash: 'txWithReturnedId', reservationId: '42' });
    await chooseSlot(user);
    await user.click(screen.getByRole('button', { name: 'Sign reserve' }));
    expect(await screen.findByText(/Reservation #42: authorization pending/)).toBeInTheDocument();
    reservation = { ...reservation, status: 'Confirmed' };
    await user.click(screen.getByRole('button', { name: 'Refresh booking status' }));
    expect(await screen.findByText('Reservation #42: Confirmed.')).toBeInTheDocument();
  });

  it('does not claim booking authorization when the wallet returns only a hash', async () => {
    const { user } = setup(`/a/${A.printer}/reserve`, A.ali);
    await chooseSlot(user);
    await user.click(screen.getByRole('button', { name: 'Sign reserve' }));
    expect(await screen.findByText(/booking authorization is not verified here/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Check the live reservation and refund records' })).toHaveAttribute('href', `/a/${A.printer}#reservations`);
    expect(screen.queryByText(/Reservation #[0-9]+: Confirmed/)).toBeNull();
  });

  it('recovers an exact booking-state read failure without sending another transaction', async () => {
    const source = reservationSource();
    const asset = source.asset;
    const base = (await asset(A.printer).get_reservations(0, 1))[0]!;
    let unavailable = true;
    source.asset = (id) => ({ ...asset(id), get_reservation: async () => {
      if (unavailable) throw new Error('Temporary status-read outage');
      return { ...base, id: '42', status: 'Confirmed' };
    } });
    const { sign, user } = setup(`/a/${A.printer}/reserve`, A.ali, source, { txHash: 'txWithReturnedId', reservationId: '42' });
    await chooseSlot(user);
    await user.click(screen.getByRole('button', { name: 'Sign reserve' }));
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent('check its status before booking again');
    unavailable = false;
    await user.click(screen.getByRole('button', { name: 'Refresh booking status' }));
    expect(await screen.findByText('Reservation #42: Confirmed.')).toBeInTheDocument();
    expect(sign).toHaveBeenCalledTimes(1);
  });

  it('discloses the retained fee for the nearest time before the wallet signs', async () => {
    const source = reservationSource();
    source.now = () => Date.UTC(2026, 10, 12, 10, 5);
    const { sign, user } = setup(`/a/${A.printer}/reserve`, A.ali, source);
    await chooseSlot(user);
    expect(screen.getByText(/Cancel at least 30 min before start/)).toBeInTheDocument();
    expect(screen.getByText(/For this time, the 0.25 NEAR usage fee would be retained/)).toHaveTextContent('only the 2 NEAR deposit would be refunded');
    expect(sign).not.toHaveBeenCalled();
  });

  it('shows the exact UTC cutoff for a later refundable booking', async () => {
    const source = reservationSource();
    source.now = () => Date.UTC(2026, 10, 12, 10, 5);
    const { sign, user } = setup(`/a/${A.printer}/reserve`, A.ali, source);
    await screen.findByText('Attached exactly');
    await user.click(screen.getByRole('button', { name: '11:00' }));
    expect(screen.getByText(/For this time, cancel by 12 Nov 10:30 UTC/)).toHaveTextContent('refund 0.25 NEAR of usage fee plus the 2 NEAR deposit');
    expect(sign).not.toHaveBeenCalled();
  });

  it('sends the selected earned right, zero fee and the trusted deposit', async () => {
    const { sign, clear, user } = setup(`/a/${A.printer}/reserve`, A.ayse, reservationSource({ clean: 3 }));
    await chooseSlot(user);
    await user.click(screen.getByRole('checkbox', { name: /Use a usage right/ }));
    await screen.findByRole('option', { name: /right-3/ });
    expect(screen.queryByRole('option', { name: /right-2/ })).toBeNull(); // locked on another booking
    expect(screen.queryByRole('option', { name: /right-1/ })).toBeNull(); // consumed
    await user.selectOptions(screen.getByRole('combobox', { name: 'Usage right' }), 'right-3');
    await user.click(screen.getByRole('button', { name: 'Sign reserve' }));
    await waitFor(() => expect(sign).toHaveBeenCalledTimes(1));
    expect(sign.mock.calls[0]?.[0]).toMatchObject({ receiverId: A.printer, methodName: 'reserve', args: { slots: 1, right_id: 'right-3' }, deposit: parseNear('0.5') });
    await screen.findByRole('link', { name: 'View reservation transaction' });
    expect(clear).toHaveBeenCalled();
  });

  it('uses the reduced deposit for a paid booking by a trusted member', async () => {
    const { sign, user } = setup(`/a/${A.printer}/reserve`, A.ayse, reservationSource({ clean: 3 }));
    await chooseSlot(user);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign reserve' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Sign reserve' }));
    await waitFor(() => expect(sign).toHaveBeenCalled());
    expect(sign.mock.calls[0]?.[0]).toMatchObject({ args: { right_id: null }, deposit: parseNear('0.75') });
  });

  it('requires an eligible card before sending a right-based booking', async () => {
    const { sign, user } = setup(`/a/${A.printer}/reserve`, A.ayse, reservationSource({ cards: [] }));
    await chooseSlot(user);
    await user.click(screen.getByRole('checkbox', { name: /Use a usage right/ }));
    expect(screen.getByRole('button', { name: 'Sign reserve' })).toBeDisabled();
    expect(sign).not.toHaveBeenCalled();
  });

  it('enforces the 0.01 NEAR storage deposit when a right holder qualifies for zero deposit', async () => {
    const { sign, user } = setup(`/a/${A.printer}/reserve`, A.ayse, reservationSource({ clean: 3, trustedDeposit: '0' }));
    await chooseSlot(user);
    await user.click(screen.getByRole('checkbox', { name: /Use a usage right/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign reserve' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Sign reserve' }));
    await waitFor(() => expect(sign).toHaveBeenCalled());
    expect(sign.mock.calls[0]?.[0]).toMatchObject({ deposit: parseNear('0.01') });
  });
});

describe('training wallet transactions', () => {
  it('lets a trainer propose a credential for a different account', async () => {
    const { sign, user } = setup('/train');
    await user.type(await screen.findByRole('textbox', { name: 'Trainee testnet account' }), 'new-member.testnet');
    await user.click(screen.getByRole('button', { name: 'Propose credential' }));
    await waitFor(() => expect(sign).toHaveBeenCalledWith({ receiverId: A.makerCommons, methodName: 'propose_credential', args: { trainee: 'new-member.testnet', kind: 'laser_safety', notes_hash: null }, deposit: 0n }));
  });

  it('prevents self-training before asking a wallet to sign', async () => {
    const { sign, user } = setup('/train');
    await user.type(await screen.findByRole('textbox', { name: 'Trainee testnet account' }), A.ayse);
    expect(screen.getByRole('button', { name: 'Propose credential' })).toBeDisabled();
    expect(sign).not.toHaveBeenCalled();
  });

  it('lets an independent verifier approve a proposed credential', async () => {
    const source = createMockSource();
    const commons = source.commons;
    source.commons = (id) => {
      const c = commons(id);
      return { ...c, get_trainings: async (from, limit) => (await c.get_trainings(from, limit)).map((t) => ({ ...t, status: 'Proposed' as const, approver: null, minted: [] })) };
    };
    const { sign, user } = setup('/train', A.mehmet, source);
    await user.click(await screen.findByRole('button', { name: 'Approve credential' }));
    await waitFor(() => expect(sign).toHaveBeenCalledWith({ receiverId: A.makerCommons, methodName: 'approve_credential', args: { training_id: '1' }, deposit: 0n }));
  });
});

function taskSource(patch: Partial<Task> = {}, roles: string[] = []): DataSource {
  const source = createMockSource();
  const asset = source.asset;
  source.asset = (id) => {
    const a = asset(id);
    return { ...a,
      get_tasks: async (from, limit, status) => (await a.get_tasks(from, limit, status)).map((t) => t.id === '2' ? { ...t, ...patch } : t),
      get_roles: async () => roles as Awaited<ReturnType<typeof a.get_roles>>,
    };
  };
  return source;
}

describe('upkeep wallet transactions', () => {
  it('keeps the task opening threshold visible after the DAO restores the live rule', async () => {
    setup(`/t/${A.printer}/2`, A.ayse, taskSource({ trigger: { Metric: { metric: 'jobs_total', threshold: 5 } } }));
    expect(await screen.findByText(/The DAO has since changed this rule/)).toBeInTheDocument();
    expect(screen.getByText(/Rule recorded when this task opened/)).toBeInTheDocument();
  });
  it('claims an open task and links the confirmed transaction', async () => {
    const { sign, clear, user } = setup(`/t/${A.printer}/2`, A.ayse, taskSource({ status: 'Open', claimer: null }));
    await user.click(await screen.findByRole('button', { name: 'Claim' }));
    await waitFor(() => expect(sign).toHaveBeenCalledWith({ receiverId: A.printer, methodName: 'claim_task', args: { task_id: '2' }, deposit: 0n }));
    await screen.findByRole('link', { name: 'View task transaction' });
    expect(clear).toHaveBeenCalled();
  });

  it('only allows the claimer to submit evidence', async () => {
    setup(`/t/${A.printer}/2`, A.ayse, taskSource({ status: 'Claimed', claimer: A.ali }));
    expect(await screen.findByText('This task has been claimed by another member.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit evidence' })).toBeNull();
  });

  it('hashes evidence locally, then sends its digest with no photo or URI', async () => {
    const digest = vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new Uint8Array(32).fill(0xab).buffer);
    const { sign, user } = setup(`/t/${A.printer}/2`, A.ayse, taskSource({ status: 'Claimed', claimer: A.ayse }));
    const submit = await screen.findByRole('button', { name: 'Submit evidence' });
    expect(submit).toBeDisabled();
    const file = new File(['test evidence'], 'work.png', { type: 'image/png' });
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(4) });
    fireEvent.change(screen.getByLabelText(/Evidence photo/), { target: { files: [file] } });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);
    await waitFor(() => expect(sign).toHaveBeenCalledWith({ receiverId: A.printer, methodName: 'submit_task', deposit: 0n, args: { task_id: '2', evidence_hash: 'ab'.repeat(32), evidence_uri: null, expense: '0', receipt_hash: null } }));
    digest.mockRestore();
  });

  it('requires a passed bridge test before independent verification', async () => {
    const { sign } = setup(`/t/${A.printer}/2`, A.mehmet, taskSource({ status: 'Submitted', claimer: A.ayse, verifier: null, requires_verification_test: true, verification: null }, ['verifier']));
    expect(await screen.findByRole('button', { name: 'Approve task' })).toBeDisabled();
    expect(sign).not.toHaveBeenCalled();
  });

  it('does not offer self-approval even when the worker is a verifier', async () => {
    setup(`/t/${A.printer}/2`, A.ayse, taskSource({ status: 'Submitted', claimer: A.ayse, verifier: null }, ['verifier', 'council']));
    await screen.findByText('Why the machine asked');
    expect(screen.queryByRole('button', { name: 'Approve task' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Give council approval' })).toBeNull();
  });

  it('approves the actual Submitted + verifier + needs_council contract state', async () => {
    const { sign, user } = setup(`/t/${A.printer}/2`, A.hakan, taskSource({ status: 'Submitted', claimer: A.ayse, verifier: A.mehmet, needs_council: true, requires_verification_test: false }, ['council']));
    await user.click(await screen.findByRole('button', { name: 'Give council approval' }));
    await waitFor(() => expect(sign).toHaveBeenCalledWith({ receiverId: A.printer, methodName: 'council_approve_task', args: { task_id: '2' }, deposit: 0n }));
  });
});
