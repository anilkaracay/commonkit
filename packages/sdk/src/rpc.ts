/**
 * Minimal read-only NEAR JSON-RPC client (no keys, no wallet). Used by web, verify scripts,
 * bridge and agent for views. Signing lives elsewhere (pending research B5).
 */
import { z } from 'zod';

export const TESTNET_RPC = 'https://rpc.testnet.near.org';

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const rpcEnvelope = z.object({
  result: z.unknown().optional(),
  error: z.unknown().optional(),
});

export class RpcError extends Error {
  constructor(
    message: string,
    readonly data: unknown,
  ) {
    super(message);
  }
}

export class NearRpc {
  constructor(
    readonly url: string = TESTNET_RPC,
    private readonly fetchImpl: Fetch = (i, o) => fetch(i, o),
  ) {}

  async call<T>(method: string, params: unknown): Promise<T> {
    const res = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'commonkit', method, params }),
    });
    if (!res.ok) throw new RpcError(`RPC HTTP ${res.status}`, await res.text());
    const body = rpcEnvelope.parse(await res.json());
    if (body.error !== undefined) throw new RpcError(`RPC error in ${method}`, body.error);
    const result = body.result as { error?: string } | undefined;
    if (result && typeof result === 'object' && typeof result.error === 'string')
      throw new RpcError(result.error, result);
    return body.result as T;
  }

  /** Call a contract view method and JSON-decode its result. */
  async view<T>(accountId: string, methodName: string, args: object = {}): Promise<T> {
    const r = await this.call<{ result: number[] }>('query', {
      request_type: 'call_function',
      finality: 'final',
      account_id: accountId,
      method_name: methodName,
      args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
    });
    return JSON.parse(Buffer.from(r.result).toString('utf8')) as T;
  }

  async viewAccount(accountId: string): Promise<{ amount: string; code_hash: string; storage_usage: number }> {
    return this.call('query', { request_type: 'view_account', finality: 'final', account_id: accountId });
  }

  async viewAccessKeyList(accountId: string): Promise<{ keys: { public_key: string; access_key: unknown }[] }> {
    return this.call('query', { request_type: 'view_access_key_list', finality: 'final', account_id: accountId });
  }
}
