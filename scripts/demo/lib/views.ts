/**
 * Typed views of the asset and commons contracts used by the demo assertions. Shapes follow
 * contracts/asset/src/{types,views,ledger}.rs and contracts/commons/src/types.rs (U64/U128 are
 * JSON strings). Only the fields the steps read are typed.
 */
import type { Chain } from '../../lib/near.js';

export interface Rule {
  rule_id: string;
  kind: string;
  trigger: { Metric?: { metric: string; threshold: number }; Schedule?: { every_hours: number }; Report?: { min_reports: number } };
  title: string;
  reward_rights: number;
  reward_cash: string;
  reimbursable_max: string;
  requires_verification_test: boolean;
  claim_timeout_hours: number;
}

export interface Profile {
  slot_minutes: number;
  start_window_minutes: number;
  max_slots_per_reservation: number;
  price_per_slot: string;
  deposit: string;
  deposit_trusted: string;
  trusted_after: number;
  float_cap: string;
  period_reward_quota: number;
  rules: Rule[];
  [k: string]: unknown;
}

export interface Ledger {
  float_free: string;
  deposits_held: string;
  rewards_reserved: string;
  pending_out: string;
  bonds_outstanding: string;
  total_swept: string;
  total_refunded: string;
  total_reimbursed: string;
  float_cap: string;
  balance: string;
  invariant_ok: boolean;
}

export interface Reservation {
  id: string;
  holder: string;
  start_slot: string;
  slots: number;
  fee_paid: string;
  deposit_paid: string;
  right_id: string | null;
  status: string;
  storage_cost: string;
  right_op_id: string | null;
}

export interface Task {
  id: string;
  rule_id: string;
  kind: string;
  trigger: Rule['trigger'];
  opened_by: string;
  manual: boolean;
  rationale: string;
  due_value_at_open: number;
  reward_rights: number;
  status: string;
  claimer: string | null;
  expense: string;
  receipt_hash: string | null;
  expense_state: string | Record<string, unknown>;
  verification: { passed: boolean } | null;
  verifier: string | null;
  council_approver: string | null;
  reward_state: string | Record<string, unknown>;
  minted_right_ids: string[];
  reimbursement_op_id: string | null;
}

export interface RuleStatus {
  rule_id: string;
  kind: string;
  current: string;
  baseline: string;
  due_value: string;
  due: boolean;
  next_due_estimate: string | null;
  open_task: string | null;
  reward_rights: number;
}

export interface Op {
  id: string;
  kind: string;
  to: string;
  amount: string;
  ref_id: string | null;
  status: string;
}

export interface Escalation {
  id: string;
  kind: string;
  receiver: string;
  amount: string;
  task_id: string | null;
  proposal_id: string | null;
  status: string;
  requested_by: string;
}

export interface Wiring {
  dao_id: string;
  bridge_id: string | null;
  agent_id: string | null;
  profile_version: number;
}

export interface Reputation {
  sessions: number;
  clean_returns: number;
  upkeeps: number;
  fault_reports: number;
}

export interface Card {
  token_id: string;
  owner_id: string;
  kind: {
    type: 'UsageRight' | 'Credential';
    group_id?: string;
    kind?: string;
    source?: { type: string; asset?: string; task_id?: string; training_id?: string };
    status?: { state: 'Active' | 'Locked' | 'Consumed'; asset?: string; reservation_id?: string };
  };
  expired: boolean;
}

export interface ServicePeriod {
  seq: string;
  ended_at: string | null;
  ended_by: { RepairRewarded?: { task_id: string }; Council?: { account: string } } | null;
}

/** View helpers bound to one asset. */
export class AssetView {
  constructor(
    private readonly chain: Chain,
    readonly id: string,
  ) {}
  private v<T>(m: string, args: object = {}): Promise<T> {
    return this.chain.view<T>(this.id, m, args);
  }
  profile = () => this.v<Profile>('get_profile');
  wiring = () => this.v<Wiring>('get_wiring');
  ledger = () => this.v<Ledger>('get_ledger');
  reservation = (id: string) => this.v<Reservation | null>('get_reservation', { id });
  byHolder = (account: string) =>
    this.v<Reservation[]>('get_reservations_by_holder', { account, from_index: '0', limit: 100 });
  slotOwner = (slot: bigint) => this.v<string | null>('get_slot_owner', { slot: slot.toString() });
  canAccess = (account: string, reservation_id: string) =>
    this.v<{ ok: boolean; reason: string }>('can_access', { account, reservation_id });
  telemetry = () => this.v<{ metrics: [string, number][] }>('get_telemetry');
  rules = () => this.v<RuleStatus[]>('get_rule_status');
  rule = async (ruleId: string): Promise<RuleStatus> => {
    const r = (await this.rules()).find((x) => x.rule_id === ruleId);
    if (!r) throw new Error(`${this.id}: no rule ${ruleId}`);
    return r;
  };
  task = (id: string) => this.v<Task | null>('get_task', { id });
  tasks = () => this.v<Task[]>('get_tasks', { from_index: '0', limit: 100 });
  op = (id: string) => this.v<Op | null>('get_op', { id });
  ops = () => this.v<Op[]>('get_ops', { from_index: '0', limit: 100 });
  escalations = () => this.v<Escalation[]>('get_escalations', { from_index: '0', limit: 100 });
  reputation = (account: string) => this.v<Reputation>('get_reputation', { account });
  reputationLog = () =>
    this.v<{ account: string; kind: string; ref_id: string }[]>('get_reputation_log', { from_index: '0', limit: 100 });
  period = () => this.v<{ rights_minted: number; rights_reserved: number }>('get_period');
  serviceStatus = () => this.v<{ in_service: boolean }>('get_service_status');
  serviceLog = () => this.v<ServicePeriod[]>('get_service_log', { from_index: '0', limit: 100 });
  roles = (account: string) => this.v<string[]>('get_roles', { account });
  faults = () => this.v<{ rule_id: string; reports: unknown[] }[]>('get_faults', {});
}

export class CommonsView {
  constructor(
    private readonly chain: Chain,
    readonly id: string,
  ) {}
  cards = (account: string) => this.chain.view<Card[]>(this.id, 'get_cards_for_owner', { account });
  card = (token_id: string) => this.chain.view<Card | null>(this.id, 'get_card', { token_id });
  hasCredential = (account: string, kind: string) =>
    this.chain.view<boolean>(this.id, 'has_credential', { account, kind });
  roles = (account: string) => this.chain.view<string[]>(this.id, 'get_roles', { account });
  asset = (asset_id: string) =>
    this.chain.view<{ group_id: string; active: boolean } | null>(this.id, 'get_asset', { asset_id });
  training = (training_id: string) =>
    this.chain.view<{ status: string; minted: string[] } | null>(this.id, 'get_training', { training_id });
}

/** Usage rights of an account, filtered by state and source. */
export function rightsOf(cards: Card[], state?: 'Active' | 'Locked' | 'Consumed', source?: string): Card[] {
  return cards.filter(
    (c) =>
      c.kind.type === 'UsageRight' &&
      !c.expired &&
      (!state || c.kind.status?.state === state) &&
      (!source || c.kind.source?.type === source),
  );
}

export const tag = (v: string | Record<string, unknown>): string => (typeof v === 'string' ? v : Object.keys(v)[0] ?? '');
