import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useDataSource } from '../data/source';
import { usePagePoll } from '../data/poll';
import { DemoOverlay, DemoProvider, useDemo, useDemoLink } from '../demo/demo';
import { useWallet } from '../wallet/wallet';
import { MockBanner } from './Badges';
import { useToast } from './Toast';

const NAV = [
  ['/', 'Board'],
  ['/proof', 'Proof'],
  ['/agent', 'Agent'],
  ['/me', 'Me'],
] as const;

function WalletButton() {
  const wallet = useWallet();
  const toast = useToast();
  const { enabled } = useDemo();
  if (enabled) return null; // demo mode hides wallet chrome
  return (
    <button
      type="button"
      onClick={() => void (wallet.accountId ? wallet.disconnect() : wallet.connect()).catch((e: unknown) => toast.showError(e))}
      disabled={wallet.status === 'unavailable'}
      title={wallet.accountId ? `Connected as ${wallet.accountId}. Click to disconnect.` : wallet.unavailableReason}
      className="max-w-[12rem] truncate rounded-full border border-line-strong px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
    >
      {wallet.accountId ?? 'Connect wallet'}
    </button>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(() => {
    try {
      return localStorage.getItem('ck-theme');
    } catch {
      return null;
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme) root.dataset.theme = theme;
    else delete root.dataset.theme;
    try {
      if (theme) localStorage.setItem('ck-theme', theme);
      else localStorage.removeItem('ck-theme');
    } catch {
      /* storage unavailable: theme still applies for this visit */
    }
  }, [theme]);
  const next = theme === null ? 'dark' : theme === 'dark' ? 'light' : null;
  return (
    <button type="button" className="underline decoration-dotted" onClick={() => setTheme(next)}>
      theme: {theme ?? 'system'}
    </button>
  );
}

/** Where every number on the current route comes from (shown in the footer). */
export function sourceNote(pathname: string, kind: 'mock' | 'rpc'): string {
  if (kind === 'mock') return 'Data: MOCK fixtures (tests and design only).';
  const rpc = 'NEAR testnet RPC views';
  if (pathname.startsWith('/proof')) return `Data: ${rpc} · deployments/testnet.json · evidence/*.json.`;
  if (pathname.startsWith('/agent')) return `Data: ${rpc} (tasks, escalations) · evidence/agent-limits.json.`;
  if (pathname.startsWith('/c/')) return `Data: ${rpc} (commons, Sputnik DAO) · deployments/testnet.json.`;
  if (pathname.startsWith('/pilot')) return 'Pilot onboarding: static text; your account is read from your wallet.';
  if (pathname === '/' || pathname === '') return `Data: ${rpc} · deployments/testnet.json · scenario matrix from profiles/*.json in the repo.`;
  return `Data: ${rpc} · profile text from profiles/*.json · tx links from evidence/*.json.`;
}

function Frame() {
  const ds = useDataSource();
  const link = useDemoLink();
  const { pathname } = useLocation();
  usePagePoll();
  useEffect(() => {
    // Braces matter: an effect must return nothing or a cleanup function.
    window.scrollTo?.(0, 0);
  }, [pathname]);
  return (
    <div className="flex min-h-dvh flex-col">
      {ds.kind === 'mock' && <MockBanner />}
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <NavLink to={link('/')} className="flex items-center gap-2" aria-label="COMMONKIT board">
            <svg aria-hidden width="22" height="22" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="3.5" />
              <path d="M16 5a11 11 0 0 1 11 11" fill="none" stroke="var(--ck-due-fill)" strokeWidth="3.5" />
              <circle cx="16" cy="16" r="3" fill="currentColor" />
            </svg>
            <span className="font-display text-lg font-extrabold tracking-tight">COMMONKIT</span>
            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-2">testnet</span>
          </NavLink>
          <nav aria-label="Main" className="order-3 -mx-1 flex w-full gap-1 sm:order-none sm:ml-auto sm:w-auto">
            {NAV.map(([to, label]) => (
              <NavLink
                key={to}
                to={link(to)}
                end={to === '/'}
                className={({ isActive }) =>
                  `rounded-full px-3 py-1 text-sm ${isActive ? 'bg-ink font-medium text-paper' : 'text-ink-2 hover:bg-surface-2'}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto sm:ml-0">
            <WalletButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap gap-x-4 gap-y-1 px-4 py-4 text-xs text-ink-3">
          <NavLink to={link('/train')}>Trainings</NavLink>
          <NavLink to={link('/approvals')}>Approvals</NavLink>
          <NavLink to={link('/pilot')}>Pilot</NavLink>
          <a href="/">About</a>
          <span>{sourceNote(pathname, ds.kind)}</span>
          <span className="ml-auto">
            <ThemeToggle />
          </span>
        </div>
      </footer>
      <DemoOverlay />
    </div>
  );
}

export function Shell() {
  return (
    <DemoProvider>
      <Frame />
    </DemoProvider>
  );
}
