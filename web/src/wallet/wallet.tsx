/**
 * Wallet boundary. The app uses `NearConnectProvider` (nearConnect.tsx); tests and environments
 * without a wallet use `unavailableWallet`, so every page still renders read-only.
 */
import { createContext, useContext } from 'react';
import type { AccountId } from '../data/types';

export interface ContractCall {
  receiverId: AccountId;
  methodName: string;
  args: Record<string, unknown>;
  /** Exact attached deposit in yocto (computed from views, never typed by the user). */
  deposit: bigint;
  /** Defaults to `gasFor(methodName)` (lib/gas.ts, CONTRACT_SPEC §8); pass it when context matters. */
  gas?: bigint;
}

/** NEP-413 message for bridge access requests. */
export interface Nep413Request {
  message: string;
  recipient: string;
  nonce: Uint8Array;
}

export interface Nep413Signed {
  accountId: AccountId;
  publicKey: string;
  signature: string;
}

export interface WalletProvider {
  readonly status: 'unavailable' | 'disconnected' | 'connected';
  readonly accountId: AccountId | null;
  /** false while a stored session is being restored. */
  readonly ready?: boolean;
  /** Shown when status is 'unavailable'. */
  readonly unavailableReason?: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  signAndSendTransaction(call: ContractCall): Promise<{ txHash: string }>;
  signMessage(req: Nep413Request): Promise<Nep413Signed>;
}

const reason = 'No wallet connector in this environment.';
const notYet = () => Promise.reject(new Error(reason));

export const unavailableWallet: WalletProvider = {
  status: 'unavailable',
  accountId: null,
  unavailableReason: reason,
  connect: notYet,
  disconnect: notYet,
  signAndSendTransaction: notYet,
  signMessage: notYet,
};

export const WalletContext = createContext<WalletProvider>(unavailableWallet);

export function useWallet(): WalletProvider {
  return useContext(WalletContext);
}
