/**
 * Sputnik DAO v2 helpers (DAO_INTEGRATION §4). Shapes verified on testnet in research C2–C11.
 * Pure encoders are exported for tests; every write returns tx hashes for evidence/.
 */
import { MAX_PROPOSAL_ACTION_GAS, MAX_TX_GAS, SPUTNIK_FACTORY, TGAS } from './config.js';
import type { Chain, TxResult } from './near.js';

export interface FnAction {
  method_name: string;
  args: object;
  deposit?: bigint;
  gas?: bigint;
}

export type ProposalKind =
  | { FunctionCall: { receiver_id: string; actions: FnAction[] } }
  | { Transfer: { receiver_id: string; amount: bigint } };

export interface Proposal {
  id: number;
  proposer: string;
  description: string;
  kind: unknown;
  status: 'InProgress' | 'Approved' | 'Rejected' | 'Removed' | 'Expired' | 'Moved' | 'Failed';
  vote_counts: Record<string, [number, number, number]>;
  votes: Record<string, string>;
  submission_time: string;
}

export interface Policy {
  roles: { name: string; kind: unknown; permissions: string[] }[];
  default_vote_policy: { weight_kind: string; quorum: string; threshold: unknown };
  proposal_bond: string;
  proposal_period: string;
}

export const DEFAULT_ACTION_GAS = 50n * TGAS;

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64');

/** Pure: encode a proposal as accepted by `add_proposal` (research §3.2). */
export function encodeProposal(description: string, kind: ProposalKind): { proposal: object } {
  if ('Transfer' in kind) {
    const t = kind.Transfer;
    return {
      proposal: {
        description,
        kind: {
          Transfer: {
            token_id: '',
            receiver_id: t.receiver_id,
            amount: t.amount.toString(),
            msg: null,
          },
        },
      },
    };
  }
  const fc = kind.FunctionCall;
  if (fc.actions.length === 0) throw new Error('FunctionCall proposal needs at least one action');
  const gasSum = fc.actions.reduce((s, a) => s + (a.gas ?? DEFAULT_ACTION_GAS), 0n);
  if (gasSum > MAX_PROPOSAL_ACTION_GAS)
    throw new Error(
      `proposal action gas ${gasSum / TGAS} Tgas exceeds ${MAX_PROPOSAL_ACTION_GAS / TGAS} Tgas`,
    );
  return {
    proposal: {
      description,
      kind: {
        FunctionCall: {
          receiver_id: fc.receiver_id,
          actions: fc.actions.map((a) => ({
            method_name: a.method_name,
            args: b64(JSON.stringify(a.args)),
            deposit: (a.deposit ?? 0n).toString(),
            gas: (a.gas ?? DEFAULT_ACTION_GAS).toString(),
          })),
        },
      },
    },
  };
}

/** Pure: Sputnik `Ratio(n,d)` threshold → votes needed (research C, `min(total*n/d + 1, total)`). */
export function votesNeeded(councilSize: number, threshold: [number, number] = [1, 2]): number {
  const [n, d] = threshold;
  return Math.min(Math.floor((councilSize * n) / d) + 1, councilSize);
}

/** Pure: DAO `create` args (research §3.1). */
export function encodeCreateDao(
  name: string,
  purpose: string,
  council: string[],
): { name: string; args: string } {
  if (!/^[a-z0-9-]{2,40}$/.test(name)) throw new Error(`invalid DAO name ${name}`);
  if (council.length === 0) throw new Error('council must not be empty');
  return {
    name,
    args: b64(JSON.stringify({ config: { name, purpose, metadata: '' }, policy: council })),
  };
}

