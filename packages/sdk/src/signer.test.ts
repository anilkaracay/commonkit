import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  KeyPair,
  SignedTransaction,
  baseEncode,
  encodeTransaction,
  type KeyPairString,
} from 'near-api-js';
import { describe, expect, it } from 'vitest';
import {
  AmbiguousTxError,
  NearSigner,
  SerialQueue,
  TGAS,
  TxPanicError,
  TxRejectedError,
  classifySendError,
  listKeychainKeys,
  readKeychainKey,
  settledFrom,
  summarizeOutcome,
  type RawTxResponse,
} from './signer.js';
import type { Fetch } from './rpc.js';

const BLOCK_HASH = baseEncode(new Uint8Array(32).fill(7));
const okOutcome = (logs: string[] = []) => ({ status: { SuccessValue: '' }, logs, gas_burnt: 5 });

function txResponse(
  hash: string,
  status: unknown = { SuccessValue: '' },
  logs: string[] = [],
): RawTxResponse {
  return {
    status,
    transaction: { hash, signer_id: 'bridge.testnet', receiver_id: 'asset.testnet' },
    transaction_outcome: { outcome: okOutcome() },
    receipts_outcome: [{ outcome: { status, logs, gas_burnt: 5 } }],
    final_execution_status: 'FINAL',
  };
}

interface Sent {
  nonce: bigint;
  hash: string;
}

/** Minimal fake NEAR RPC: view_access_key, send_tx, tx. `onSend` decides each send_tx answer. */
function fakeRpc(opts: {
  akNonce?: bigint;
  onSend?: (s: Sent, n: number) => Promise<{ result?: unknown; error?: unknown } | 'hang'>;
  txStatus?: (hash: string) => { result?: unknown; error?: unknown };
}) {
  const sent: Sent[] = [];
  const state = { akNonce: opts.akNonce ?? 100n };
  const fetchImpl: Fetch = async (_url, init) => {
    const req = JSON.parse(String(init?.body)) as {
      method: string;
      params: Record<string, unknown>;
    };
    const reply = (body: unknown) =>
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, ...(body as object) }));
    if (req.method === 'query')
      return reply({
        result: { nonce: Number(state.akNonce), block_hash: BLOCK_HASH, permission: 'FullAccess' },
      });
    if (req.method === 'tx')
      return reply(
        opts.txStatus?.(String(req.params.tx_hash)) ?? {
          error: { cause: { name: 'UNKNOWN_TRANSACTION' } },
        },
      );
    if (req.method === 'send_tx') {
      const signed = SignedTransaction.decode(
        Buffer.from(String(req.params.signed_tx_base64), 'base64'),
      );
      const hash = baseEncode(
        createHash('sha256').update(encodeTransaction(signed.transaction)).digest(),
      );
      const s = { nonce: BigInt(signed.transaction.nonce), hash };
      sent.push(s);
      const ans = opts.onSend ? await opts.onSend(s, sent.length) : { result: txResponse(hash) };
      if (ans === 'hang')
        return new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        );
      return reply(ans);
    }
    throw new Error(`unexpected ${req.method}`);
  };
  return { fetchImpl, sent, state };
}

const KEY = KeyPair.fromRandom('ed25519').toString() as KeyPairString;
const call = {
  receiverId: 'asset.testnet',
  methodName: 'report_telemetry',
  args: { metrics: [] },
  gas: 30n * TGAS,
};
const signer = (f: Fetch, timeoutMs = 2000) =>
  new NearSigner('bridge.testnet', KEY, { rpcUrls: ['http://rpc'], fetch: f, timeoutMs });

describe('summarizeOutcome', () => {
  it('collects logs, events, return value and gas', () => {
    const r = summarizeOutcome({
      ...txResponse('H', { SuccessValue: Buffer.from('7').toString('base64') }, [
        'EVENT_JSON:{"standard":"commonkit","version":"1.0.0","event":"swept"}',
      ]),
    });
    expect(r).toMatchObject({ ok: true, returnValue: 7, failure: null, gasBurnt: 10n });
    expect(r.events.map((e) => e.event)).toEqual(['swept']);
  });

  it('extracts the E_ code from a failure and lists receipt failures', () => {
    const fail = {
      Failure: {
        ActionError: {
          kind: {
            FunctionCallError: { ExecutionError: 'Smart contract panicked: E_RULE_NOT_DUE: x' },
          },
        },
      },
    };
    const r = summarizeOutcome(txResponse('H', fail));
    expect(r).toMatchObject({ ok: false, errorCode: 'E_RULE_NOT_DUE' });
    expect(r.receiptFailures).toHaveLength(1);
  });
});

