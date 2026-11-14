/**
 * WalletProvider on @hot-labs/near-connect 0.12.0 (research B17, D-106): testnet, function calls
 * with exact deposits, NEP-413 signMessage for bridge access. The connector is loaded lazily so
 * read-only visitors never download wallet code.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { NearConnector as Connector, NearWalletBase } from '@hot-labs/near-connect';
import { gasFor } from '../lib/gas';
import { WalletContext, type ContractCall, type Nep413Request, type Nep413Signed, type WalletProvider } from './wallet';


/** A failed transaction outcome becomes an Error whose text carries the contract's E_* code. */
export function outcomeError(outcome: unknown): Error | null {
  const o = outcome as { status?: unknown; receipts_outcome?: { outcome?: { status?: unknown } }[] };
  const failures: unknown[] = [];
  if (o?.status && typeof o.status === 'object' && 'Failure' in o.status) failures.push(o.status);
  for (const r of o?.receipts_outcome ?? []) {
    const st = r.outcome?.status;
    if (st && typeof st === 'object' && 'Failure' in st) failures.push(st);
  }
  return failures.length ? new Error(JSON.stringify(failures[0])) : null;
}

export function txHashOf(outcome: unknown): string {
  const o = outcome as { transaction?: { hash?: string }; transaction_outcome?: { id?: string } };
  return o?.transaction?.hash ?? o?.transaction_outcome?.id ?? '';
}

/** reserve returns a JSON U64 string in the final outcome; never infer an id from other receipts. */
export function reservationIdOf(outcome: unknown): string | undefined {
  const o = outcome as { status?: { SuccessValue?: unknown } } | null;
  const encoded = o?.status?.SuccessValue;
  if (typeof encoded !== 'string' || encoded.length > 128) return undefined;
  try {
    const id: unknown = JSON.parse(atob(encoded));
    return typeof id === 'string' && /^(0|[1-9]\d*)$/.test(id) && BigInt(id) <= 18_446_744_073_709_551_615n ? id : undefined;
  } catch { return undefined; }
}

export function NearConnectProvider({ children, network = 'testnet' }: { children: ReactNode; network?: 'testnet' }) {
  const connectorRef = useRef<Connector | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const getConnector = useCallback(async (): Promise<Connector> => {
    if (connectorRef.current) return connectorRef.current;
    const { NearConnector } = await import('@hot-labs/near-connect');
    const c = new NearConnector({ network, autoConnect: true, features: { signMessage: true, testnet: true } });
    c.on('wallet:signIn', (e) => setAccountId(e.accounts[0]?.accountId ?? null));
    c.on('wallet:signOut', () => setAccountId(null));
    connectorRef.current = c;
    return c;
  }, [network]);

  // Restore an existing session without prompting.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const c = await getConnector();
        const { accounts } = await c.getConnectedWallet();
        if (!cancelled) setAccountId(accounts[0]?.accountId ?? null);
      } catch {
        /* not signed in */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getConnector]);

  const wallet = useCallback(async (): Promise<NearWalletBase> => {
    const c = await getConnector();
    return c.wallet();
  }, [getConnector]);

  const value = useMemo<WalletProvider>(
    () => ({
      status: accountId ? 'connected' : 'disconnected',
      accountId,
      ready,
      async connect() {
        const c = await getConnector();
        const w = await c.connect();
        const accounts = await w.getAccounts({ network });
        setAccountId(accounts[0]?.accountId ?? null);
      },
      async disconnect() {
        const c = await getConnector();
        await c.disconnect();
        setAccountId(null);
      },
      async signAndSendTransaction(call: ContractCall) {
        const w = await wallet();
        const outcome = await w.signAndSendTransaction({
          network,
          receiverId: call.receiverId,
          actions: [
            {
              type: 'FunctionCall',
              params: {
                methodName: call.methodName,
                args: call.args,
                gas: (call.gas ?? gasFor(call.methodName)).toString(),
                deposit: call.deposit.toString(),
              },
            },
          ],
        });
        const err = outcomeError(outcome);
        if (err) throw err;
        const reservationId = call.methodName === 'reserve' ? reservationIdOf(outcome) : undefined;
        return { txHash: txHashOf(outcome), ...(reservationId === undefined ? {} : { reservationId }) };
      },
      async signMessage(req: Nep413Request): Promise<Nep413Signed> {
        const w = await wallet();
        const signed = await w.signMessage({ message: req.message, recipient: req.recipient, nonce: req.nonce, network });
        return { accountId: signed.accountId, publicKey: signed.publicKey, signature: signed.signature };
      },
    }),
    [accountId, ready, getConnector, wallet, network],
  );

  return <WalletContext value={value}>{children}</WalletContext>;
}
