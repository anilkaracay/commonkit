/**
 * Writes and reads on the local SANDBOX chain (D-420): throw-away ed25519 keys held in memory,
 * one `@commonkit/sdk/signer` NearSigner per account (D-707). Never used against testnet.
 */
import { KeyPair, PublicKey, actions, type Action, type KeyPairString } from 'near-api-js';
import { NearRpc, type Nep297Event } from '@commonkit/sdk';
import { NearSigner, TxPanicError, type OutcomeSummary } from '@commonkit/sdk/signer';

export const TGAS = 1_000_000_000_000n;
export const NEAR = 10n ** 24n;

export interface Tx {
  hash: string;
  ok: boolean;
  errorCode: string | null;
  failure: string | null;
  receiptFailures: string[];
  events: Nep297Event[];
  returnValue: unknown;
}

const toTx = (hash: string, o: OutcomeSummary): Tx => ({
  hash,
  ok: o.ok && o.receiptFailures.length === 0,
  errorCode: o.errorCode,
  failure: o.failure,
  receiptFailures: o.receiptFailures,
  events: o.events,
  returnValue: o.returnValue,
});

export interface FnAction {
  method_name: string;
  args: object;
  deposit?: bigint;
  gas?: bigint;
}

export class SandboxChain {
  readonly rpc: NearRpc;
  private readonly keys = new Map<string, string>();
  private readonly signers = new Map<string, NearSigner>();

  constructor(
    readonly rpcUrl: string,
    readonly root: string,
    rootKey: string,
  ) {
    this.rpc = new NearRpc(rpcUrl);
    this.keys.set(root, rootKey);
  }

  /** The account's full-access secret (`ed25519:…`), for NEP-413 signing by members. */
  secretOf(account: string): string {
    const k = this.keys.get(account);
    if (!k) throw new Error(`no sandbox key for ${account}`);
    return k;
  }

  private signer(account: string): NearSigner {
    let s = this.signers.get(account);
    if (!s) {
      s = new NearSigner(account, this.secretOf(account) as KeyPairString, { rpcUrls: [this.rpcUrl], timeoutMs: 60_000 });
      this.signers.set(account, s);
    }
    return s;
  }

  async send(signer: string, receiver: string, txActions: Action[], allowFailure = false): Promise<Tx> {
    try {
      const r = await this.signer(signer).signAndSendActions(receiver, txActions, { allowFailure });
      return toTx(r.txHash, r.outcome);
    } catch (e) {
      if (e instanceof TxPanicError && allowFailure) return { hash: e.ref.txHash, ok: false, errorCode: e.code ?? null, failure: e.message, receiptFailures: [], events: [], returnValue: null };
      throw e;
    }
  }

  call(signer: string, receiver: string, method: string, args: object, o: { gas?: bigint; deposit?: bigint; allowFailure?: boolean } = {}): Promise<Tx> {
    return this.send(signer, receiver, [actions.functionCall(method, args, o.gas ?? 100n * TGAS, o.deposit ?? 0n)], o.allowFailure ?? false);
  }

  view<T>(contract: string, method: string, args: object = {}): Promise<T> {
    return this.rpc.view<T>(contract, method, args);
  }

  async balance(account: string): Promise<bigint> {
    return BigInt((await this.rpc.viewAccount(account)).amount);
  }

  async codeHash(account: string): Promise<string> {
    return (await this.rpc.viewAccount(account)).code_hash;
  }

  async accessKeys(account: string): Promise<string[]> {
    return (await this.rpc.viewAccessKeyList(account)).keys.map((k) => k.public_key);
  }

  async chainNowNs(): Promise<bigint> {
    const b = await this.rpc.call<{ header: { timestamp_nanosec: string } }>('block', { finality: 'final' });
    return BigInt(b.header.timestamp_nanosec);
  }