/** Pure: JSON with object keys sorted, for comparing proposal kinds read back from the DAO. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

export const daoAccountId = (name: string): string => `${name}.${SPUTNIK_FACTORY}`;

export class Dao {
  constructor(
    private readonly chain: Chain,
    readonly id: string,
  ) {}

  static async create(
    chain: Chain,
    signer: string,
    name: string,
    purpose: string,
    council: string[],
    deposit: bigint,
  ): Promise<{ dao: Dao; tx: TxResult }> {
    const tx = await chain.call(
      signer,
      SPUTNIK_FACTORY,
      'create',
      encodeCreateDao(name, purpose, council),
      {
        gas: MAX_TX_GAS,
        deposit,
      },
    );
    // The factory refunds a failed creation in its callback; the tx itself still "succeeds".
    if (tx.returnValue !== true && !(await chain.accountExists(daoAccountId(name))))
      throw new Error(
        `DAO ${name} was not created (tx ${tx.hash}): ${tx.receiptFailures.join('; ')}`,
      );
    return { dao: new Dao(chain, daoAccountId(name)), tx };
  }

  getPolicy(): Promise<Policy> {
    return this.chain.view<Policy>(this.id, 'get_policy');
  }

  getProposal(id: number): Promise<Proposal> {
    return this.chain.view<Proposal>(this.id, 'get_proposal', { id });
  }

  async council(): Promise<string[]> {
    const policy = await this.getPolicy();
    const role = policy.roles.find((r) => r.name === 'council');
    const kind = role?.kind as { Group?: string[] } | undefined;
    return kind?.Group ?? [];
  }

  async propose(
    description: string,
    kind: ProposalKind,
    signer: string,
  ): Promise<{ proposalId: number; tx: TxResult }> {
    const bond = BigInt((await this.getPolicy()).proposal_bond);
    const tx = await this.chain.call(
      signer,
      this.id,
      'add_proposal',
      encodeProposal(description, kind),
      {
        gas: 50n * TGAS,
        deposit: bond,
      },
    );
    if (typeof tx.returnValue !== 'number')
      throw new Error(`add_proposal returned ${String(tx.returnValue)} (tx ${tx.hash})`);
    return { proposalId: tx.returnValue, tx };
  }

  /** Latest InProgress proposal with exactly this description and kind, among the last `scan`. */
  async findOpenProposal(
    description: string,
    kind: ProposalKind,
    scan = 30,
  ): Promise<Proposal | null> {
    const next = await this.chain.view<number>(this.id, 'get_last_proposal_id');
    const from = Math.max(0, next - scan);
    const list = await this.chain.view<Proposal[]>(this.id, 'get_proposals', {
      from_index: from,
      limit: scan,
    });
    const want = canonicalJson(
      (encodeProposal(description, kind).proposal as { kind: unknown }).kind,
    );
    const hit = list
      .filter(
        (p) =>
          p.status === 'InProgress' &&
          p.description === description &&
          canonicalJson(p.kind) === want,
      )
      .pop();
    return hit ?? null;
  }

  voteApprove(proposalId: number, signer: string): Promise<TxResult> {
    return this.chain.call(
      signer,
      this.id,
      'act_proposal',
      { id: proposalId, action: 'VoteApprove' },
      { gas: MAX_TX_GAS },
    );
  }

  /**
   * Add a proposal and vote it through with council signers until it leaves InProgress.
   * Throws unless the final status is Approved. Returns every tx for evidence/.
   */
  async proposeAndPass(
    description: string,
    kind: ProposalKind,
    councilSigners: string[],
    proposer = councilSigners[0],
  ): Promise<{ proposalId: number; txs: TxResult[]; proposal: Proposal }> {
    if (!proposer) throw new Error('no proposer');
    // Resume: an interrupted run may have left the identical proposal InProgress.
    const open = await this.findOpenProposal(description, kind);
    const txs: TxResult[] = [];
    let proposalId: number;
    if (open) proposalId = open.id;
    else {
      const added = await this.propose(description, kind, proposer);
      proposalId = added.proposalId;
      txs.push(added.tx);
    }
    let proposal = await this.getProposal(proposalId);
    for (const voter of councilSigners) {
      if (proposal.status !== 'InProgress') break;
      if (proposal.votes[voter]) continue;
      txs.push(await this.voteApprove(proposalId, voter));
      proposal = await this.getProposal(proposalId);
    }
    if (proposal.status !== 'Approved') {
      const fails = txs.flatMap((t) => t.receiptFailures);
      throw new Error(
        `proposal ${this.id}#${proposalId} ended ${proposal.status}: ${fails.join('; ')}`,
      );
    }
    // An approved FunctionCall whose action panicked is stored as Failed by Sputnik, so Approved
    // means every action succeeded (research C9: actions are atomic in one receipt).
    return { proposalId, txs, proposal };
  }
}