describe('pure helpers', () => {
  it('classifies send_tx errors: only INVALID_TRANSACTION means not applied', () => {
    expect(
      classifySendError({
        cause: { name: 'INVALID_TRANSACTION', info: {} },
        data: { TxExecutionError: { InvalidTxError: { InvalidNonce: {} } } },
      }),
    ).toBe('invalid_nonce');
    expect(
      classifySendError({
        cause: { name: 'INVALID_TRANSACTION' },
        data: { TxExecutionError: { InvalidTxError: { NotEnoughBalance: {} } } },
      }),
    ).toBe('rejected');
    expect(classifySendError({ cause: { name: 'TIMEOUT_ERROR' } })).toBe('ambiguous');
    expect(classifySendError({ cause: { name: 'INTERNAL_ERROR' } })).toBe('ambiguous');
  });

  it('settledFrom: known tx needs FINAL; unknown tx settles when its nonce was used', () => {
    expect(settledFrom({ txStatus: 'FINAL', keyNonce: null, refNonce: 5n })).toBe(true);
    expect(settledFrom({ txStatus: 'EXECUTED_OPTIMISTIC', keyNonce: 9n, refNonce: 5n })).toBe(
      false,
    );
    expect(settledFrom({ txStatus: null, keyNonce: 5n, refNonce: 5n })).toBe(true);
    expect(settledFrom({ txStatus: null, keyNonce: 4n, refNonce: 5n })).toBe(false);
    expect(settledFrom({ txStatus: null, keyNonce: null, refNonce: null })).toBe(false);
  });

  it('SerialQueue runs jobs one at a time, in order, and survives a failing job', async () => {
    const q = new SerialQueue();
    const log: string[] = [];
    const job =
      (n: string, ms: number, fail = false) =>
      () =>
        new Promise<string>((res, rej) => {
          log.push(`start ${n}`);
          setTimeout(() => (log.push(`end ${n}`), fail ? rej(new Error(n)) : res(n)), ms);
        });
    const all = await Promise.allSettled([
      q.run(job('a', 20)),
      q.run(job('b', 1, true)),
      q.run(job('c', 1)),
    ]);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
    expect(all.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
  });

  it('reads the legacy keychain layout', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ck-kc-'));
    const kp = KeyPair.fromRandom('ed25519');
    const pk = kp.getPublicKey().toString();
    const body = JSON.stringify({ public_key: pk, private_key: kp.toString() });
    writeFileSync(join(dir, 'a.testnet.json'), body);
    mkdirSync(join(dir, 'a.testnet'));
    writeFileSync(join(dir, 'a.testnet', `${pk.replace(':', '_')}.json`), body);
    expect(readKeychainKey('a.testnet', { dir })).toBe(kp.toString());
    expect(readKeychainKey('a.testnet', { dir, publicKey: pk })).toBe(kp.toString());
    expect(listKeychainKeys('a.testnet', dir)).toEqual([pk]);
    expect(() => readKeychainKey('b.testnet', { dir })).toThrow(/no key/);
  });
});

