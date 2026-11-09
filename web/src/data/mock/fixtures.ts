/**
 * MOCK world for M5 design work. Nothing here is on-chain. Shapes follow CONTRACT_SPEC view
 * return types; numbers are internally consistent with the demo story (DEMO_SCRIPT §2) so the
 * ledger, gauges and proof checks behave like the real thing. The UI shows a MOCK DATA banner
 * whenever this source is active. Tx/code hashes start with "mock" so they can never pass for real.
 */
import { parseNear } from '../../lib/near';
import { slotOf } from '../../lib/time';
import type {
  AccountId,
  Card,
  CredentialKindConfig,
  Escalation,
  LedgerView,
  OutboundOp,
  Profile,
  Reputation,
  ReputationRecord,
  Reservation,
  Role,
  RuleStatus,
  Task,
  Telemetry,
  Training,
  Wiring,
  RewardPeriod,
  UpkeepKind,
  Trigger,
  UpkeepRule,
  ServiceState,
  OutOfServicePeriod,
  RuleFaults,
} from '../types';
import type {
  AgentLimitAttempt,
  Deployment,
  EvidenceStep,
  Policy,
  ProfileMeta,
  Proposal,
} from '../offchain';

export const MOCK_NOW_MS = Date.UTC(2026, 10, 12, 10, 0, 0);

const n = (near: string) => parseNear(near).toString();
const t = (iso: string) => (BigInt(Date.parse(iso)) * 1_000_000n).toString();
const slot = (iso: string, minutes: number) => slotOf(BigInt(t(iso)), minutes).toString();
const mockHash = (seed: string) => `mock${seed}`.padEnd(44, 'x').slice(0, 44);
const hex = (seed: string) => seed.repeat(64).slice(0, 64);

// ---------- accounts ----------
const ROOT = 'commonkit-demo.testnet';
export const A = {
  printer: `printer-01.makerlab.${ROOT}`,
  laser: `laser-01.makerlab.${ROOT}`,
  washer: `washer-01.dorm-b.${ROOT}`,
  makerCommons: `commons.makerlab.${ROOT}`,
  dormCommons: `commons.dorm-b.${ROOT}`,
  makerDao: 'makerlab-ck.sputnikv2.testnet',
  dormDao: 'dorm-b-ck.sputnikv2.testnet',
  makerAgent: `agent-01.makerlab.${ROOT}`,
  dormAgent: `agent-01.dorm-b.${ROOT}`,
  makerBridge: `bridge-01.makerlab.${ROOT}`,
  dormBridge: `bridge-01.dorm-b.${ROOT}`,
  supplier: `parts-supplier.${ROOT}`,
  ali: `ali.${ROOT}`,
  can: `can.${ROOT}`,
  ayse: `ayse.${ROOT}`,
  mehmet: `mehmet.${ROOT}`,
  zeynep: `zeynep.${ROOT}`,
  hakan: `hakan.${ROOT}`,
  deniz: `deniz-bot.dorm-b.${ROOT}`,
  elif: `elif-bot.dorm-b.${ROOT}`,
  ozan: `ozan-bot.dorm-b.${ROOT}`,
} as const;

const ASSET_CODE_HASH = mockHash('AssetCodeHash7Rk2');
const COMMONS_CODE_HASH = mockHash('CommonsCodeHash3Qm');

// ---------- deployment ----------
export const deployment: Deployment = {
  network: 'testnet',
  root: ROOT,
  sputnik_factory: 'sputnikv2.testnet',
  asset_wasm_sha256: ASSET_CODE_HASH,
  commons_wasm_sha256: COMMONS_CODE_HASH,
  communities: [
    {
      slug: 'makerlab',
      name: 'Makerlab',
      dao_id: A.makerDao,
      commons_id: A.makerCommons,
      commons_code_hash: COMMONS_CODE_HASH,
      agent_id: A.makerAgent,
      bridge_id: A.makerBridge,
      simulated: false,
    },
    {
      slug: 'dorm-b',
      name: 'Dorm B laundry',
      dao_id: A.dormDao,
      commons_id: A.dormCommons,
      commons_code_hash: COMMONS_CODE_HASH,
      agent_id: A.dormAgent,
      bridge_id: A.dormBridge,
      simulated: true,
    },
  ],
  assets: [
    { asset_id: A.printer, alias: 'printer-01', community: 'makerlab', profile_file: 'printer_3d.json', simulated: false, keyless: true, code_hash: ASSET_CODE_HASH },
    { asset_id: A.laser, alias: 'laser-01', community: 'makerlab', profile_file: 'laser_cutter.json', simulated: false, keyless: true, code_hash: ASSET_CODE_HASH },
    { asset_id: A.washer, alias: 'washer-01', community: 'dorm-b', profile_file: 'washer.json', simulated: true, keyless: true, code_hash: ASSET_CODE_HASH },
  ],
  members: [
    { account_id: A.ali, display_name: 'Ali', kind: 'pilot', community: 'makerlab' },
    { account_id: A.can, display_name: 'Can', kind: 'pilot', community: 'makerlab' },
    { account_id: A.ayse, display_name: 'Ayşe', kind: 'pilot', community: 'makerlab' },
    { account_id: A.mehmet, display_name: 'Mehmet', kind: 'team', community: 'makerlab' },
    { account_id: A.zeynep, display_name: 'Zeynep', kind: 'pilot', community: 'makerlab' },
    { account_id: A.hakan, display_name: 'Hakan', kind: 'team', community: 'makerlab' },
    { account_id: A.deniz, display_name: 'Deniz (bot)', kind: 'demo-bot', community: 'dorm-b' },
    { account_id: A.elif, display_name: 'Elif (bot)', kind: 'demo-bot', community: 'dorm-b' },
    { account_id: A.ozan, display_name: 'Ozan (bot)', kind: 'demo-bot', community: 'dorm-b' },
  ],
  keyless_accounts: [A.printer, A.laser, A.washer, A.makerCommons, A.dormCommons],
};

