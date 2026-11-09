/**
 * The planned testnet topology (D-105, D-018, D-701). Pure data + id derivation; setup/seed/verify
 * all read it so names never drift. Amounts are yocto bigint.
 */
import { nearToYocto } from '@commonkit/sdk';
import { ROOT_ACCOUNT } from './config.js';

export type Role = 'steward' | 'verifier' | 'trainer' | 'council';
export type Kind = 'team' | 'pilot' | 'demo-bot' | 'contract';

export interface AssetPlan {
  slug: string; // printer-01
  profileFile: string; // printer_3d.json
  /** Float the DAO funds through `fund_float` at seed / demo step 1. */
  initialFloat: bigint;
  /** printer-01 is registered and funded by judge step 1, not by seed (DEMO_SCRIPT §2). */
  registeredBy: 'seed' | 'demo-step-1';
}

export interface CredentialKindPlan {
  kind: string;
  title: string;
  validity_days: number;
  reward_group: string;
  trainer_reward_rights: number;
  right_max_slots: number;
  right_validity_days: number;
}

export interface CommunityPlan {
  slug: string;
  name: string;
  daoName: string;
  purpose: string;
  simulated: boolean;
  /** Short names; accounts are `<name>.<community root>`. First one proposes, all vote. */
  council: { name: string; kind: Kind; label: string }[];
  assets: AssetPlan[];
  /** Commons roles keyed by short member name (resolved by `memberId`). */
  roles: Record<string, Role[]>;
  credentialKinds: CredentialKindPlan[];
  commonsStorageFund: bigint;
  /** Top-up sent to the DAO treasury after creation (floats, storage fund, escalation payouts). */
  treasuryTopUp: bigint;
}

export interface MemberPlan {
  name: string;
  kind: Kind;
  label: string;
  balance: bigint;
}

const N = nearToYocto;

/** Demo cast (DEMO_SCRIPT §1–2). All controlled by scripts and labelled demo accounts. */
export const MEMBERS: MemberPlan[] = [
  {
    name: 'ali',
    kind: 'demo-bot',
    label: 'Ali — reserves the printer (steps 2–6), washer user',
    balance: N('8'),
  },
  {
    name: 'can',
    kind: 'demo-bot',
    label: 'Can — no reservation (step 4), dorm-b resident',
    balance: N('1'),
  },
  { name: 'ayse', kind: 'demo-bot', label: 'Ayşe — maintainer and laser trainer', balance: N('5') },
  { name: 'mehmet', kind: 'demo-bot', label: 'Mehmet — verifier', balance: N('0.5') },
  { name: 'zeynep', kind: 'demo-bot', label: 'Zeynep — laser trainee', balance: N('4.5') },
];

export const OPERATORS = {
  bridge: {
    name: 'bridge',
    balance: N('1'),
    label: 'Bridge operator (function-call keys per asset)',
  },
  agent: {
    name: 'agent',
    balance: N('1'),
    label: 'Operations agent (function-call keys per asset)',
  },
  supplier: {
    name: 'supplier',
    balance: N('0.05'),
    label: 'Parts supplier paid by DAO escalations (demo)',
  },
} as const;

