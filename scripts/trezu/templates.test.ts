/**
 * COMMONKIT Trezu custom proposal templates (integrations/trezu/templates) compiled with Trezu's own
 * engine (NEAR-DevHub/trezu nt-fe/features/proposal-templates at the pinned commit): manifest schema,
 * fill-form schema and `buildTemplateProposal`. The FunctionCall each template produces must equal,
 * field for field, what scripts/lib/dao.ts `encodeProposal` sends for the same call in seed/demo steps.
 *
 * The engine part needs `bash scripts/trezu/fetch-engine.sh` (network, once); without it it is skipped.
 */
import { describe, expect, it } from 'vitest';
import { nearToYocto } from '@commonkit/sdk';
import { TGAS } from '../lib/config.js';
import { encodeProposal, type FnAction } from '../lib/dao.js';
import { loadDeployments } from '../lib/deployments.js';
import { OPERATORS, ids } from '../lib/topology.js';
import { fileProfile, withRule } from '../demo/lib/actions.js';
import { WASHER_QUOTA_OVERRIDE } from '../demo/steps/step-16.js';
import { ENGINE_LOCK, engineReady, fillTemplate, loadEngine, loadTemplates } from './engine.js';

const dep = loadDeployments();
const makerlab = dep.communities.makerlab!;
const dormB = dep.communities['dorm-b']!;
const washer = dormB.assets.find((a) => a.startsWith('washer-01.'))!;
const printer = makerlab.assets.find((a) => a.startsWith('printer-01.'))!;

const washerFile = fileProfile('washer-01');
const washerOverride = {
  ...withRule(washerFile, 'filter_clean', {
    trigger: { Metric: { metric: 'cycles', threshold: 1 } },
  }),
  period_reward_quota: WASHER_QUOTA_OVERRIDE,
};

interface Case {
  name: string;
  template: string;
  values: Record<string, unknown>;
  /** The same call as the scripts send it (source in the comment). */
  receiver: string;
  action: FnAction;
}

const CASES: Case[] = [
  {
    // scripts/seed-testnet.ts fund_float / demo step-01.ts (DAO float top-up)
    name: 'fund_float washer-01 0.05 NEAR',
    template: 'commonkit-fund-float-washer-01',
    values: {},
    receiver: washer,
    action: { method_name: 'fund_float', args: {}, deposit: nearToYocto('0.05'), gas: 60n * TGAS },
  },
  {
    // demo step-16.ts: washer quota + filter_clean threshold override (D-018 labelled override)
    name: 'set_profile washer-01 override',
    template: 'commonkit-set-profile-washer-01',
    values: {
      profile: JSON.stringify(washerOverride),
      reason: 'demo override period_reward_quota 2',
    },
    receiver: washer,
    action: { method_name: 'set_profile', args: { profile: washerOverride }, gas: 30n * TGAS },
  },
  {
    // demo step-16.ts restore: the production block of profiles/washer.json
    name: 'set_profile washer-01 restore',
    template: 'commonkit-set-profile-washer-01',
    values: { profile: JSON.stringify(washerFile), reason: 'restore profiles/washer.json' },
    receiver: washer,
    action: { method_name: 'set_profile', args: { profile: washerFile }, gas: 30n * TGAS },
  },
  {
    // scripts/seed-testnet.ts set_operators
    name: 'set_operators printer-01',
    template: 'commonkit-set-operators-printer-01',
    values: {
      bridge_id: ids.operator(OPERATORS.bridge.name),
      agent_id: ids.operator(OPERATORS.agent.name),
    },
    receiver: printer,
    action: {
      method_name: 'set_operators',
      args: {
        bridge_id: ids.operator(OPERATORS.bridge.name),
        agent_id: ids.operator(OPERATORS.agent.name),
      },
      gas: 30n * TGAS,
    },
  },
  {
    // demo step-01.ts register_asset printer-01 in makerlab-fab
    name: 'register_asset printer-01',
    template: 'commonkit-register-asset',
    values: { asset_id: printer, group_id: 'makerlab-fab' },
    receiver: makerlab.commons_id,
    action: {
      method_name: 'register_asset',
      args: { asset_id: printer, group_id: 'makerlab-fab' },
      gas: 100n * TGAS,
    },
  },
  {
    // demo step-14.ts / seed-testnet.ts set_roles, gas (10 + 25 × active assets) Tgas
    name: 'set_roles elif',
    template: 'commonkit-set-roles',
    values: {
      account: `elif.${makerlab.root_account}`,
      roles: JSON.stringify(['steward', 'council', 'trainer']),
    },
    receiver: makerlab.commons_id,
    action: {
      method_name: 'set_roles',
      args: { account: `elif.${makerlab.root_account}`, roles: ['steward', 'council', 'trainer'] },
      gas: (10n + 25n * BigInt(makerlab.assets.length)) * TGAS,
    },
  },
];

const templates = loadTemplates();
const DAO_ONLY = ['fund_float', 'set_profile', 'set_operators', 'register_asset', 'set_roles'];

describe('COMMONKIT Trezu templates (static)', () => {
  it('has five templates, each bound to a DAO-only method on a deployed commons or asset account', () => {
    expect([...templates.keys()]).toHaveLength(5);
    const known = new Set(
      Object.values(dep.communities).flatMap((c) => [c.commons_id, ...c.assets]),
    );
    for (const m of templates.values()) {
      const b = m.binding as { receiver_id: string; method_name: string };
      expect(known.has(b.receiver_id), b.receiver_id).toBe(true);
      expect(DAO_ONLY).toContain(b.method_name);
    }
  });

  it('every case targets an existing template and the same receiver', () => {
    for (const c of CASES) {
      const m = templates.get(c.template);
      expect(m, c.template).toBeDefined();
      expect((m!.binding as { receiver_id: string }).receiver_id).toBe(c.receiver);
    }
  });
});

describe.skipIf(!engineReady())(`Trezu engine @ ${ENGINE_LOCK.commit.slice(0, 7)}`, () => {
  it.each(CASES)('$name: Trezu output equals scripts/lib encodeProposal', async (c) => {
    const engine = await loadEngine();
    const out = fillTemplate(engine, templates.get(c.template), c.values);
    expect(out.description).toContain(`[trezu-tmpl:${c.template}]`);
    const ours = encodeProposal(out.description, {
      FunctionCall: { receiver_id: c.receiver, actions: [c.action] },
    }).proposal as { kind: unknown };
    expect(out.kind).toEqual(ours.kind);
    const args = JSON.parse(
      Buffer.from(out.kind.FunctionCall.actions[0]!.args, 'base64').toString('utf8'),
    );
    expect(args).toEqual(c.action.args);
  });

  it("Trezu's form schema refuses a malformed account and a missing profile", async () => {
    const engine = await loadEngine();
    expect(() =>
      fillTemplate(engine, templates.get('commonkit-set-operators-printer-01'), {
        bridge_id: 'Not An Account',
        agent_id: ids.operator('agent'),
      }),
    ).toThrow(/values rejected/);
    expect(() =>
      fillTemplate(engine, templates.get('commonkit-set-profile-washer-01'), {
        profile: '',
        reason: 'x',
      }),
    ).toThrow(/values rejected/);
  });

  it("Trezu's manifest schema refuses a dangling placeholder", async () => {
    const engine = await loadEngine();
    const bad = { ...templates.get('commonkit-register-asset')!, args: { asset_id: '{{nope}}' } };
    expect(engine.parseManifest(bad).success).toBe(false);
  });
});