// ---------- profiles ----------
const rule = (
  rule_id: string,
  kind: UpkeepKind,
  trigger: Trigger,
  title: string,
  reward_rights: number,
  o: { test?: boolean; reimburse?: string } = {},
): UpkeepRule => ({
  rule_id,
  kind,
  trigger,
  title,
  reward_rights,
  reward_cash: '0',
  reimbursable_max: o.reimburse ? n(o.reimburse) : '0',
  requires_verification_test: o.test ?? false,
  claim_timeout_hours: 48,
});

const baseProfile = {
  max_slots_per_reservation: 4,
  booking_horizon_days: 14,
  storage_reserve: n('1'),
  auto_reward_cash_cap: n('0.5'),
  council_threshold_cash: n('0.25'),
  period_days: 30,
  period_reward_quota: 10,
  right_max_slots: 2,
  right_validity_days: 60,
  start_window_minutes: 15,
  protocol_fee_bps: 0,
  protocol_fee_receiver: null,
} satisfies Partial<Profile>;

const printerProfile: Profile = {
  ...baseProfile,
  asset_type: 'printer_3d',
  display_name: 'Prusa MK4 · printer-01',
  group_id: 'makerlab-fab',
  adapter: 'moonraker',
  usage_unit_label: 'job',
  slot_minutes: 30,
  price_per_slot: n('0.25'),
  deposit: n('2'),
  deposit_trusted: n('0.5'),
  trusted_after: 3,
  required_credential: null,
  float_cap: n('3'),
  first_task_needs_council: true,
  rules: [
    rule('nozzle_clean', 'Maintenance', { Metric: { metric: 'nozzle_seconds', threshold: 1800 } }, 'Nozzle cleaning', 2, { test: true }),
    rule('bed_level', 'Maintenance', { Metric: { metric: 'jobs_total', threshold: 50 } }, 'Bed levelling', 1),
    rule('filament_spool', 'Restock', { Metric: { metric: 'filament_mm', threshold: 330000 } }, 'Replace the filament spool', 1, { reimburse: '1.5' }),
  ],
};

const laserProfile: Profile = {
  ...baseProfile,
  asset_type: 'laser_cutter',
  display_name: 'CO₂ laser · laser-01',
  group_id: 'makerlab-fab',
  adapter: 'smart_plug',
  usage_unit_label: 'session_minutes',
  slot_minutes: 15,
  price_per_slot: n('0.1'),
  deposit: n('3'),
  deposit_trusted: n('1'),
  trusted_after: 3,
  required_credential: 'laser_safety',
  float_cap: n('3'),
  first_task_needs_council: true,
  rules: [
    rule('lens_clean', 'Cleaning', { Metric: { metric: 'run_seconds', threshold: 600 } }, 'Lens cleaning', 2, { test: true }),
    rule('safety_check', 'Inspection', { Schedule: { every_hours: 168 } }, 'Weekly extraction and interlock check', 1),
  ],
};

const washerProfile: Profile = {
  ...baseProfile,
  asset_type: 'washer',
  display_name: 'Washer · washer-01',
  group_id: 'dorm-b-laundry',
  adapter: 'simulator',
  usage_unit_label: 'cycle',
  slot_minutes: 60,
  price_per_slot: n('0.2'),
  deposit: '0',
  deposit_trusted: '0',
  trusted_after: 0,
  required_credential: null,
  float_cap: n('1'),
  first_task_needs_council: false,
  rules: [
    rule('filter_clean', 'Cleaning', { Metric: { metric: 'cycles', threshold: 30 } }, 'Filter cleaning', 3),
    rule('descale', 'Maintenance', { Metric: { metric: 'cycles', threshold: 120 } }, 'Descaling', 5),
    rule('fault_repair', 'Repair', { Report: { min_reports: 2 } }, 'Fix the reported fault', 4, { reimburse: '2' }),
  ],
};

export const profileMeta: Record<AccountId, ProfileMeta> = {
  [A.printer]: { display_name: 'Prusa MK4', community: 'makerlab', icon: 'printer_3d', status: 'real hardware', scenario_story_en: 'The makerspace printer. Pays for its own nozzles; whoever cleans it prints for free.' },
  [A.laser]: { display_name: 'CO₂ laser cutter', community: 'makerlab', icon: 'laser_cutter', status: 'real hardware', scenario_story_en: 'Needs a laser_safety credential. Trainers earn access by training others.' },
  [A.washer]: { display_name: 'Dorm washer', community: 'dorm-b', icon: 'washer', status: 'simulation', scenario_story_en: 'Simulated washer in a student dorm. Same contract, different commons.' },
};