export const COMMUNITIES: CommunityPlan[] = [
  {
    slug: 'makerlab',
    name: 'Makerlab',
    daoName: 'makerlab-ck',
    purpose: 'COMMONKIT Makerlab community treasury (testnet)',
    simulated: false,
    council: [
      {
        name: 'elif',
        kind: 'demo-bot',
        label: 'Makerlab DAO council (team-controlled demo account)',
      },
      {
        name: 'burak',
        kind: 'demo-bot',
        label: 'Makerlab DAO council (team-controlled demo account)',
      },
      {
        name: 'selin',
        kind: 'demo-bot',
        label:
          'Makerlab DAO council, pilot-rep seat (placeholder until the pilot rep has an account)',
      },
    ],
    assets: [
      {
        slug: 'printer-01',
        profileFile: 'printer_3d.json',
        initialFloat: N('2'),
        registeredBy: 'demo-step-1',
      },
      {
        slug: 'laser-01',
        profileFile: 'laser_cutter.json',
        initialFloat: N('1'),
        registeredBy: 'seed',
      },
    ],
    roles: {
      elif: ['steward', 'council'],
      mehmet: ['verifier'],
      ayse: ['trainer'],
      burak: ['council'],
    },
    credentialKinds: [
      {
        kind: 'laser_safety',
        title: 'Laser safety',
        validity_days: 365,
        reward_group: 'makerlab-fab',
        trainer_reward_rights: 1,
        right_max_slots: 2,
        right_validity_days: 60,
      },
    ],
    commonsStorageFund: N('0.5'),
    // floats 3 + storage 0.5 + nozzle-kit escalation payout 4 (step 10) + 0.5 margin
    treasuryTopUp: N('8'),
  },
  {
    slug: 'dorm-b',
    name: 'Dorm B',
    daoName: 'dorm-b-ck',
    purpose: 'COMMONKIT Dorm B community treasury (testnet, simulation)',
    simulated: true,
    council: [
      { name: 'nil', kind: 'demo-bot', label: 'Dorm B DAO council (demo account)' },
      { name: 'ozan', kind: 'demo-bot', label: 'Dorm B DAO council (demo account)' },
      { name: 'ece', kind: 'demo-bot', label: 'Dorm B DAO council (demo account)' },
    ],
    assets: [
      { slug: 'washer-01', profileFile: 'washer.json', initialFloat: N('1'), registeredBy: 'seed' },
      {
        slug: 'fridge-01',
        profileFile: 'community_fridge.json',
        initialFloat: N('0.5'),
        registeredBy: 'seed',
      },
    ],
    roles: { nil: ['steward'], ozan: ['verifier'], ece: ['council'] },
    credentialKinds: [],
    commonsStorageFund: N('0.5'),
    // floats 1.5 + storage 0.5 + 0.5 margin
    treasuryTopUp: N('2.5'),
  },
];

/** Methods the bridge's function-call key may call on each asset (CONTRACT_SPEC §3.2–3.3). */
export const BRIDGE_METHODS = [
  'mark_session_started',
  'mark_session_finished',
  'report_telemetry',
  'submit_verification_result',
];
/** Methods the agent's function-call key may call on each asset (CONTRACT_SPEC §3.3, §3.5). */
export const AGENT_METHODS = [
  'open_upkeep_task',
  'annotate_task',
  'escalate',
  'sync_escalation',
  'refresh_dao_policy',
];

export const ids = {
  root: ROOT_ACCOUNT,
  communityRoot: (c: CommunityPlan) => `${c.slug}.${ROOT_ACCOUNT}`,
  commons: (c: CommunityPlan) => `commons.${c.slug}.${ROOT_ACCOUNT}`,
  asset: (c: CommunityPlan, a: AssetPlan) => `${a.slug}.${c.slug}.${ROOT_ACCOUNT}`,
  council: (c: CommunityPlan, name: string) => `${name}.${c.slug}.${ROOT_ACCOUNT}`,
  member: (name: string) => `${name}.${ROOT_ACCOUNT}`,
  operator: (name: string) => `${name}.${ROOT_ACCOUNT}`,
  dao: (c: CommunityPlan) => `${c.daoName}.sputnikv2.testnet`,
};

/** Resolve a short name in a community's role map: council seats live under the community root. */
export function roleAccount(c: CommunityPlan, name: string): string {
  return c.council.some((m) => m.name === name) ? ids.council(c, name) : ids.member(name);
}

export function findCommunity(slug: string): CommunityPlan {
  const c = COMMUNITIES.find((x) => x.slug === slug);
  if (!c) throw new Error(`unknown community ${slug}`);
  return c;
}
