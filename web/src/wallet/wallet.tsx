/**
 * Wallet boundary. The connector is chosen in research B17 and wired in M7; until then the app
 * runs with `unavailableWallet`, so every page renders read-only and actions explain why.
 */
import { createContext, useContext } from 'react';
import type { AccountId } from '../data/types';

export interface ContractCall {
  receiverId: AccountId;
  methodName: string;
  args: Record<string, unknown>;
  /** Exact attached deposit in yocto (computed from views, never typed by the user). */
  deposit: bigint;
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
  /** Shown when status is 'unavailable'. */
  readonly unavailableReason?: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  signAndSendTransaction(call: ContractCall): Promise<{ txHash: string }>;
  signMessage(req: Nep413Request): Promise<Nep413Signed>;
}

const reason = 'Wallet connection is not wired yet: the connector is being chosen (research B17) and lands in M7.';
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