// ---------- per-asset state ----------
function status(p: Profile, rule_id: string, current: number, baseline: number, due: boolean, open_task: string | null): RuleStatus {
  const r = p.rules.find((x) => x.rule_id === rule_id);
  if (!r) throw new Error(`mock: no rule ${rule_id}`);
  return { rule_id, kind: r.kind, trigger: r.trigger, current, baseline, due, next_due_estimate: null, open_task };
}

const inService: ServiceState = { in_service: true, since: t('2026-11-09T12:00:00Z'), reason_hash: null };

export interface MockAsset {
  profile: Profile;
  wiring: Wiring;
  ledger: LedgerView;
  reservations: Reservation[];
  telemetry: Telemetry;
  rules: RuleStatus[];
  faults: RuleFaults[];
  service: ServiceState;
  serviceLog: OutOfServicePeriod[];
  tasks: Task[];
  escalations: Escalation[];
  ops: OutboundOp[];
  reputation: Record<AccountId, Reputation>;
  reputationLog: ReputationRecord[];
  period: RewardPeriod;
  roles: Record<AccountId, Role[]>;
}

const ledger = (l: Partial<LedgerView> & Pick<LedgerView, 'float_free' | 'deposits_held' | 'account_balance'>): LedgerView => ({
  rewards_reserved: '0',
  pending_out: '0',
  total_fees_in: '0',
  total_swept: '0',
  total_refunded: '0',
  total_rewards_paid: '0',
  total_bonds_paid: '0',
  total_protocol_fees: '0',
  storage_reserve: n('1'),
  storage_usage: '48210',
  storage_byte_cost: '10000000000000000000',
  invariant_ok: true,
  ...l,
});

const res = (r: Partial<Reservation> & Pick<Reservation, 'id' | 'holder' | 'start_slot' | 'slots' | 'status' | 'created_at'>): Reservation => ({
  fee_paid: '0',
  deposit_paid: '0',
  right_id: null,
  session_started_at: null,
  session_finished_at: null,
  metrics_delta: null,
  return_result: null,
  ...r,
});

const makerRoles: Record<AccountId, Role[]> = {
  [A.mehmet]: ['verifier', 'council'],
  [A.hakan]: ['steward', 'council'],
  [A.ayse]: ['trainer', 'steward'],
};
const dormRoles: Record<AccountId, Role[]> = {
  [A.elif]: ['verifier', 'steward', 'council'],
  [A.ozan]: ['council'],
};

