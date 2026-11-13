import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useDataSource } from '../data/source';
import { usePagePoll } from '../data/poll';
import { DemoOverlay, DemoProvider, useDemo, useDemoLink } from '../demo/demo';
import { useWallet } from '../wallet/wallet';
import { MockBanner } from './Badges';
import { useToast } from './Toast';
import { lockupSvg } from '@commonkit/design/logo';

// 16 px tall on phones so the wallet button stays on the first row at 390 px; 18 px from sm up.
const LOGO = { __html: lockupSvg(18, { className: 'h-4 w-auto sm:h-[18px]' }) };

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
      className={`ck-btn ck-btn--sm max-w-[13rem] ${wallet.accountId ? 'ck-btn--ghost' : ''}`}
    >
      <span className="truncate">{wallet.accountId ?? 'Connect wallet'}</span>
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
    <div className="flex min-h-dvh flex-col bg-bg">
      {ds.kind === 'mock' && <MockBanner />}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="wrap flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 sm:h-16 sm:gap-x-8 sm:py-0">
          <NavLink to={link('/')} className="flex items-baseline gap-2.5 no-underline" aria-label="COMMONKIT board">
            {/* Approved lockup (D-040). The flex baseline is the SVG bottom, 16.7 % of its height below the caps: shift it down by that so "testnet" sits on the cap baseline. */}
            <span className="flex" style={{ transform: 'translateY(16.7%)' }} dangerouslySetInnerHTML={LOGO} />
            <span className="text-xs text-text-3">testnet</span>
          </NavLink>
          <nav aria-label="Main" className="order-3 -mx-2 flex w-full sm:order-none sm:mx-0 sm:w-auto sm:gap-1">
            {NAV.map(([to, label]) => (
              <NavLink
                key={to}
                to={link(to)}
                end={to === '/'}
                className={({ isActive }) =>
                  `relative px-2 py-2.5 text-[15px] no-underline transition-colors sm:px-3 ${isActive ? 'text-text after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-accent sm:after:inset-x-3 sm:after:bottom-[-13px]' : 'text-text-2 hover:text-text'}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex min-h-9 min-w-[9.5rem] justify-end">
            <WalletButton />
          </div>
        </div>
      </header>
      <main className="wrap min-h-[100dvh] flex-1 py-8 sm:py-12">
        <Outlet />
      </main>
      <footer className="mt-12 border-t border-line">
        <div className="wrap flex flex-wrap items-baseline gap-x-6 gap-y-2 py-6 text-sm text-text-3">
          <NavLink to={link('/train')} className="no-underline hover:text-text">Trainings</NavLink>
          <NavLink to={link('/approvals')} className="no-underline hover:text-text">Approvals</NavLink>
          <NavLink to={link('/pilot')} className="no-underline hover:text-text">Pilot</NavLink>
          <a href="/" className="no-underline hover:text-text">About</a>
          <span className="w-full text-xs lg:ml-auto lg:w-auto">{sourceNote(pathname, ds.kind)}</span>
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