  /** Sub-account of the root with a fresh full-access key kept in memory. */
  async createAccount(id: string, amount: bigint): Promise<Tx> {
    const kp = KeyPair.fromRandom('ed25519');
    const tx = await this.send(this.root, id, [actions.createAccount(), actions.transfer(amount), actions.addFullAccessKey(kp.getPublicKey())]);
    this.keys.set(id, kp.toString());
    return tx;
  }

  /** Sub-account with a full-access key, code deployed and initialised in one tx (DAO, commons). */
  async createAndDeploy(id: string, amount: bigint, wasm: Uint8Array, init: { method: string; args: object }): Promise<Tx> {
    const kp = KeyPair.fromRandom('ed25519');
    const tx = await this.send(this.root, id, [
      actions.createAccount(),
      actions.transfer(amount),
      actions.addFullAccessKey(kp.getPublicKey()),
      actions.deployContract(wasm),
      actions.functionCall(init.method, init.args, 100n * TGAS, 0n),
    ]);
    this.keys.set(id, kp.toString());
    return tx;
  }

  /**
   * Keyless from birth (invariant 9): create, fund, deploy and initialise in one tx and never add
   * a key. Only the contract's own methods (and its DAO through them) can act for the account.
   */
  createKeyless(id: string, amount: bigint, wasm: Uint8Array, init: { method: string; args: object }): Promise<Tx> {
    return this.send(this.root, id, [
      actions.createAccount(),
      actions.transfer(amount),
      actions.deployContract(wasm),
      actions.functionCall(init.method, init.args, 100n * TGAS, 0n),
    ]);
  }

  /** Function-call key on `account` for `receiver` (0-deposit calls of `methods` only). Returns its secret. */
  async addFunctionCallKey(account: string, receiver: string, methods: string[]): Promise<{ secret: string; publicKey: string; tx: Tx }> {
    const kp = KeyPair.fromRandom('ed25519');
    const tx = await this.send(account, account, [actions.addFunctionCallAccessKey(PublicKey.from(kp.getPublicKey().toString()), receiver, methods)]);
    return { secret: kp.toString(), publicKey: kp.getPublicKey().toString(), tx };
  }
}

/** Sputnik DAO v2 on the sandbox: proposals voted through by the council (2 of 3). */
export class SandboxDao {
  constructor(
    private readonly chain: SandboxChain,
    readonly id: string,
    readonly council: string[],
  ) {}

  /** add_proposal (FunctionCall) + votes until Approved. Returns every tx hash; throws otherwise. */
  async pass(description: string, receiver: string, fnActions: FnAction[]): Promise<{ proposalId: number; txs: Tx[] }> {
    const policy = await this.chain.view<{ proposal_bond: string }>(this.id, 'get_policy');
    const kind = {
      FunctionCall: {
        receiver_id: receiver,
        actions: fnActions.map((a) => ({
          method_name: a.method_name,
          args: Buffer.from(JSON.stringify(a.args)).toString('base64'),
          deposit: (a.deposit ?? 0n).toString(),
          gas: (a.gas ?? 50n * TGAS).toString(),
        })),
      },
    };
    const add = await this.chain.call(this.council[0]!, this.id, 'add_proposal', { proposal: { description, kind } }, { gas: 50n * TGAS, deposit: BigInt(policy.proposal_bond) });
    if (typeof add.returnValue !== 'number') throw new Error(`add_proposal returned ${String(add.returnValue)} (${add.hash})`);
    const id = add.returnValue;
    const txs = [add];
    for (const voter of this.council) {
      const p = await this.chain.view<{ status: string }>(this.id, 'get_proposal', { id });
      if (p.status !== 'InProgress') break;
      txs.push(await this.chain.call(voter, this.id, 'act_proposal', { id, action: 'VoteApprove' }, { gas: 300n * TGAS }));
    }
    const p = await this.chain.view<{ status: string }>(this.id, 'get_proposal', { id });
    if (p.status !== 'Approved') throw new Error(`proposal ${id} (${description}) ended ${p.status}: ${txs.flatMap((t) => t.receiptFailures).join('; ')}`);
    return { proposalId: id, txs };
  }
}