const printer: MockAsset = {
  profile: printerProfile,
  wiring: { dao_id: A.makerDao, commons_id: A.makerCommons, bridge_id: A.makerBridge, agent_id: A.makerAgent, profile_version: 1, roles_version: '4' },
  // funded 3 · fees 0.5+0.5+0.5+0.25 each swept back to cap · bond 0.1 → float 2.9
  ledger: ledger({
    float_free: n('2.9'),
    deposits_held: n('4'),
    account_balance: n('7.95'),
    total_fees_in: n('1.75'),
    total_swept: n('1.75'),
    total_refunded: n('6'),
    total_bonds_paid: n('0.1'),
  }),
  reservations: [
    res({ id: '1', holder: A.ali, start_slot: slot('2026-11-10T09:00:00Z', 30), slots: 2, fee_paid: n('0.5'), deposit_paid: n('2'), status: 'Closed', created_at: t('2026-11-10T08:41:00Z'), session_started_at: t('2026-11-10T09:02:00Z'), session_finished_at: t('2026-11-10T09:58:00Z'), metrics_delta: [['nozzle_seconds', '3360'], ['jobs_total', '1']], return_result: 'Clean' }),
    res({ id: '2', holder: A.ali, start_slot: slot('2026-11-10T14:00:00Z', 30), slots: 2, fee_paid: n('0.5'), deposit_paid: n('2'), status: 'Closed', created_at: t('2026-11-10T12:10:00Z'), session_started_at: t('2026-11-10T14:01:00Z'), session_finished_at: t('2026-11-10T14:55:00Z'), return_result: 'Clean' }),
    res({ id: '3', holder: A.ayse, start_slot: slot('2026-11-11T16:00:00Z', 30), slots: 2, deposit_paid: n('2'), right_id: 'right-1', status: 'Closed', created_at: t('2026-11-11T15:20:00Z'), session_started_at: t('2026-11-11T16:03:00Z'), session_finished_at: t('2026-11-11T16:50:00Z'), return_result: 'Clean' }),
    res({ id: '4', holder: A.ali, start_slot: slot('2026-11-12T09:30:00Z', 30), slots: 2, fee_paid: n('0.5'), deposit_paid: n('2'), status: 'InSession', created_at: t('2026-11-12T08:05:00Z'), session_started_at: t('2026-11-12T09:31:00Z') }),
    res({ id: '5', holder: A.zeynep, start_slot: slot('2026-11-12T15:00:00Z', 30), slots: 1, fee_paid: n('0.25'), deposit_paid: n('2'), status: 'Confirmed', created_at: t('2026-11-12T09:12:00Z') }),
  ],
  telemetry: { metrics: [['nozzle_seconds', '2950'], ['jobs_total', '58'], ['filament_mm', '341500']], updated_at: t('2026-11-12T09:58:00Z'), reports: '41' },
  rules: [
    status(printerProfile, 'nozzle_clean', 2950, 1830, false, null),
    status(printerProfile, 'bed_level', 58, 0, true, '2'),
    status(printerProfile, 'filament_spool', 341500, 0, true, '3'),
  ],
  faults: [],
  service: inService,
  serviceLog: [],
  tasks: [
    {
      id: '1', rule_id: 'nozzle_clean', opened_by: A.makerAgent,
      rationale: 'Nozzle time since last cleaning: 30.3 min (threshold 30 min, pilot value). 9 prints since then, 1 failed (11%). Opening "Nozzle cleaning" with reward: 2 usage rights.',
      kind: 'Maintenance', due_value_at_open: 1820, manual: false, expense: '0', receipt_hash: null, expense_state: 'None', reward_rights: 2, reward_cash: '0', needs_council: false, status: 'Rewarded',
      claimer: A.ayse, claimed_at: t('2026-11-11T08:20:00Z'), evidence_hash: hex('3fa9c1'), evidence_uri: null,
      verification: { passed: true, details_hash: hex('b07e'), reported_at: t('2026-11-11T09:05:00Z') },
      verifier: A.mehmet, council_approver: A.hakan, reward_state: 'Done', minted_right_ids: ['right-1', 'right-2'], created_at: t('2026-11-11T08:00:00Z'),
    },
    {
      id: '2', rule_id: 'bed_level', opened_by: A.makerAgent,
      rationale: 'Jobs since last bed levelling: 58 (threshold 50). Last two prints reported first-layer adhesion warnings. Opening "Bed levelling" with reward: 1 usage right.',
      kind: 'Maintenance', due_value_at_open: 52, manual: false, expense: '0', receipt_hash: null, expense_state: 'None', reward_rights: 1, reward_cash: '0', needs_council: false, status: 'Open',
      claimer: null, claimed_at: null, evidence_hash: null, evidence_uri: null, verification: null,
      verifier: null, council_approver: null, reward_state: 'NotStarted', minted_right_ids: [], created_at: t('2026-11-12T07:40:00Z'),
    },
    {
      id: '3', rule_id: 'filament_spool', kind: 'Restock', opened_by: A.makerAgent,
      rationale: 'Filament used since the last spool change: 341,500 mm (threshold 330,000 mm). Opening "Replace the filament spool" with reward: 1 usage right; documented cost reimbursable up to 1.5 NEAR.',
      due_value_at_open: 330400, manual: false, reward_rights: 1, reward_cash: '0', needs_council: false, status: 'Submitted',
      claimer: A.ali, claimed_at: t('2026-11-12T06:30:00Z'), evidence_hash: hex('c4f1'), evidence_uri: null,
      expense: n('1.2'), receipt_hash: hex('e7a0'), expense_state: 'None', verification: null,
      verifier: null, council_approver: null, reward_state: 'NotStarted', minted_right_ids: [], created_at: t('2026-11-12T06:00:00Z'),
    },
  ],
  escalations: [
    { id: '1', requested_by: A.makerAgent, kind: 'purchase', receiver: A.supplier, amount: n('4'), reason: 'Replacement nozzle kit after the first cleaning showed wear (purchase hint nozzle_clean, pilot).', task_id: '1', proposal_id: '7', status: 'Approved', bond_paid: n('0.1') },
  ],
  ops: [
    { id: '1', kind: 'Sweep', to: A.makerDao, amount: n('0.5'), ref_id: null, status: 'Succeeded', attempts: 1 },
    { id: '2', kind: 'Refund', to: A.ali, amount: n('2'), ref_id: '1', status: 'Succeeded', attempts: 1 },
    { id: '3', kind: 'Sweep', to: A.makerDao, amount: n('0.5'), ref_id: null, status: 'Succeeded', attempts: 1 },
    { id: '4', kind: 'Refund', to: A.ali, amount: n('2'), ref_id: '2', status: 'Succeeded', attempts: 1 },
    { id: '5', kind: 'Refund', to: A.ayse, amount: n('2'), ref_id: '3', status: 'Succeeded', attempts: 1 },
    { id: '6', kind: 'Sweep', to: A.makerDao, amount: n('0.5'), ref_id: null, status: 'Succeeded', attempts: 1 },
    { id: '7', kind: 'Sweep', to: A.makerDao, amount: n('0.25'), ref_id: null, status: 'Succeeded', attempts: 1 },
    { id: '8', kind: 'Bond', to: A.makerDao, amount: n('0.1'), ref_id: '1', status: 'Succeeded', attempts: 1 },
  ],
  reputation: {
    [A.ali]: { sessions: 3, clean_returns: 2, damages: 0, upkeeps: 0, fault_reports: 0 },
    [A.ayse]: { sessions: 1, clean_returns: 1, damages: 0, upkeeps: 1, fault_reports: 0 },
  },
  reputationLog: [
    { seq: '1', account: A.ali, kind: 'session', ref_id: '1', at: t('2026-11-10T09:58:00Z') },
    { seq: '2', account: A.ali, kind: 'clean_return', ref_id: '1', at: t('2026-11-10T10:10:00Z') },
    { seq: '3', account: A.ali, kind: 'session', ref_id: '2', at: t('2026-11-10T14:55:00Z') },
    { seq: '4', account: A.ali, kind: 'clean_return', ref_id: '2', at: t('2026-11-10T15:02:00Z') },
    { seq: '5', account: A.ayse, kind: 'upkeep', ref_id: '1', at: t('2026-11-11T09:40:00Z') },
    { seq: '6', account: A.ayse, kind: 'session', ref_id: '3', at: t('2026-11-11T16:50:00Z') },
    { seq: '7', account: A.ayse, kind: 'clean_return', ref_id: '3', at: t('2026-11-11T17:00:00Z') },
  ],
  period: { started_at: t('2026-11-09T12:00:00Z'), rights_minted: 2 },
  roles: makerRoles,
};

