/**
 * Thin signing layer on near-api-js 7.4.0 (D-106) for chain-ops scripts. Reads go through
 * `@commonkit/sdk` NearRpc (with a fallback RPC); writes are signed with keys from the legacy
 * keychain and always wait for FINAL. Every write returns a `TxResult` that scripts log to evidence/.
 */
import { PublicKey, actions, type Action } from 'near-api-js';
import { NearRpc, RpcError, type ErrorCode, type Nep297Event } from '@commonkit/sdk';
import { NearSigner, type OutcomeSummary } from '@commonkit/sdk/signer';
import { MAX_TX_GAS, RPC_URLS, TGAS, assertTestnet } from './config.js';
import { Keystore } from './keystore.js';

export interface TxResult {
  hash: string;
  signer: string;
  receiver: string;
  ok: boolean;
  /** Failure message of the transaction (first failing receipt on the main path). */
  failure: string | null;
  errorCode: ErrorCode | null;
  /** Failures in any receipt, including detached callbacks that do not fail the tx. */
  receiptFailures: string[];
  logs: string[];
  events: Nep297Event[];
  returnValue: unknown;
  gasBurnt: bigint;
}

export interface CallOpts {
  gas?: bigint;
  deposit?: bigint;
  /** Sign with this stored public key instead of the account's primary key. */
  publicKey?: string;
  /** Do not throw when the tx fails (negative demo steps). */
  allowFailure?: boolean;
}

export const toTxResult = (hash: string, o: OutcomeSummary): TxResult => ({
  hash,
  signer: o.signerId,
  receiver: o.receiverId,
  ok: o.ok,
  failure: o.failure,
  errorCode: o.errorCode,
  receiptFailures: o.receiptFailures,
  logs: o.logs,
  events: o.events,
  returnValue: o.returnValue,
  gasBurnt: o.gasBurnt,
});

const isTransient = (e: unknown): boolean =>
  e instanceof TypeError || (e instanceof RpcError && /^RPC HTTP (429|5\d\d)/.test(e.message));

export class Chain {
  readonly keystore: Keystore;
  readonly rpcs: NearRpc[];
  private readonly signers = new Map<string, NearSigner>();

  constructor(keystore = new Keystore()) {
    assertTestnet();
    this.keystore = keystore;
    this.rpcs = RPC_URLS.map((u) => new NearRpc(u));
  }

  // ---------- reads ----------

