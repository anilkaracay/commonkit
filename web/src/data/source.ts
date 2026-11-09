/**
 * The only door between the UI and data. Every method maps 1:1 to a contract view
 * (CONTRACT_SPEC §3.6 / §5.2), a NEAR RPC query, a Sputnik DAO view, or a shipped
 * evidence/deployment file. `MockSource` implements it for M5; the RPC implementation
 * on top of packages/sdk replaces it in M7 without touching components.
 */
import { createContext, useContext } from 'react';
import type {
  AccessCheck,
  AccountId,
  Card,
  CredentialKindConfig,
  Escalation,
  AssetEntry,
  LedgerView,
  OutboundOp,
  Profile,
  Reputation,
  ReputationRecord,
  Reservation,
  RewardPeriod,
  Role,
  RuleStatus,
  RuleFaults,
  ServiceState,
  OutOfServicePeriod,
  Task,
  TaskStatus,
  Telemetry,
  Training,
  U64,
  Wiring,
  OpStatus,
} from './types';
import type {
  AccessKeyInfo,
  AccountState,
  AgentLimitAttempt,
  Deployment,
  EvidenceStep,
  Policy,
  ProfileMeta,
  CatalogEntry,
  Proposal,
} from './offchain';

/** Views of one `asset` contract. Method names follow the contract; args follow its JSON args. */
export interface AssetViews {
  get_profile(): Promise<Profile>;
  get_wiring(): Promise<Wiring>;
  get_ledger(): Promise<LedgerView>;
  get_reservation(id: U64): Promise<Reservation | null>;
  get_reservations(from_index: number, limit: number): Promise<Reservation[]>;
  get_reservations_by_holder(account: AccountId, from_index: number, limit: number): Promise<Reservation[]>;
  /** One entry per slot in [from_slot, from_slot + count): the holding reservation id or null. */
  get_availability(from_slot: U64, count: number): Promise<(U64 | null)[]>;
  can_access(account: AccountId, reservation_id: U64): Promise<AccessCheck>;
  get_telemetry(): Promise<Telemetry>;
  get_rule_status(): Promise<RuleStatus[]>;
  get_faults(rule_id?: string): Promise<RuleFaults[]>;
  get_service_status(): Promise<ServiceState>;
  get_service_log(from_index: number, limit: number): Promise<OutOfServicePeriod[]>;
  get_task(id: U64): Promise<Task | null>;
  get_tasks(from_index: number, limit: number, status?: TaskStatus): Promise<Task[]>;
  get_escalations(from_index: number, limit: number): Promise<Escalation[]>;
  get_ops(from_index: number, limit: number, status?: OpStatus): Promise<OutboundOp[]>;
  get_reputation(account: AccountId): Promise<Reputation>;
  get_reputation_log(from_index: number, limit: number): Promise<ReputationRecord[]>;
  get_period(): Promise<RewardPeriod>;
  get_roles(account: AccountId): Promise<Role[]>;
  version(): Promise<string>;
}

/** Views of one `commons` contract. */
export interface CommonsViews {
  get_assets(): Promise<[AccountId, AssetEntry][]>;
  get_group(group_id: string): Promise<AccountId[]>;
  get_roles(account: AccountId): Promise<Role[]>;
  get_all_roles(from_index: number, limit: number): Promise<[AccountId, Role[]][]>;
  get_credential_kinds(): Promise<CredentialKindConfig[]>;
  get_trainings(from_index: number, limit: number): Promise<Training[]>;
  has_credential(account: AccountId, kind: string): Promise<boolean>;
  get_cards_for_owner(account: AccountId): Promise<Card[]>;
  /** NEP-171 enumeration (only the fields the app needs). */
  nft_tokens(from_index: U64, limit: number): Promise<{ token_id: string; owner_id: AccountId }[]>;
  version(): Promise<string>;
}

/** Sputnik DAO v2 views. */
export interface DaoViews {
  get_policy(): Promise<Policy>;
  get_last_proposal_id(): Promise<number>;
  get_proposals(from_index: number, limit: number): Promise<Proposal[]>;
  get_proposal(id: number): Promise<Proposal | null>;
}

export interface DataSource {
  readonly kind: 'mock' | 'rpc';
  /** Wall clock in ms used for windows and ages (fixed in the mock so screenshots are stable). */
  now(): number;
  asset(assetId: AccountId): AssetViews;
  commons(commonsId: AccountId): CommonsViews;
  dao(daoId: AccountId): DaoViews;
  /** Sputnik factory `get_dao_list`. */
  getDaoList(factoryId: AccountId): Promise<AccountId[]>;
  /** RPC `view_account` (balance + code_hash). */
  viewAccount(accountId: AccountId): Promise<AccountState>;
  /** RPC `view_access_key_list`. */
  viewAccessKeyList(accountId: AccountId): Promise<AccessKeyInfo[]>;
  /** deployments/testnet.json */
  getDeployment(): Promise<Deployment>;
  /** Every profile in profiles/*.json with its meta (scenario matrix). */
  getProfileCatalog(): Promise<CatalogEntry[]>;
  /** profiles/<file>.json `meta` block */
  getProfileMeta(assetId: AccountId): Promise<ProfileMeta>;
  /** evidence/steps.json */
  getEvidenceSteps(): Promise<EvidenceStep[]>;
  /**
   * Tx hash behind a UI row (e.g. "task-printer-01-2", "mint-printer-01-1"), resolved from the
   * evidence index / explorer. null when unknown — the row then shows no tx link.
   */
  rowTx(key: string): string | null;
  /** evidence/agent-limits.json */
  getAgentLimits(): Promise<AgentLimitAttempt[]>;
}

export const DataSourceContext = createContext<DataSource | null>(null);

export function useDataSource(): DataSource {
  const source = useContext(DataSourceContext);
  if (!source) throw new Error('DataSourceContext missing: wrap the app in <DataSourceContext value={...}>');
  return source;
}
