import { render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppProviders, makeQueryClient } from '../App';
import { createMockSource } from '../data/mock/mockSource';
import { A } from '../data/mock/fixtures';
import { routes } from '../routes';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <AppProviders source={createMockSource()} queryClient={makeQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
}

const cases: [string, string, RegExp][] = [
  ['board', '/', /Open tasks/],
  ['community', '/c/makerlab', /Credential kinds/],
  ['asset', `/a/${A.printer}`, /Who keeps me alive/],
  ['reserve', `/a/${A.laser}/reserve`, /Attached exactly/],
  ['access', `/a/${A.laser}/access/3`, /Start reservation #3/],
  ['task', `/t/${A.printer}/1`, /why the machine asked/i],
  ['me (no wallet)', '/me', /Or look at a member/],
  ['me (read-only)', `/me?as=${A.ayse}`, /Cards/],
  ['train', '/train', /Credential trainings/],
  ['approvals', '/approvals', /Work to verify/],
  ['proof', '/proof', /scripts\/verify\.sh/],
  ['agent', '/agent', /Limits demo/],
  ['not found', '/nope', /No such page/],
];

describe('every route renders with the mock source', () => {
  it.each(cases)('%s', async (_name, path, text) => {
    renderAt(path);
    expect((await screen.findAllByText(text)).length).toBeGreaterThan(0);
    expect(screen.getByText(/MOCK DATA/)).toBeInTheDocument();
  });

  it('board shows the three demo assets, the washer marked SIMULATED', async () => {
    renderAt('/');
    const washer = await screen.findByRole('article', { name: 'Dorm washer' });
    expect(within(washer).getByText('SIMULATED')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Prusa MK4' })).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'CO₂ laser cutter' })).queryByText('SIMULATED')).toBeNull();
    expect(screen.getByText('3 accounts · 1 code_hash')).toBeInTheDocument();
  });

  it('out-of-service washer shows the band, a disabled Reserve and a Report a fault button', async () => {
    renderAt(`/a/${A.washer}`);
    expect((await screen.findAllByText('OUT OF SERVICE')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Report a fault' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Reserve' })).toBeNull();
  });

  it('board groups open tasks by upkeep kind and shows the scenario matrix', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { name: /Same contract, different commons/ })).toBeInTheDocument();
    const open = screen.getByRole('heading', { name: 'Open tasks' }).closest('section') as HTMLElement;
    for (const kind of ['Maintenance', 'Restock', 'Repair']) expect(within(open).getByRole('heading', { name: kind })).toBeInTheDocument();
    expect(screen.getAllByText(/expense 1\.2 NEAR/).length).toBeGreaterThan(0);
  });

  it('simulated asset page carries the SIMULATED badge and the simulate.sh command', async () => {
    renderAt(`/a/${A.washer}`);
    expect((await screen.findAllByText('SIMULATED')).length).toBeGreaterThan(0);
    expect(screen.getByText('./scripts/simulate.sh washer')).toBeInTheDocument();
  });

  it('proof page lists every verify.sh check', async () => {
    renderAt('/proof');
    expect(await screen.findByText(/11 pass/)).toBeInTheDocument();
  });

  it('task page shows minted cards as non-transferable', async () => {
    renderAt(`/t/${A.printer}/1`);
    await waitFor(() => expect(screen.getAllByLabelText(/^Usage right right-\d, /)).toHaveLength(2));
    expect(screen.getAllByText('non-transferable')).toHaveLength(2);
  });

  it('demo mode shows the step overlay and hides wallet chrome', async () => {
    renderAt('/?demo=1&step=7');
    expect(await screen.findByText('STEP 7/21')).toBeInTheDocument();
    expect(screen.queryByText('Connect wallet')).toBeNull();
  });
});
