import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders, makeQueryClient } from '../App';
import { createMockSource } from '../data/mock/mockSource';
import { A } from '../data/mock/fixtures';
import { routes } from '../routes';
import type { WalletProvider } from '../wallet/wallet';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup(manual = false) {
  const source = createMockSource();
  const asset = source.asset;
  let returned = false;
  source.asset = (id) => ({ ...asset(id),
    get_profile: async () => ({ ...await asset(id).get_profile(), ...(manual ? { adapter: 'manual_qr' } : {}) }),
    get_reservations: async (...args) => (await asset(id).get_reservations(...args)).map((r, i) => i === 0 ? { ...r, status: returned ? 'Closed' as const : 'Finished' as const } : r),
  });
  const signed = deferred<{ txHash: string }>();
  const message = deferred<Awaited<ReturnType<WalletProvider['signMessage']>>>();
  const sign = vi.fn<WalletProvider['signAndSendTransaction']>(() => signed.promise);
  const signMessage = vi.fn<WalletProvider['signMessage']>(() => message.promise);
  const wallet: WalletProvider = { status: 'connected', accountId: A.hakan, connect: vi.fn(), disconnect: vi.fn(), signAndSendTransaction: sign, signMessage };
  const router = createMemoryRouter(routes, { initialEntries: [`/a/${A.printer}?action=return&lang=en`] });
  render(<AppProviders source={source} wallet={wallet} queryClient={makeQueryClient()}><RouterProvider router={router} /></AppProviders>);
  return { sign, signed, signMessage, message, returned: () => { returned = true; } };
}

describe('return actions settle once and refresh the visible state', () => {
  it.each(['Confirm clean return', 'Report damage'])('blocks repeated/opposing clicks while %s is signing, then removes settled actions', async (name) => {
    const { sign, signed, returned } = setup();
    const button = await screen.findByRole('button', { name });
    fireEvent.click(button);
    fireEvent.click(button);
    const opposite = screen.getByRole('button', { name: name === 'Report damage' ? 'Confirm clean return' : 'Report damage' });
    fireEvent.click(opposite);
    await waitFor(() => expect(sign).toHaveBeenCalledTimes(1));
    expect(button).toBeDisabled();
    expect(opposite).toBeDisabled();
    expect(screen.getByText('Confirming return…')).toBeInTheDocument();
    returned();
    await act(async () => { signed.resolve({ txHash: 'returnConfirmed' }); });
    await screen.findByText('No use is waiting for a return check.');
    expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.queryByText('Confirming return…')).toBeNull();
  });

  it('releases the controls after a rejected wallet request and shows the error', async () => {
    const { sign, signed } = setup();
    const button = await screen.findByRole('button', { name: 'Confirm clean return' });
    fireEvent.click(button);
    await waitFor(() => expect(sign).toHaveBeenCalledTimes(1));
    await act(async () => { signed.reject(new Error('User rejected request')); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.queryByText('Confirming return…')).toBeNull();
  });

  it('requests one manual-return signature and refreshes the outstanding loan after bridge confirmation', async () => {
    let returned = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = url.endsWith('/session')
        ? { current: returned ? null : { session_id: 'loan-1', reservation_id: '1', holder: A.ali }, outstanding: [], simulated: true }
        : url.endsWith('/access/challenge')
          ? { nonce: btoa('x'.repeat(32)), message: 'Return this loan', recipient: 'commonkit-bridge' }
          : { ok: (returned = true), step: 'return' };
      return new Response(JSON.stringify(json), { status: 200 });
    }));
    try {
      const { signMessage, message } = setup(true);
      const button = await screen.findByRole('button', { name: 'Confirm return (bridge)' });
      await waitFor(() => expect(button).toBeEnabled());
      fireEvent.click(button);
      fireEvent.click(button);
      await waitFor(() => expect(signMessage).toHaveBeenCalledTimes(1));
      expect(button).toBeDisabled();
      await act(async () => { message.resolve({ accountId: A.hakan, publicKey: 'ed25519:test', signature: 'signed' }); });
      await screen.findByText('No use is waiting for a return check.');
      expect(screen.queryByRole('button', { name: 'Confirm return (bridge)' })).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });
});
