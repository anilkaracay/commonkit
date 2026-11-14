import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppProviders, makeQueryClient } from '../App';
import { createMockSource } from '../data/mock/mockSource';
import { A } from '../data/mock/fixtures';
import { routes } from '../routes';

function memberPage(failCards: boolean) {
  const source = createMockSource();
  const assets = source.asset;
  const commons = source.commons;
  let fail = true;
  source.asset = (id) => ({ ...assets(id), get_reservations_by_holder: async (...args) => {
    if (fail && !failCards) throw new Error('Temporary RPC interruption');
    return assets(id).get_reservations_by_holder(...args);
  } });
  source.commons = (id) => ({ ...commons(id), get_cards_for_owner: async (...args) => {
    if (fail && failCards) throw new Error('Temporary RPC interruption');
    return commons(id).get_cards_for_owner(...args);
  } });
  const client = makeQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  render(<AppProviders source={source} queryClient={client}><RouterProvider router={createMemoryRouter(routes, { initialEntries: [`/me?as=${A.ayse}`] })} /></AppProviders>);
  return () => { fail = false; };
}

describe('member reads recover visibly from RPC errors', () => {
  it.each([true, false])('shows an actionable error instead of permanent loading (cards=%s)', async (cards) => {
    const recover = memberPage(cards);
    expect(await screen.findByRole('alert')).toHaveTextContent('Temporary RPC interruption');
    const retry = screen.getByRole('button', { name: cards ? 'Retry cards' : 'Retry reservations' });
    recover();
    fireEvent.click(retry);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    await waitFor(() => expect(screen.queryByText(cards ? 'Reading cards…' : 'Reading reservations…')).toBeNull());
  });
});