const laser: MockAsset = {
  profile: laserProfile,
  wiring: { dao_id: A.makerDao, commons_id: A.makerCommons, bridge_id: A.makerBridge, agent_id: A.makerAgent, profile_version: 1, roles_version: '4' },
  // funded 1 · fees 0.2 (reservation 2) → float 1.2 · deposits: reservation 3 (Ayşe, right)
  ledger: ledger({
    float_free: n('1.2'),
    deposits_held: n('3'),
    account_balance: n('5.25'),
    total_fees_in: n('0.2'),
    total_refunded: n('6.1'),
  }),
  reservations: [
    res({ id: '1', holder: A.zeynep, start_slot: slot('2026-11-11T10:00:00Z', 15), slots: 1, fee_paid: n('0.1'), deposit_paid: n('3'), status: 'Rejected', created_at: t('2026-11-11T09:30:00Z') }),
    res({ id: '2', holder: A.zeynep, start_slot: slot('2026-11-11T15:00:00Z', 15), slots: 2, fee_paid: n('0.2'), deposit_paid: n('3'), status: 'Closed', created_at: t('2026-11-11T14:10:00Z'), session_started_at: t('2026-11-11T15:01:00Z'), session_finished_at: t('2026-11-11T15:28:00Z'), metrics_delta: [['run_seconds', '420']], return_result: 'Clean' }),
    res({ id: '3', holder: A.ayse, start_slot: slot('2026-11-12T11:00:00Z', 15), slots: 2, deposit_paid: n('3'), right_id: 'right-2', status: 'Confirmed', created_at: t('2026-11-12T09:40:00Z') }),
  ],
  telemetry: { metrics: [['run_seconds', '420'], ['energy_wh', '312']], updated_at: t('2026-11-11T15:28:00Z'), reports: '6' },
  rules: [
    status(laserProfile, 'lens_clean', 420, 0, false, null),
    { ...status(laserProfile, 'safety_check', 47, 0, false, null), next_due_estimate: t('2026-11-17T11:00:00Z') },
  ],
  faults: [],
  service: inService,
  serviceLog: [],
  tasks: [],
  escalations: [],
  ops: [
    { id: '1', kind: 'Refund', to: A.zeynep, amount: n('3.1'), ref_id: '1', status: 'Succeeded', attempts: 1 },
    { id: '2', kind: 'Refund', to: A.zeynep, amount: n('3'), ref_id: '2', status: 'Succeeded', attempts: 1 },
  ],
  reputation: { [A.zeynep]: { sessions: 1, clean_returns: 1, damages: 0, upkeeps: 0, fault_reports: 0 } },
  reputationLog: [
    { seq: '1', account: A.zeynep, kind: 'session', ref_id: '2', at: t('2026-11-11T15:28:00Z') },
    { seq: '2', account: A.zeynep, kind: 'clean_return', ref_id: '2', at: t('2026-11-11T15:40:00Z') },
  ],
  period: { started_at: t('2026-11-09T12:00:00Z'), rights_minted: 0 },
  roles: makerRoles,
};

