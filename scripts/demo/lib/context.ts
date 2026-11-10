/**
 * What a demo step gets: the cast, signing through scripts/lib/near (keychain keys, FINAL),
 * typed views, governance through DAO proposals, the bridge and agent as child processes, and a
 * recorder that turns all of it into the step's evidence.
 */
import { yoctoToNear } from '@commonkit/sdk';
import { TGAS } from '../../lib/config.js';
import type { Deployments } from '../../lib/deployments.js';
import type { Chain, TxResult } from '../../lib/near.js';
import { startBridge, type BridgeAssets, type BridgeClient } from './bridge.js';
import type { Cast, CommunityCast } from './cast.js';
import { governance, type Governance } from './governance.js';
import { sleep, type Proc } from './procs.js';
import type { DemoStepRecord, StepRecorder } from './record.js';
import { AssetView, CommonsView } from './views.js';

export interface CallOpts {
  gas?: bigint;
  deposit?: bigint;
  publicKey?: string;
}

/** D-214 recommended attached gas per method (Tgas). Reward-starting methods need ≥ 125. */
export const GAS: Record<string, bigint> = {
  reserve: 120n,
  // D-214 says 60, but with a right the call schedules a Refund op and a RightRelease op, each with
  // its callback: 60 Tgas ran out on testnet (tx 2vYsjK98…, D-756). 150 leaves room for both.
  cancel_reservation: 150n,
  mark_no_show: 150n,
  confirm_return: 60n,
  claim_fee_refund: 60n,
  retry_op: 60n,
  sweep: 60n,
  reject_task: 60n,
  cancel_task: 60n,
  approve_task: 150n,
  council_approve_task: 150n,
  retry_reward: 150n,
  escalate: 60n,
  sync_escalation: 50n,
  refresh_dao_policy: 50n,
  approve_credential: 60n,
};

export class DemoContext {
  readonly gov: Governance;
  private bridgeProc: Proc | null = null;
  private bridgeClient: BridgeClient | null = null;

  constructor(
    readonly chain: Chain,
    readonly dep: Deployments,
    readonly cast: Cast,
    readonly rec: StepRecorder,
    readonly step: number,
    private readonly steps: DemoStepRecord[],
  ) {
    this.gov = governance(chain, cast.root, rec, step);
  }

  asset(id: string): AssetView {
    return new AssetView(this.chain, id);
  }
  commons(c: CommunityCast): CommonsView {
    return new CommonsView(this.chain, c.commons);
  }

  /** Record of an earlier step (from evidence/steps.json). */
  prior(step: number): DemoStepRecord | undefined {
    return this.steps.find((s) => s.step === step);
  }
  /** An output of an earlier step; throws with a clear message if that step has not run. */
  need(step: number, key: string): string {
    const v = this.prior(step)?.outputs[key];
    if (v === undefined) throw new Error(`step ${step} output "${key}" missing — run pnpm demo:step ${step} first`);
    return v;
  }
  /** This step's own output from an earlier (interrupted) attempt. */
  own(key: string): string | undefined {
    return this.rec.outputs[key];
  }

  /** Signed call that must succeed (throws TxPanicError otherwise); recorded in the evidence. */
  async call(label: string, signer: string, receiver: string, method: string, args: object = {}, o: CallOpts = {}): Promise<TxResult> {
    const tx = await this.chain.call(signer, receiver, method, args, {
      gas: o.gas ?? (GAS[method] ?? 30n) * TGAS,
      ...(o.deposit !== undefined ? { deposit: o.deposit } : {}),
      ...(o.publicKey ? { publicKey: o.publicKey } : {}),
    });
    return this.rec.tx(label, tx);
  }

  /** Signed call that is expected to fail with `code` (negative step); asserted and recorded. */
  async refused(label: string, code: string, signer: string, receiver: string, method: string, args: object = {}, o: CallOpts = {}): Promise<TxResult> {
    const tx = await this.chain.call(signer, receiver, method, args, {
      gas: o.gas ?? (GAS[method] ?? 30n) * TGAS,
      allowFailure: true,
      ...(o.deposit !== undefined ? { deposit: o.deposit } : {}),
      ...(o.publicKey ? { publicKey: o.publicKey } : {}),
    });
    this.rec.tx(label, tx, { expectedFailure: true });
    this.rec.expectCode(`${label} → ${code}`, tx, code);
    return tx;
  }

  /** Chain time of the latest final block (ns). */
  async chainNow(): Promise<bigint> {
    return chainTime(this.chain);
  }

  /** Wait (real time) until chain time reaches `ns`. */
  async waitChain(ns: bigint, why: string): Promise<void> {
    let now = await this.chainNow();
    if (now >= ns) return;
    console.log(`  waiting ${Number((ns - now) / 1_000_000_000n)} s (chain time) ${why}`);
    while (now < ns) {
      await sleep(Math.min(30_000, Number((ns - now) / 1_000_000n) + 1500));
      now = await this.chainNow();
    }
  }

  async balance(account: string): Promise<bigint> {
    return this.chain.balance(account);
  }

  /** The bridge for this step (started once per step with the assets it needs). */
  async bridge(assets: BridgeAssets): Promise<BridgeClient> {
    if (this.bridgeClient) return this.bridgeClient;
    const { client, proc } = await startBridge(assets, this.cast.bridge, `step${this.step}`);
    this.bridgeProc = proc;
    this.bridgeClient = client;
    return client;
  }

  async close(): Promise<void> {
    if (this.bridgeProc) await this.bridgeProc.stop();
    this.bridgeProc = null;
    this.bridgeClient = null;
  }
}

/** Chain time of the latest final block, with retries on rate limits (FastNEAR 429) and fallback RPC. */
export async function chainTime(chain: Chain): Promise<bigint> {
  let last: unknown;
  for (let i = 0; i < 6; i++)
    for (const rpc of chain.rpcs)
      try {
        const b = await rpc.call<{ header: { timestamp_nanosec: string } }>('block', { finality: 'final' });
        return BigInt(b.header.timestamp_nanosec);
      } catch (e) {
        last = e;
        await sleep(1000 * (i + 1));
      }
  throw last;
}

export const near = (y: bigint | string): string => `${yoctoToNear(y, 4)} NEAR`;

/** Find a NEP-297 event (any standard) in a tx, optionally matching its first data element. */
export function eventOf(tx: TxResult, name: string, pred: (d: Record<string, unknown>) => boolean = () => true): Record<string, unknown> | null {
  for (const e of tx.events) {
    if (e.event !== name) continue;
    const d = (Array.isArray(e.data) ? e.data[0] : e.data) as Record<string, unknown> | undefined;
    if (d && pred(d)) return d;
  }
  return null;
}

/** Token ids in NEP-171 `nft_mint` events (one event may list several ids). */
export function mintedTokenIds(tx: TxResult): string[] {
  return tx.events
    .filter((e) => e.event === 'nft_mint' && e.standard === 'nep171')
    .flatMap((e) => (Array.isArray(e.data) ? e.data : [e.data]) as { token_ids?: string[] }[])
    .flatMap((d) => d?.token_ids ?? []);
}

export const countEvents = (tx: TxResult, name: string): number => tx.events.filter((e) => e.event === name).length;
