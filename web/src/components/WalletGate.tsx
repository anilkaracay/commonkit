import type { ReactNode } from 'react';
import { useWallet } from '../wallet/wallet';

/** Wraps a wallet action: renders the action area, or explains plainly why it is unavailable. */
export function WalletGate({ action, children }: { action: string; children?: ReactNode }) {
  const wallet = useWallet();
  if (wallet.status === 'connected') return <>{children}</>;
  return (
    <div className="rounded-tag border border-dashed border-line-strong bg-surface p-4 text-sm">
      <p className="font-medium">{action} needs a wallet.</p>
      <p className="mt-1 text-ink-2">
        {wallet.status === 'unavailable' ? wallet.unavailableReason : 'Connect a NEAR testnet wallet to continue.'} Everything on this page is readable without one.
      </p>
    </div>
  );
}