  private async read<T>(fn: (rpc: NearRpc) => Promise<T>): Promise<T> {
    let last: unknown;
    for (const rpc of this.rpcs)
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await fn(rpc);
        } catch (e) {
          last = e;
          if (!isTransient(e)) throw e;
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
      }
    throw last;
  }

  view<T>(contractId: string, method: string, args: object = {}): Promise<T> {
    return this.read((r) => r.view<T>(contractId, method, args));
  }

  viewAccount(accountId: string) {
    return this.read((r) => r.viewAccount(accountId));
  }

  async accessKeys(accountId: string): Promise<{ public_key: string; access_key: unknown }[]> {
    return (await this.read((r) => r.viewAccessKeyList(accountId))).keys;
  }

  async accountExists(accountId: string): Promise<boolean> {
    try {
      await this.viewAccount(accountId);
      return true;
    } catch (e) {
      if (
        e instanceof RpcError &&
        /UNKNOWN_ACCOUNT|does not exist/.test(JSON.stringify(e.data) + e.message)
      )
        return false;
      throw e;
    }
  }

  async balance(accountId: string): Promise<bigint> {
    return BigInt((await this.viewAccount(accountId)).amount);
  }

  // ---------- writes ----------

  /** One shared signer per (account, key): nonces are serialized per key (sdk NearSigner). */
  signer(accountId: string, publicKey?: string): NearSigner {
    const key = `${accountId}#${publicKey ?? ''}`;
    let sg = this.signers.get(key);
    if (!sg) {
      sg = NearSigner.fromKeychain(
        accountId,
        { ...(publicKey ? { publicKey } : {}), dir: this.keystore.dir },
        { rpcUrls: RPC_URLS },
      );
      this.signers.set(key, sg);
    }
    return sg;
  }

  /** Sign, send and wait for FINAL. Throws sdk TxPanicError on failure unless `allowFailure`. */
  async send(
    signerId: string,
    receiverId: string,
    txActions: Action[],
    opts: CallOpts = {},
  ): Promise<TxResult> {
    const r = await this.signer(signerId, opts.publicKey).signAndSendActions(
      receiverId,
      txActions,
      { allowFailure: opts.allowFailure ?? false },
    );
    return toTxResult(r.txHash, r.outcome);
  }

  call(
    signerId: string,
    contractId: string,
    method: string,
    args: object = {},
    opts: CallOpts = {},
  ): Promise<TxResult> {
    const gas = opts.gas ?? 100n * TGAS;
    if (gas > MAX_TX_GAS) throw new Error(`gas ${gas} above budget ${MAX_TX_GAS}`);
    return this.send(
      signerId,
      contractId,
      [actions.functionCall(method, args, gas, opts.deposit ?? 0n)],
      opts,
    );
  }

  transfer(from: string, to: string, amount: bigint): Promise<TxResult> {
    return this.send(from, to, [actions.transfer(amount)]);
  }

  /** Create `newId` (a sub-account of `parent`) with a fresh full-access key stored in the keychain. */
  async createSubAccount(
    parent: string,
    newId: string,
    amount: bigint,
  ): Promise<{ tx: TxResult; publicKey: string }> {
    if (!newId.endsWith(`.${parent}`))
      throw new Error(`${newId} is not a sub-account of ${parent}`);
    const publicKey = this.keystore.generate(newId, { primary: true });
    const tx = await this.send(parent, newId, [
      actions.createAccount(),
      actions.transfer(amount),
      actions.addFullAccessKey(PublicKey.from(publicKey)),
    ]);
    return { tx, publicKey };
  }

  /**
   * Create a sub-account, fund it, add a full-access key (kept until the account is marked
   * keyless), deploy `wasm` and call its init method — all in one transaction signed by the parent.
   */
  async createAndDeploy(
    parent: string,
    newId: string,
    amount: bigint,
    wasm: Uint8Array,
    init: { method: string; args: object; gas?: bigint },
  ): Promise<{ tx: TxResult; publicKey: string }> {
    if (!newId.endsWith(`.${parent}`))
      throw new Error(`${newId} is not a sub-account of ${parent}`);
    const publicKey = this.keystore.generate(newId, { primary: true });
    const tx = await this.send(parent, newId, [
      actions.createAccount(),
      actions.transfer(amount),
      actions.addFullAccessKey(PublicKey.from(publicKey)),
      actions.deployContract(wasm),
      actions.functionCall(init.method, init.args, init.gas ?? 100n * TGAS, 0n),
    ]);
    return { tx, publicKey };
  }

  /** Deploy + init in one tx, signed by the (existing, key-holding) account itself. */
  deployAndInit(
    accountId: string,
    wasm: Uint8Array,
    init: { method: string; args: object; gas?: bigint },
  ): Promise<TxResult> {
    return this.send(accountId, accountId, [
      actions.deployContract(wasm),
      actions.functionCall(init.method, init.args, init.gas ?? 100n * TGAS, 0n),
    ]);
  }

  /** Add a function-call key (0-deposit calls only, research B11) to `accountId`; key stored in keychain. */
  async addFunctionCallKey(
    accountId: string,
    receiverId: string,
    methodNames: string[],
    allowance?: bigint,
  ): Promise<{ tx: TxResult; publicKey: string }> {
    const publicKey = this.keystore.generate(accountId, { primary: false });
    const tx = await this.send(accountId, accountId, [
      actions.addFunctionCallAccessKey(
        PublicKey.from(publicKey),
        receiverId,
        methodNames,
        allowance,
      ),
    ]);
    return { tx, publicKey };
  }

  /** Delete one access key of `accountId`, signed by that same key. */
  deleteKey(accountId: string, publicKey: string): Promise<TxResult> {
    return this.send(accountId, accountId, [actions.deleteKey(PublicKey.from(publicKey))], {
      publicKey,
    });
  }
}
