/**
 * NearSigner — the one transaction signer for scripts, bridge and agent (Node only; import from
 * `@commonkit/sdk/signer`, never from the browser entry). Built on near-api-js 7.4.0 (D-106).
 *
 * - Key from an env var (e.g. a function-call key) or from the NEAR CLI legacy keychain.
 * - Nonces are allocated and transactions sent one at a time per key (no nonce collisions).
 * - The tx hash and nonce are known before broadcast. If the result cannot be read after the
 *   transaction may have been broadcast (timeout, transport error, RPC TIMEOUT_ERROR), the call
 *   throws `AmbiguousTxError` carrying both; `isSettled({txHash, nonce})` later tells whether it
 *   is final or can no longer land. It never surfaces as a plain error.
 * - A transaction that executed and failed throws `TxPanicError` with the E_* code (parseErrorCode),
 *   unless `allowFailure` is set. A transaction the node rejected before execution (bad nonce after
 *   one refresh, not enough balance, wrong key) throws `TxRejectedError`: nothing was applied.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  KeyPair,
  KeyPairSigner,
  actions as nearActions,
  baseDecode,
  baseEncode,
  createTransaction,
  type Action,
  type KeyPairString,
} from 'near-api-js';
import { parseErrorCode, type ErrorCode } from './errors.js';
import { decodeEvents, type Nep297Event } from './events.js';
import type { Fetch } from './rpc.js';

export const DEFAULT_TESTNET_RPCS = [
  'https://test.rpc.fastnear.com',
  'https://rpc.testnet.near.org',
];
export const TGAS = 1_000_000_000_000n;

// ---------------------------------------------------------------- outcome (pure)

export interface OutcomeSummary {
  ok: boolean;
  /** JSON of the failure on the main path (null on success). */
  failure: string | null;
  errorCode: ErrorCode | null;
  /** Failures in any receipt, including detached callbacks that do not fail the tx. */
  receiptFailures: string[];
  logs: string[];
  events: Nep297Event[];
  returnValue: unknown;
  gasBurnt: bigint;
  signerId: string;
  receiverId: string;
}

interface RawOutcome {
  status: unknown;
  logs: string[];
  gas_burnt: number | string;
}
export interface RawTxResponse {
  status: unknown;
  transaction: { hash: string; signer_id: string; receiver_id: string; nonce?: number | string };
  transaction_outcome: { outcome: RawOutcome };
  receipts_outcome: { outcome: RawOutcome }[];
  final_execution_status?: string;
}

const failureText = (status: unknown): string | null =>
  status && typeof status === 'object' && 'Failure' in status
    ? JSON.stringify((status as { Failure: unknown }).Failure)
    : null;

