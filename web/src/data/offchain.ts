/**
 * Shapes the web app reads from outside the two COMMONKIT contracts:
 *  - deployments/testnet.json (written by scripts/setup-testnet.ts, owner: chain-ops),
 *  - evidence/steps.json (TEST_PLAN §5) and evidence/agent-limits.json (AGENT_SPEC §5),
 *  - NEAR RPC account state (view_account, view_access_key_list),
 *  - Sputnik DAO v2 views (get_policy, get_proposals).
 * The deployment / evidence shapes are this app's expectation; chain-ops owns the files and
 * M7 reconciles any difference (see docs/DECISIONS.md D-503).
 */
import type { AccountId, U128, U64 } from './types';

export type MemberKind = 'team' | 'pilot' | 'demo-bot';

export interface DeployedAsset {
  asset_id: AccountId;
  alias: string; // "printer-01"
  community: string; // community slug
  profile_file: string; // "printer_3d.json"
  simulated: boolean; // adapter === "simulator"
  keyless: true;
  code_hash: string;
}

export interface DeployedCommunity {
  slug: string; // "makerlab"
  name: string;
  dao_id: AccountId;
  commons_id: AccountId;
  commons_code_hash: string;
  agent_id: AccountId;
  bridge_id: AccountId;
  simulated: boolean;
}

export interface DeployedMember {
  account_id: AccountId;
  display_name: string;
  kind: MemberKind;
  community: string;
}

export interface Deployment {
  network: 'testnet';
  root: AccountId;
  sputnik_factory: AccountId;
  /** sha256 of the reproducible asset.wasm build, as recorded by setup (null if not reproducible). */
  asset_wasm_sha256: string | null;
  commons_wasm_sha256: string | null;
  communities: DeployedCommunity[];
  assets: DeployedAsset[];
  members: DeployedMember[];
  /** Every account that must have an empty access key list. */
  keyless_accounts: AccountId[];
}

/** Non-chain profile `meta` block (docs/PROFILES.md). */
export interface ProfileMeta {
  display_name: string;
  community: string;
  icon: string;
  scenario_story_en: string;
}

/** NEAR RPC `view_account`. */
export interface AccountState {
  amount: U128;
  locked: U128;
  code_hash: string;
  storage_usage: number;
}

/** NEAR RPC `view_access_key_list` entry. */
export interface AccessKeyInfo {
  public_key: string;
  access_key: {
    nonce: number;
    permission: 'FullAccess' | { FunctionCall: { allowance: U128 | null; receiver_id: AccountId; method_names: string[] } };
  };
}

// ---------- Sputnik DAO v2 (shapes per sputnikdao2; confirmed in research C) ----------
export type ProposalStatus =
  | 'InProgress'
  | 'Approved'
  | 'Rejected'
  | 'Removed'
  | 'Expired'
  | 'Moved'
  | 'Failed';

export type ProposalKind =
  | { Transfer: { token_id: string; receiver_id: AccountId; amount: U128; msg: string | null } }
  | {
      FunctionCall: {
        receiver_id: AccountId;
        actions: { method_name: string; args: string; deposit: U128; gas: U64 }[];
      };
    }
  | Record<string, unknown>;

export interface Proposal {
  id: number;
  proposer: AccountId;
  description: string;
  kind: ProposalKind;
  status: ProposalStatus;
  vote_counts: Record<string, [U128, U128, U128]>;
  votes: Record<AccountId, 'Approve' | 'Reject' | 'Remove'>;
  submission_time: U64;
}

export interface PolicyRole {
  name: string;
  kind: 'Everyone' | { Group: AccountId[] } | { Member: U128 };
  permissions: string[];
}

export interface Policy {
  roles: PolicyRole[];
  proposal_bond: U128;
  proposal_period: U64;
}

// ---------- evidence ----------
export interface EvidenceAssertion {
  label: string;
  ok: boolean;
  detail?: string;
}

/** One entry of evidence/steps.json (TEST_PLAN §5). */
export interface EvidenceStep {
  step: number;
  title: string;
  txHashes: string[];
  explorerLinks: string[];
  assertions: EvidenceAssertion[];
  timestamp: string; // ISO 8601
}

/** One entry of evidence/agent-limits.json (AGENT_SPEC §5). */
export interface AgentLimitAttempt {
  attempt: string;
  expected: string;
  observed: string;
  ok: boolean;
  tx_hash: string | null;
}