const washer: MockAsset = {
  profile: washerProfile,
  wiring: { dao_id: A.dormDao, commons_id: A.dormCommons, bridge_id: A.dormBridge, agent_id: A.dormAgent, profile_version: 1, roles_version: '2' },
  // funded 0.5 · 41 simulated cycles × 0.2 = 8.2 fees · float 0.8 → swept 7.9
  ledger: ledger({
    float_free: n('0.8'),
    deposits_held: '0',
    account_balance: n('1.85'),
    total_fees_in: n('8.2'),
    total_swept: n('7.9'),
  }),
  reservations: [
    res({ id: '40', holder: A.deniz, start_slot: slot('2026-11-12T07:00:00Z', 60), slots: 1, fee_paid: n('0.2'), status: 'Closed', created_at: t('2026-11-12T06:30:00Z'), session_started_at: t('2026-11-12T07:00:00Z'), session_finished_at: t('2026-11-12T07:52:00Z'), metrics_delta: [['cycles', '1']], return_result: 'Clean' }),
    res({ id: '41', holder: A.ozan, start_slot: slot('2026-11-12T06:00:00Z', 60), slots: 1, fee_paid: n('0.2'), status: 'Closed', created_at: t('2026-11-12T05:40:00Z'), session_started_at: t('2026-11-12T06:01:00Z'), session_finished_at: t('2026-11-12T06:50:00Z'), metrics_delta: [['cycles', '1']], return_result: 'Clean' }),
    res({ id: '42', holder: A.deniz, start_slot: slot('2026-11-12T18:00:00Z', 60), slots: 1, fee_paid: n('0.2'), status: 'Confirmed', created_at: t('2026-11-12T07:30:00Z') }),
  ],
  telemetry: { metrics: [['cycles', '41'], ['energy_wh', '30750']], updated_at: t('2026-11-12T09:55:00Z'), reports: '82' },
  rules: [
    status(washerProfile, 'filter_clean', 41, 31, false, null),
    status(washerProfile, 'descale', 41, 0, false, null),
    status(washerProfile, 'fault_repair', 2, 0, true, '2'),
  ],
  faults: [
    {
      rule_id: 'fault_repair',
      reports: [
        { reporter: A.ozan, note_hash: hex('0a1b'), at: t('2026-11-12T07:58:00Z') },
        { reporter: A.deniz, note_hash: hex('2c3d'), at: t('2026-11-12T08:05:00Z') },
      ],
    },
  ],
  service: { in_service: false, since: t('2026-11-12T08:15:00Z'), reason_hash: hex('5e6f') },
  serviceLog: [{ seq: '1', started_at: t('2026-11-12T08:15:00Z'), started_by: A.elif, reason_hash: hex('5e6f'), ended_at: null, ended_by: null }],
  tasks: [
    {
      id: '1', rule_id: 'filter_clean', opened_by: A.dormAgent,
      rationale: 'Cycles since last filter cleaning: 30 (threshold 30). Simulated scenario washer.yaml. Opening "Filter cleaning" with reward: 3 usage rights.',
      kind: 'Cleaning', due_value_at_open: 30, manual: false, expense: '0', receipt_hash: null, expense_state: 'None', reward_rights: 3, reward_cash: '0', needs_council: false, status: 'Rewarded',
      claimer: A.deniz, claimed_at: t('2026-11-11T19:10:00Z'), evidence_hash: hex('9d2e'), evidence_uri: null, verification: null,
      verifier: A.elif, council_approver: null, reward_state: 'Done', minted_right_ids: ['right-1', 'right-2', 'right-3'], created_at: t('2026-11-11T19:00:00Z'),
    },
    {
      id: '2', rule_id: 'fault_repair', kind: 'Repair', opened_by: A.dormAgent,
      rationale: 'Active fault reports: 2 from 2 recent users (threshold 2). The washer was taken out of service by a steward. Opening "Fix the reported fault" with reward: 4 usage rights; parts reimbursable up to 2 NEAR. Simulated scenario.',
      due_value_at_open: 2, manual: false, reward_rights: 4, reward_cash: '0', needs_council: false, status: 'Open',
      claimer: null, claimed_at: null, evidence_hash: null, evidence_uri: null, expense: '0', receipt_hash: null, expense_state: 'None', verification: null,
      verifier: null, council_approver: null, reward_state: 'NotStarted', minted_right_ids: [], created_at: t('2026-11-12T08:20:00Z'),
    },
  ],
  escalations: [],
  ops: [
    { id: '1', kind: 'Sweep', to: A.dormDao, amount: n('7.9'), ref_id: null, status: 'Succeeded', attempts: 1 },
  ],
  reputation: {
    [A.deniz]: { sessions: 22, clean_returns: 22, damages: 0, upkeeps: 1, fault_reports: 1 },
    [A.ozan]: { sessions: 19, clean_returns: 18, damages: 0, upkeeps: 0, fault_reports: 1 },
  },
  reputationLog: [
    { seq: '80', account: A.deniz, kind: 'upkeep', ref_id: '1', at: t('2026-11-11T19:40:00Z') },
    { seq: '81', account: A.deniz, kind: 'session', ref_id: '40', at: t('2026-11-12T07:52:00Z') },
    { seq: '82', account: A.ozan, kind: 'fault_report', ref_id: '0', at: t('2026-11-12T07:58:00Z') },
    { seq: '83', account: A.deniz, kind: 'fault_report', ref_id: '0', at: t('2026-11-12T08:05:00Z') },
  ],
  period: { started_at: t('2026-11-09T12:00:00Z'), rights_minted: 3 },
  roles: dormRoles,
};

export const assets: Record<AccountId, MockAsset> = { [A.printer]: printer, [A.laser]: laser, [A.washer]: washer };

// ---------- commons ----------
export interface MockCommons {
  groups: Record<string, AccountId[]>;
  roles: Record<AccountId, Role[]>;
  roles_version: string;
  credentialKinds: CredentialKindConfig[];
  trainings: Training[];
  cards: Card[];
}

