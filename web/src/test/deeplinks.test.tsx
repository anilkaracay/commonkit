import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders, makeQueryClient } from '../App';
import { createMockSource } from '../data/mock/mockSource';
import { A } from '../data/mock/fixtures';
import { routes } from '../routes';
import { safeNext } from '../routes/Pilot';
import { STRINGS } from '../pilot/strings';
import type { WalletProvider } from '../wallet/wallet';

const connected = (accountId: string = A.elif): WalletProvider => ({
  status: 'connected',
  accountId,
  connect: vi.fn(),
  disconnect: vi.fn(),
  signAndSendTransaction: vi.fn(async () => ({ txHash: 'mockTxDeepLink' })),
  signMessage: vi.fn(),
});

function renderAt(path: string, wallet?: WalletProvider) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProviders source={createMockSource()} queryClient={makeQueryClient()} {...(wallet ? { wallet } : {})}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
}

const tr = STRINGS.tr;

describe('QR deep links on the asset page (?action=)', () => {
  it.each(['reserve', 'return', 'fault'])('%s without a wallet sends the visitor through /pilot and back', async (action) => {
    const router = renderAt(`/a/${A.washer}?action=${action}`);
    expect(await screen.findByRole('heading', { name: tr.needWalletTitle })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: tr.goPilot });
    expect(link.getAttribute('href')).toBe(`/pilot?next=${encodeURIComponent(`/a/${A.washer}?action=${action}`)}`);
    expect(router.state.location.pathname).toBe(`/a/${A.washer}`);
  });

  it('reserve with a wallet opens the reservation sheet', async () => {
    renderAt(`/a/${A.laser}?action=reserve`, connected(A.ayse));
    expect(await screen.findByText(/Attached exactly/)).toBeInTheDocument();
  });

  it('fault with a wallet opens the report dialog for the Report rule', async () => {
    renderAt(`/a/${A.washer}?action=fault`, connected(A.deniz));
    expect(await screen.findByRole('heading', { name: tr.faultTitle })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Fix the reported fault' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: tr.faultSend })).toBeDisabled(); // empty note
  });

  it('return with a wallet opens the steward return check, in English with ?lang=en', async () => {
    renderAt(`/a/${A.printer}?action=return&lang=en`, connected(A.hakan));
    expect(await screen.findByRole('heading', { name: STRINGS.en.returnTitle })).toBeInTheDocument();
    expect(screen.getByText(STRINGS.en.returnNone)).toBeInTheDocument();
  });
});

describe('/pilot onboarding', () => {
  it('shows the three steps in Turkish and a way back to the pending action', async () => {
    renderAt(`/pilot?next=${encodeURIComponent(`/a/${A.washer}?action=fault`)}`, connected(A.deniz));
    expect(await screen.findByRole('heading', { name: tr.step1Title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: tr.step2Title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: tr.step3Title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: new RegExp(tr.backToAction) }).getAttribute('href')).toBe(`/a/${A.washer}?action=fault`);
    expect(screen.getByRole('button', { name: tr.copyId })).toBeInTheDocument();
  });

  it('only allows same-app paths as next', () => {
    expect(safeNext('/a/x?action=fault')).toBe('/a/x?action=fault');
    expect(safeNext('//evil.example')).toBeNull();
    expect(safeNext('https://evil.example')).toBeNull();
    expect(safeNext(null)).toBeNull();
  });

  it('keeps every pilot string in both languages', () => {
    expect(Object.keys(STRINGS.en).sort()).toEqual(Object.keys(STRINGS.tr).sort());
  });
});
