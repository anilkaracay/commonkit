/**
 * Read a transaction's final outcome from public RPC (no keys): FastNEAR first, its archival node
 * for transactions older than the regular node's history. Calls are spaced (≥ 300 ms) and HTTP 429
 * is retried by the demo RPC guard, so a full evidence check stays polite.
 */
import { summarizeOutcome, type OutcomeSummary, type RawTxResponse } from '@commonkit/sdk/signer';
import { NearRpc } from '@commonkit/sdk';
import { RPC_URLS } from '../../lib/config.js';
import { protocolCode } from './record.js';
import { sleep } from './procs.js';

export const ARCHIVAL_RPC = process.env.NEAR_ARCHIVAL_RPC_URL || 'https://archival-rpc.testnet.fastnear.com';
const GAP_MS = 300;

let last = 0;
async function spaced(): Promise<void> {
  const wait = last + GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
}

export interface TxOutcome extends OutcomeSummary {
  /** E_* code, or PROTOCOL:<kind> for runtime refusals (MethodNotFound, …). */
  code: string | null;
}

export type TxStatusFn = (hash: string, sender: string) => Promise<TxOutcome>;

export function txStatusFn(urls: string[] = [...RPC_URLS, ARCHIVAL_RPC]): TxStatusFn {
  const rpcs = [...new Set(urls)].map((u) => new NearRpc(u));
  return async (hash, sender) => {
    let lastErr: unknown;
    for (const rpc of rpcs) {
      await spaced();
      try {
        const raw = await rpc.call<RawTxResponse>('tx', { tx_hash: hash, sender_account_id: sender, wait_until: 'NONE' });
        const o = summarizeOutcome(raw);
        return { ...o, code: o.errorCode ?? protocolCode(o.failure) };
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  };
}