export const commons: Record<AccountId, MockCommons> = {
  [A.makerCommons]: {
    groups: { 'makerlab-fab': [A.printer, A.laser] },
    roles: makerRoles,
    roles_version: '4',
    credentialKinds: [
      { kind: 'laser_safety', title: 'Laser safety', validity_days: 365, reward_group: 'makerlab-fab', trainer_reward_rights: 1, right_max_slots: 2, right_validity_days: 60 },
    ],
    trainings: [
      { id: '1', trainer: A.ayse, trainee: A.zeynep, kind: 'laser_safety', notes_hash: hex('51ab'), status: 'Approved', approver: A.mehmet, minted: ['cred-1', 'right-3'], created_at: t('2026-11-11T11:00:00Z') },
    ],
    cards: [
      { token_id: 'right-1', owner_id: A.ayse, kind: { UsageRight: { group_id: 'makerlab-fab', max_slots: 2, source: { Maintenance: { asset: A.printer, task_id: '1' } }, status: { Consumed: { asset: A.printer, reservation_id: '3' } } } }, issued_at: t('2026-11-11T09:40:00Z'), expires_at: t('2027-01-10T09:40:00Z') },
      { token_id: 'right-2', owner_id: A.ayse, kind: { UsageRight: { group_id: 'makerlab-fab', max_slots: 2, source: { Maintenance: { asset: A.printer, task_id: '1' } }, status: { Locked: { asset: A.laser, reservation_id: '3' } } } }, issued_at: t('2026-11-11T09:40:00Z'), expires_at: t('2027-01-10T09:40:00Z') },
      { token_id: 'cred-1', owner_id: A.zeynep, kind: { Credential: { kind: 'laser_safety', issued_by_training: '1', suspended: false } }, issued_at: t('2026-11-11T12:30:00Z'), expires_at: t('2027-11-11T12:30:00Z') },
      { token_id: 'right-3', owner_id: A.ayse, kind: { UsageRight: { group_id: 'makerlab-fab', max_slots: 2, source: { Training: { training_id: '1' } }, status: 'Active' } }, issued_at: t('2026-11-11T12:30:00Z'), expires_at: t('2027-01-10T12:30:00Z') },
    ],
  },
  [A.dormCommons]: {
    groups: { 'dorm-b-laundry': [A.washer] },
    roles: dormRoles,
    roles_version: '2',
    credentialKinds: [],
    trainings: [],
    cards: [
      { token_id: 'right-1', owner_id: A.deniz, kind: { UsageRight: { group_id: 'dorm-b-laundry', max_slots: 1, source: { Maintenance: { asset: A.washer, task_id: '1' } }, status: { Consumed: { asset: A.washer, reservation_id: '40' } } } }, issued_at: t('2026-11-11T19:40:00Z'), expires_at: t('2027-01-10T19:40:00Z') },
      { token_id: 'right-2', owner_id: A.deniz, kind: { UsageRight: { group_id: 'dorm-b-laundry', max_slots: 1, source: { Maintenance: { asset: A.washer, task_id: '1' } }, status: 'Active' } }, issued_at: t('2026-11-11T19:40:00Z'), expires_at: t('2027-01-10T19:40:00Z') },
      { token_id: 'right-3', owner_id: A.deniz, kind: { UsageRight: { group_id: 'dorm-b-laundry', max_slots: 1, source: { Maintenance: { asset: A.washer, task_id: '1' } }, status: 'Active' } }, issued_at: t('2026-11-11T19:40:00Z'), expires_at: t('2027-01-10T19:40:00Z') },
    ],
  },
};

// ---------- DAOs ----------
const fc = (receiver_id: AccountId, method_name: string, deposit = '0') => ({
  FunctionCall: { receiver_id, actions: [{ method_name, args: 'e30=', deposit, gas: '150000000000000' }] },
});
const approved = (voters: AccountId[]) => Object.fromEntries(voters.map((v) => [v, 'Approve' as const]));

export interface MockDao {
  balance: string;
  policy: Policy;
  proposals: Proposal[];
}

