/**
 * The only door between the UI and data. Every method maps 1:1 to a contract view
 * (contracts/{asset,commons}/src/views.rs), a NEAR RPC query, a Sputnik DAO view, or a file bundled at
 * build time (deployments/testnet.json, evidence/, profiles/). `createRpcSource` (testnet) is
 * the app's source; `createMockSource` exists for tests only. Pagination args are plain
 * numbers here; the RPC source sends them in each contract's JSON type (U64 string or u64).
 */
import { createContext, useContext } from 'react';
import type {
  AccessCheck,
  AccountId,
  Card,
  CredentialKindConfig,
  Escalation,
  AssetView,
  CommonsWiring,
  RoleEntry,
  SlotInfo,
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
  EvidenceTx,
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
  get_availability(from_slot: U64, count: number): Promise<SlotInfo[]>;
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
  /** Last session start/finish of `account` (fault-report eligibility, 14 days). */
  get_last_session_at(account: AccountId): Promise<U64 | null>;
  get_roles(account: AccountId): Promise<Role[]>;
  version(): Promise<string>;
}

/** Views of one `commons` contract. */
export interface CommonsViews {
  get_wiring(): Promise<CommonsWiring>;
  get_assets(): Promise<AssetView[]>;
  get_group(group_id: string): Promise<AccountId[]>;
  get_roles(account: AccountId): Promise<Role[]>;
  get_all_roles(from_index: number, limit: number): Promise<RoleEntry[]>;
  get_credential_kinds(): Promise<CredentialKindConfig[]>;
  get_trainings(from_index: number, limit: number): Promise<Training[]>;
  has_credential(account: AccountId, kind: string): Promise<boolean>;
  get_cards_for_owner(account: AccountId): Promise<Card[]>;
  /** NEP-171 enumeration (only the fields the app needs). */
  nft_tokens(from_index: number, limit: number): Promise<{ token_id: string; owner_id: AccountId }[]>;
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
  /** Discard cached views after a confirmed wallet transaction. */
  invalidateViews?(): void;
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
  /** evidence/{setup,seed,funding}.json: every recorded setup transaction. */
  getTxLog(): Promise<EvidenceTx[]>;
  /** evidence/agent-limits.json */
  getAgentLimits(): Promise<AgentLimitAttempt[]>;
}

export const DataSourceContext = createContext<DataSource | null>(null);

export function useDataSource(): DataSource {
  const source = useContext(DataSourceContext);
  if (!source) throw new Error('DataSourceContext missing: wrap the app in <DataSourceContext value={...}>');
  return source;
}