describe('NearSigner', () => {
  it('returns the tx hash of the signed bytes and increments nonces locally', async () => {
    const rpc = fakeRpc({ akNonce: 100n });
    const s = signer(rpc.fetchImpl);
    const a = await s.signAndSend(call);
    const b = await s.signAndSend(call);
    expect(rpc.sent.map((x) => x.nonce)).toEqual([101n, 102n]);
    expect(a.txHash).toBe(rpc.sent[0]!.hash);
    expect(a.nonce).toBe(101n);
    expect(b.outcome.ok).toBe(true);
  });

  it('serializes concurrent calls so nonces never collide', async () => {
    const rpc = fakeRpc({
      onSend: async (x) => (
        await new Promise((r) => setTimeout(r, 15)),
        { result: txResponse(x.hash) }
      ),
    });
    const s = signer(rpc.fetchImpl);
    await Promise.all([s.signAndSend(call), s.signAndSend(call), s.signAndSend(call)]);
    expect(rpc.sent.map((x) => x.nonce)).toEqual([101n, 102n, 103n]);
  });

  it('a timeout after broadcast is ambiguous and carries tx hash + nonce', async () => {
    const rpc = fakeRpc({ onSend: async () => 'hang' });
    const err = await signer(rpc.fetchImpl, 50)
      .signAndSend(call)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AmbiguousTxError);
    const amb = err as AmbiguousTxError;
    expect(amb.ref.txHash).toBe(rpc.sent[0]!.hash);
    expect(amb.ref.nonce).toBe(101n);
    expect(amb.ambiguous).toBe(true);
  });

  it('an RPC TIMEOUT_ERROR is ambiguous too', async () => {
    const rpc = fakeRpc({
      onSend: async () => ({ error: { name: 'HANDLER_ERROR', cause: { name: 'TIMEOUT_ERROR' } } }),
    });
    await expect(signer(rpc.fetchImpl).signAndSend(call)).rejects.toBeInstanceOf(AmbiguousTxError);
  });

  it('retries once with a fresh nonce on InvalidNonce; other invalid txs are rejected', async () => {
    const nonceErr = {
      error: {
        name: 'HANDLER_ERROR',
        cause: { name: 'INVALID_TRANSACTION' },
        data: { TxExecutionError: { InvalidTxError: { InvalidNonce: {} } } },
      },
    };
    const rpc = fakeRpc({
      onSend: async (x, n) =>
        n === 1 ? ((rpc.state.akNonce = 200n), nonceErr) : { result: txResponse(x.hash) },
    });
    const r = await signer(rpc.fetchImpl).signAndSend(call);
    expect(r.nonce).toBe(201n);

    const broke = fakeRpc({
      onSend: async () => ({
        error: {
          cause: { name: 'INVALID_TRANSACTION' },
          data: { TxExecutionError: { InvalidTxError: { NotEnoughBalance: {} } } },
        },
      }),
    });
    await expect(signer(broke.fetchImpl).signAndSend(call)).rejects.toBeInstanceOf(TxRejectedError);
  });

  it('a contract panic throws TxPanicError with the E_ code (or returns it with allowFailure)', async () => {
    const fail = {
      Failure: {
        ActionError: {
          kind: {
            FunctionCallError: { ExecutionError: 'Smart contract panicked: E_NOT_BRIDGE: x' },
          },
        },
      },
    };
    const rpc = fakeRpc({ onSend: async (x) => ({ result: txResponse(x.hash, fail) }) });
    const err = await signer(rpc.fetchImpl)
      .signAndSend(call)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TxPanicError);
    expect((err as TxPanicError).code).toBe('E_NOT_BRIDGE');
    const r = await signer(rpc.fetchImpl).signAndSend({ ...call, allowFailure: true });
    expect(r.outcome.errorCode).toBe('E_NOT_BRIDGE');
  });

  it('isSettled: FINAL tx, or unknown tx whose nonce a final block used', async () => {
    const known = fakeRpc({ txStatus: () => ({ result: { final_execution_status: 'FINAL' } }) });
    expect(await signer(known.fetchImpl).isSettled({ txHash: 'H', nonce: 101n })).toBe(true);
    const pending = fakeRpc({
      txStatus: () => ({ result: { final_execution_status: 'EXECUTED_OPTIMISTIC' } }),
    });
    expect(await signer(pending.fetchImpl).isSettled({ txHash: 'H', nonce: 101n })).toBe(false);
    const lost = fakeRpc({ akNonce: 101n });
    expect(await signer(lost.fetchImpl).isSettled({ txHash: 'H', nonce: 101n })).toBe(true);
    const inFlight = fakeRpc({ akNonce: 100n });
    expect(await signer(inFlight.fetchImpl).isSettled({ txHash: 'H', nonce: 101n })).toBe(false);
  });
});