export const daos: Record<AccountId, MockDao> = {
  [A.makerDao]: {
    balance: n('41.65'),
    policy: {
      roles: [
        { name: 'all', kind: 'Everyone', permissions: ['*:AddProposal'] },
        { name: 'council', kind: { Group: [A.mehmet, A.hakan, `council-3.${ROOT}`] }, permissions: ['*:*'] },
      ],
      proposal_bond: n('0.1'),
      proposal_period: '3600000000000',
    },
    proposals: [
      { id: 0, proposer: A.hakan, description: 'Register printer-01 in makerlab-fab', kind: fc(A.makerCommons, 'register_asset'), status: 'Approved', vote_counts: {}, votes: approved([A.mehmet, A.hakan]), submission_time: t('2026-11-09T12:00:00Z') },
      { id: 1, proposer: A.hakan, description: 'Fund printer-01 float (3 NEAR)', kind: fc(A.printer, 'fund_float', n('3')), status: 'Approved', vote_counts: {}, votes: approved([A.mehmet, A.hakan]), submission_time: t('2026-11-09T12:05:00Z') },
      { id: 2, proposer: A.hakan, description: 'Register laser-01 in makerlab-fab', kind: fc(A.makerCommons, 'register_asset'), status: 'Approved', vote_counts: {}, votes: approved([A.mehmet, A.hakan]), submission_time: t('2026-11-09T12:10:00Z') },
      { id: 3, proposer: A.hakan, description: 'Fund laser-01 float (1 NEAR)', kind: fc(A.laser, 'fund_float', n('1')), status: 'Approved', vote_counts: {}, votes: approved([A.mehmet, A.hakan]), submission_time: t('2026-11-09T12:12:00Z') },
      { id: 4, proposer: A.hakan, description: 'Roles: Mehmet verifier+council, Ayşe trainer+steward', kind: fc(A.makerCommons, 'set_roles'), status: 'Approved', vote_counts: {}, votes: approved([A.mehmet, A.hakan]), submission_time: t('2026-11-09T12:20:00Z') },
      { id: 5, proposer: A.hakan, description: 'Credential kind laser_safety', kind: fc(A.makerCommons, 'set_credential_kind'), status: 'Approved', vote_counts: {}, votes: approved([A.mehmet, A.hakan]), submission_time: t('2026-11-09T12:25:00Z') },
      { id: 6, proposer: A.hakan, description: 'Operators for printer-01 and laser-01', kind: fc(A.printer, 'set_operators'), status: 'Approved', vote_counts: {}, votes: approved([A.mehmet, A.hakan]), submission_time: t('2026-11-09T12:30:00Z') },
      { id: 7, proposer: A.printer, description: `COMMONKIT escalation ${A.printer}#1: Replacement nozzle kit after the first cleaning showed wear.`, kind: { Transfer: { token_id: '', receiver_id: A.supplier, amount: n('4'), msg: null } }, status: 'Approved', vote_counts: {}, votes: approved([A.mehmet, A.hakan]), submission_time: t('2026-11-11T10:00:00Z') },
    ],
  },
  [A.dormDao]: {
    balance: n('27.4'),
    policy: {
      roles: [
        { name: 'all', kind: 'Everyone', permissions: ['*:AddProposal'] },
        { name: 'council', kind: { Group: [A.elif, A.ozan, `dorm-rep-3.${ROOT}`] }, permissions: ['*:*'] },
      ],
      proposal_bond: n('0.1'),
      proposal_period: '3600000000000',
    },
    proposals: [
      { id: 0, proposer: A.elif, description: 'Register washer-01 in dorm-b-laundry', kind: fc(A.dormCommons, 'register_asset'), status: 'Approved', vote_counts: {}, votes: approved([A.elif, A.ozan]), submission_time: t('2026-11-09T13:00:00Z') },
      { id: 1, proposer: A.elif, description: 'Fund washer-01 float (0.5 NEAR)', kind: fc(A.washer, 'fund_float', n('0.5')), status: 'Approved', vote_counts: {}, votes: approved([A.elif, A.ozan]), submission_time: t('2026-11-09T13:05:00Z') },
    ],
  },
};

// ---------- evidence ----------
const STEP_TITLES = [
  'DAO registers printer-01, sets profile, funds float',
  'Ali reserves 2 slots (0.5 fee + 2 deposit)',
  'Ali requests access via bridge (signed)',
  'Can requests access without a reservation',
  'Session finishes; steward confirms clean return',
  'Fees push float over cap; excess swept to DAO',
  'Telemetry crosses nozzle_clean; agent opens task',
  'Ayşe cleans; calibration passes; Mehmet approves',
  'Ayşe reserves with a right and prints',
  'Agent escalates nozzle kit purchase (4 NEAR)',
  'Zeynep reserves the laser without credential',
  'Ayşe trains Zeynep; Mehmet approves',
  'Zeynep reserves the laser; plug on',
  'Ayşe uses printer-earned right on laser / washer',
  'simulate.sh washer in dorm-b (SIMULATED)',
  'Agent limits: not due, duplicate, quota, revoked',
  'Double reward, self-approve, revoke attempts fail',
  './scripts/verify.sh',
];

export const evidenceSteps: EvidenceStep[] = STEP_TITLES.map((title, i) => {
  const step = i + 1;
  const hash = mockHash(`Tx${String(step).padStart(2, '0')}Step`);
  return {
    step,
    title,
    txHashes: [hash],
    explorerLinks: [`https://testnet.nearblocks.io/txns/${hash}`],
    assertions: [{ label: 'mock assertion', ok: true }],
    timestamp: new Date(Date.UTC(2026, 10, 10, 9, 0) + i * 3_600_000).toISOString(),
  };
});

export const agentLimits: AgentLimitAttempt[] = [
  { attempt: 'Open task for a rule that is not due (lens_clean, 420/600 s)', expected: 'E_RULE_NOT_DUE', observed: 'E_RULE_NOT_DUE', ok: true, tx_hash: mockHash('LimitNotDue') },
  { attempt: 'Open a second bed_level task', expected: 'E_TASK_ALREADY_OPEN', observed: 'E_TASK_ALREADY_OPEN', ok: true, tx_hash: mockHash('LimitDup') },
  { attempt: 'Exceed period reward quota', expected: 'E_QUOTA_EXCEEDED', observed: 'E_QUOTA_EXCEEDED', ok: true, tx_hash: mockHash('LimitQuota') },
  { attempt: 'Call approve_task with the agent key', expected: 'E_MISSING_ROLE', observed: 'E_MISSING_ROLE', ok: true, tx_hash: mockHash('LimitApprove') },
  { attempt: 'Attach a deposit with the function-call key', expected: 'rejected by protocol', observed: 'rejected by protocol', ok: true, tx_hash: null },
  { attempt: 'Open a task after set_operators(agent_id=None)', expected: 'E_NOT_AGENT', observed: 'E_NOT_AGENT', ok: true, tx_hash: mockHash('LimitRevoked') },
];

/** Tx hash per (asset, kind, ref) for row links. Real source derives these from evidence/explorer. */
export const mockTxFor = (key: string) => mockHash(`Row${key.replace(/[^A-Za-z0-9]/g, '')}`);
