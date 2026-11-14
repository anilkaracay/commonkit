import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppProviders, makeQueryClient } from '../App';
import { createMockSource } from '../data/mock/mockSource';
import { ProofPage } from '../routes/Proof';
import { MemoryRouter } from 'react-router';

it('holds eleven neutral rows and never counts a delayed failing live check as a pass', async () => {
  const ds = createMockSource();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  ds.viewAccessKeyList = async () => {
    await gate;
    return [{ public_key: 'ed25519:test', access_key: { nonce: 1, permission: 'FullAccess' } }];
  };
  render(<AppProviders source={ds} queryClient={makeQueryClient()}><MemoryRouter><ProofPage /></MemoryRouter></AppProviders>);
  expect(document.querySelectorAll('ol > li')).toHaveLength(11);
  expect(document.querySelector('li[data-check-id="1"]')).toHaveAttribute('data-status', 'pending');
  await waitFor(() => expect(screen.getByText('10 pass')).toBeInTheDocument());
  expect(screen.queryByText('11/11')).toBeNull();
  expect(document.querySelector('li[data-check-id="1"] [aria-label="pass"]')).toBeNull();
  await act(async () => { release(); });
  await waitFor(() => expect(document.querySelector('li[data-check-id="1"]')).toHaveAttribute('data-status', 'fail'));
  expect(screen.getByText('10/11')).toBeInTheDocument();
});

describe('refreshes', () => {
  it('resets old success marks to pending until the new live run finishes', async () => {
    const ds = createMockSource();
    const qc = makeQueryClient();
    render(<AppProviders source={ds} queryClient={qc}><MemoryRouter><ProofPage /></MemoryRouter></AppProviders>);
    await screen.findByText('11/11');
    const oldKeys = ds.viewAccessKeyList;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    ds.viewAccessKeyList = async (id) => { await gate; return oldKeys(id); };
    let refresh!: Promise<void>;
    await act(async () => { refresh = qc.invalidateQueries({ queryKey: ['proof'] }); });
    await waitFor(() => expect(document.querySelector('li[data-check-id="1"]')).toHaveAttribute('data-status', 'pending'));
    expect(screen.queryByText('11/11')).toBeNull();
    await act(async () => { release(); await refresh; });
    await screen.findByText('11/11');
  });
});