function decodeReturn(b64: string): unknown {
  if (b64.length === 0) return null;
  const text = Buffer.from(b64, 'base64').toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Pure: reduce an RPC FinalExecutionOutcome to what callers log and assert on. */
export function summarizeOutcome(res: RawTxResponse): OutcomeSummary {
  const outcomes = [res.transaction_outcome.outcome, ...res.receipts_outcome.map((r) => r.outcome)];
  const logs = outcomes.flatMap((o) => o.logs);
  const failure = failureText(res.status);
  const st = res.status as { SuccessValue?: string } | null;
  return {
    ok: failure === null,
    failure,
    errorCode: failure ? parseErrorCode(failure) : null,
    receiptFailures: outcomes
      .map((o) => failureText(o.status))
      .filter((f): f is string => f !== null),
    logs,
    events: decodeEvents(logs),
    returnValue: typeof st?.SuccessValue === 'string' ? decodeReturn(st.SuccessValue) : null,
    gasBurnt: outcomes.reduce((s, o) => s + BigInt(o.gas_burnt), 0n),
    signerId: res.transaction.signer_id,
    receiverId: res.transaction.receiver_id,
  };
}

// ---------------------------------------------------------------- errors

export interface TxRef {
  txHash: string;
  nonce: bigint;
  accountId: string;
  publicKey: string;
}

/** The transaction may or may not have been applied. Re-read state; do not resend until settled. */
export class AmbiguousTxError extends Error {
  readonly ambiguous = true;
  constructor(
    readonly ref: TxRef,
    readonly reason: string,
  ) {
    super(`transaction ${ref.txHash} (nonce ${ref.nonce}) outcome unknown: ${reason}`);
    this.name = 'AmbiguousTxError';
  }
}

/** The transaction executed and failed (contract panic or action error). Nothing was applied. */
export class TxPanicError extends Error {
  readonly code: ErrorCode | null;
  constructor(
    readonly ref: TxRef,
    readonly outcome: OutcomeSummary,
  ) {
    super(
      `transaction ${ref.txHash} failed${outcome.errorCode ? ` (${outcome.errorCode})` : ''}: ${outcome.failure}`,
    );
    this.name = 'TxPanicError';
    this.code = outcome.errorCode;
  }
}

/** The node refused the transaction before execution (e.g. NotEnoughBalance). Nothing was applied. */
export class TxRejectedError extends Error {
  constructor(
    readonly ref: TxRef,
    readonly data: unknown,
  ) {
    super(`transaction ${ref.txHash} rejected before execution: ${JSON.stringify(data)}`);
    this.name = 'TxRejectedError';
  }
}

// ---------------------------------------------------------------- pure decision helpers

export type SendErrorKind = 'invalid_nonce' | 'rejected' | 'ambiguous';

/** Pure: classify a JSON-RPC `send_tx` error. Only an INVALID_TRANSACTION is a definite "not applied". */
export function classifySendError(error: unknown): SendErrorKind {
  const text = JSON.stringify(error ?? null);
  const cause = (error as { cause?: { name?: string } } | null)?.cause?.name;
  if (cause === 'INVALID_TRANSACTION' || /InvalidTxError|INVALID_TRANSACTION/.test(text))
    return /InvalidNonce/.test(text) ? 'invalid_nonce' : 'rejected';
  return 'ambiguous';
}

/**
 * Pure: is a transaction settled? `txStatus` = final_execution_status if the tx is known, null if
 * unknown; `keyNonce` = the key's nonce at final. A known tx is settled once FINAL; an unknown tx is
 * settled once a final block has used its nonce (then it can never land).
 */
export function settledFrom(p: {
  txStatus: string | null;
  keyNonce: bigint | null;
  refNonce: bigint | null;
}): boolean {
  if (p.txStatus !== null) return p.txStatus === 'FINAL';
  if (p.keyNonce !== null && p.refNonce !== null) return p.keyNonce >= p.refNonce;
  return false;
}

/** Runs async jobs strictly one after another (per signing key). */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(job: () => Promise<T>): Promise<T> {
    const next = this.tail.then(job, job);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

// ---------------------------------------------------------------- keychain

const keyFileSchema = (v: unknown): { public_key: string; private_key: string } | null => {
  const o = v as { public_key?: unknown; private_key?: unknown } | null;
  return o && typeof o.public_key === 'string' && typeof o.private_key === 'string'
    ? { public_key: o.public_key, private_key: o.private_key }
    : null;
};

export const defaultKeychainDir = (network = 'testnet'): string =>
  process.env.NEAR_CREDENTIALS_DIR || join(homedir(), '.near-credentials', network);

/**
 * Read a private key from the near-cli-rs legacy keychain: `<dir>/<account>/ed25519_<pk>.json`
 * when `publicKey` is given, else `<dir>/<account>.json` (the account's primary key).
 */
export function readKeychainKey(
  accountId: string,
  opts: { publicKey?: string; dir?: string } = {},
): KeyPairString {
  const dir = opts.dir ?? defaultKeychainDir();
  const files = opts.publicKey
    ? [join(dir, accountId, `${opts.publicKey.replace(':', '_')}.json`)]
    : [join(dir, `${accountId}.json`)];
  for (const f of files) {
    if (!existsSync(f)) continue;
    const k = keyFileSchema(JSON.parse(readFileSync(f, 'utf8')));
    if (k && (!opts.publicKey || k.public_key === opts.publicKey))
      return k.private_key as KeyPairString;
  }
  throw new Error(
    `no key for ${accountId}${opts.publicKey ? ` (${opts.publicKey})` : ''} in ${dir}`,
  );
}

/** Public keys stored for an account in the legacy keychain (primary first). */
export function listKeychainKeys(accountId: string, dir = defaultKeychainDir()): string[] {
  const out: string[] = [];
  const add = (f: string) => {
    if (!existsSync(f)) return;
    const k = keyFileSchema(JSON.parse(readFileSync(f, 'utf8')));
    if (k && !out.includes(k.public_key)) out.push(k.public_key);
  };
  add(join(dir, `${accountId}.json`));
  const sub = join(dir, accountId);
  if (existsSync(sub))
    for (const f of readdirSync(sub).filter((n) => n.endsWith('.json'))) add(join(sub, f));
  return out;
}

// ---------------------------------------------------------------- signer

export interface FunctionCallRequest {
  receiverId: string;
  methodName: string;
  args: object;
  gas: bigint;
  deposit?: bigint;
  /** Return failed outcomes instead of throwing TxPanicError. */
  allowFailure?: boolean;
}

export interface SendResult {
  txHash: string;
  nonce: bigint;
  outcome: OutcomeSummary;
  logs: string[];
}

export interface SignerOptions {
  rpcUrls?: string[];
  fetch?: Fetch;
  /** Per-request timeout for send_tx (ms). Default 60 s. */
  timeoutMs?: number;
  waitUntil?: 'FINAL' | 'EXECUTED_OPTIMISTIC';
}

class RpcTransportError extends Error {}

export class NearSigner {
  private readonly keyPair: KeyPair;
  private readonly signer: KeyPairSigner;
  private readonly queue = new SerialQueue();
  private readonly rpcUrls: string[];
  private readonly fetchImpl: Fetch;
  private readonly timeoutMs: number;
  private readonly waitUntil: 'FINAL' | 'EXECUTED_OPTIMISTIC';
  /** Highest nonce this process used (or saw on chain) for the key. */
  private lastNonce: bigint | null = null;
  readonly publicKey: string;

  constructor(
    readonly accountId: string,
    privateKey: KeyPairString,
    opts: SignerOptions = {},
  ) {
    this.keyPair = KeyPair.fromString(privateKey);
    this.signer = new KeyPairSigner(this.keyPair);
    this.publicKey = this.keyPair.getPublicKey().toString();
    this.rpcUrls = opts.rpcUrls ?? DEFAULT_TESTNET_RPCS;
    this.fetchImpl = opts.fetch ?? ((i, o) => fetch(i, o));
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.waitUntil = opts.waitUntil ?? 'FINAL';
  }

  /** Key from an env var holding `ed25519:<secret>` (e.g. BRIDGE_PRIVATE_KEY). */
  static fromEnv(accountId: string, envVar: string, opts?: SignerOptions): NearSigner {
    const key = process.env[envVar];
    if (!key) throw new Error(`${envVar} is not set`);
    return new NearSigner(accountId, key as KeyPairString, opts);
  }

  static fromKeychain(
    accountId: string,
    keyOpts: { publicKey?: string; dir?: string } = {},
    opts?: SignerOptions,
  ): NearSigner {
    return new NearSigner(accountId, readKeychainKey(accountId, keyOpts), opts);
  }

  /** One function call (0 deposit unless given). */
  signAndSend(req: FunctionCallRequest): Promise<SendResult> {
    return this.signAndSendActions(
      req.receiverId,
      [nearActions.functionCall(req.methodName, req.args, req.gas, req.deposit ?? 0n)],
      { allowFailure: req.allowFailure ?? false },
    );
  }

  /** Any action list (create account, deploy, keys, transfers …), serialized per key. */
  signAndSendActions(
    receiverId: string,
    txActions: Action[],
    opts: { allowFailure?: boolean } = {},
  ): Promise<SendResult> {
    return this.queue.run(() =>
      this.sendSerialized(receiverId, txActions, opts.allowFailure ?? false),
    );
  }

  /** True once the tx is final, or a final block used its nonce so it can never land. */
  async isSettled(ref: { txHash?: string | null; nonce?: bigint | null }): Promise<boolean> {
    let txStatus: string | null = null;
    if (ref.txHash) {
      try {
        const r = await this.rpc<{ final_execution_status?: string }>('tx', {
          tx_hash: ref.txHash,
          sender_account_id: this.accountId,
          wait_until: 'NONE',
        });
        txStatus = r.final_execution_status ?? 'FINAL';
      } catch (e) {
        if (
          !/UNKNOWN_TRANSACTION/.test(
            String((e as Error).message) + JSON.stringify((e as { data?: unknown }).data ?? null),
          )
        )
          throw e;
      }
    }
    const keyNonce = txStatus === null && ref.nonce != null ? (await this.accessKey()).nonce : null;
    return settledFrom({ txStatus, keyNonce, refNonce: ref.nonce ?? null });
  }

  // -------------------------------------------------------------- internals

  private async rpc<T>(
    method: string,
    params: unknown,
    urls = this.rpcUrls,
    timeoutMs = 20_000,
  ): Promise<T> {
    let last: unknown;
    for (const url of urls) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await this.fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 'commonkit', method, params }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new RpcTransportError(`RPC HTTP ${res.status}`);
        const body = (await res.json()) as { result?: T; error?: unknown };
        if (body.error !== undefined) {
          const err = new Error(
            `RPC error in ${method}: ${JSON.stringify(body.error)}`,
          ) as Error & { data?: unknown; rpcError?: true };
          err.data = body.error;
          err.rpcError = true;
          throw err;
        }
        const r = body.result as { error?: unknown } | undefined;
        if (r && typeof r === 'object' && typeof r.error === 'string')
          throw Object.assign(new Error(r.error), { data: r, rpcError: true });
        return body.result as T;
      } catch (e) {
        last = e;
        if ((e as { rpcError?: true }).rpcError) throw e;
      } finally {
        clearTimeout(timer);
      }
    }
    throw last instanceof Error
      ? new RpcTransportError(last.message)
      : new RpcTransportError(String(last));
  }

  private accessKey(): Promise<{ nonce: bigint; blockHash: string }> {
    return this.rpc<{ nonce: number | string; block_hash: string }>('query', {
      request_type: 'view_access_key',
      finality: 'final',
      account_id: this.accountId,
      public_key: this.publicKey,
    }).then((r) => ({ nonce: BigInt(r.nonce), blockHash: r.block_hash }));
  }

  private async sign(
    receiverId: string,
    txActions: Action[],
    refresh: boolean,
  ): Promise<{ ref: TxRef; bytes: Uint8Array }> {
    const ak = await this.accessKey();
    const base =
      refresh || this.lastNonce === null || ak.nonce > this.lastNonce ? ak.nonce : this.lastNonce;
    const nonce = base + 1n;
    const tx = createTransaction(
      this.accountId,
      this.keyPair.getPublicKey(),
      receiverId,
      nonce,
      txActions,
      baseDecode(ak.blockHash),
    );
    const { txHash, signedTransaction } = await this.signer.signTransaction(tx);
    this.lastNonce = nonce;
    return {
      ref: {
        txHash: baseEncode(txHash),
        nonce,
        accountId: this.accountId,
        publicKey: this.publicKey,
      },
      bytes: signedTransaction.encode(),
    };
  }

  private async sendSerialized(
    receiverId: string,
    txActions: Action[],
    allowFailure: boolean,
  ): Promise<SendResult> {
    for (let attempt = 0; ; attempt++) {
      const { ref, bytes } = await this.sign(receiverId, txActions, attempt > 0);
      let res: RawTxResponse;
      try {
        // One RPC only: after a transport failure, a second node could answer InvalidNonce for our
        // own landed tx, which would look like "not applied" and invite a double send.
        res = await this.rpc<RawTxResponse>(
          'send_tx',
          { signed_tx_base64: Buffer.from(bytes).toString('base64'), wait_until: this.waitUntil },
          this.rpcUrls.slice(0, 1),
          this.timeoutMs,
        );
      } catch (e) {
        const data = (e as { data?: unknown }).data;
        const kind = data === undefined ? 'ambiguous' : classifySendError(data);
        if (kind === 'invalid_nonce' && attempt === 0) continue;
        if (kind === 'rejected' || kind === 'invalid_nonce') throw new TxRejectedError(ref, data);
        throw new AmbiguousTxError(ref, (e as Error).message);
      }
      const outcome = summarizeOutcome(res);
      if (!outcome.ok && !allowFailure) throw new TxPanicError(ref, outcome);
      return { txHash: ref.txHash, nonce: ref.nonce, outcome, logs: outcome.logs };
    }
  }
}
