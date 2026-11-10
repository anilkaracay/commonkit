/**
 * Who is who in the judge flow (DEMO_SCRIPT §1–2, D-701). Account ids are derived from the
 * topology so they never drift from setup/seed; deployments/testnet.json confirms they exist.
 */
import { join } from 'node:path';
import { PROFILES_DIR } from '../../lib/config.js';
import type { Deployments } from '../../lib/deployments.js';
import { COMMUNITIES, OPERATORS, findCommunity, ids, type CommunityPlan } from '../../lib/topology.js';

export interface Cast {
  root: string;
  ali: string;
  can: string;
  ayse: string;
  mehmet: string;
  zeynep: string;
  bridge: string;
  agent: string;
  supplier: string;
  makerlab: CommunityCast;
  dormB: CommunityCast;
  printer: string;
  laser: string;
  washer: string;
  fridge: string;
}

export interface CommunityCast {
  slug: string;
  plan: CommunityPlan;
  dao: string;
  commons: string;
  /** Council in vote order; the first one proposes (scripts/lib/dao proposeAndPass). */
  council: string[];
  steward: string;
  verifier: string;
  councilMember: string;
}

function community(slug: string, dep: Deployments): CommunityCast {
  const plan = findCommunity(slug);
  const entry = dep.communities[slug];
  if (!entry) throw new Error(`${slug} missing in deployments/testnet.json`);
  const council = plan.council.map((m) => ids.council(plan, m.name));
  const role = (r: string): string => {
    const name = Object.entries(plan.roles).find(([, rs]) => (rs as string[]).includes(r))?.[0];
    if (!name) throw new Error(`${slug}: nobody holds role ${r}`);
    return plan.council.some((m) => m.name === name) ? ids.council(plan, name) : ids.member(name);
  };
  return {
    slug,
    plan,
    dao: entry.dao_id,
    commons: entry.commons_id,
    council,
    steward: role('steward'),
    verifier: role('verifier'),
    councilMember: role('council'),
  };
}

export function buildCast(dep: Deployments): Cast {
  const asset = (c: string, slug: string): string => {
    const plan = findCommunity(c);
    const a = plan.assets.find((x) => x.slug === slug);
    if (!a) throw new Error(`asset ${slug} not planned in ${c}`);
    const id = ids.asset(plan, a);
    if (dep.accounts[id]?.role !== 'asset') throw new Error(`${id} missing in deployments/testnet.json`);
    return id;
  };
  return {
    root: ids.root,
    ali: ids.member('ali'),
    can: ids.member('can'),
    ayse: ids.member('ayse'),
    mehmet: ids.member('mehmet'),
    zeynep: ids.member('zeynep'),
    bridge: ids.operator(OPERATORS.bridge.name),
    agent: ids.operator(OPERATORS.agent.name),
    supplier: ids.operator(OPERATORS.supplier.name),
    makerlab: community('makerlab', dep),
    dormB: community('dorm-b', dep),
    printer: asset('makerlab', 'printer-01'),
    laser: asset('makerlab', 'laser-01'),
    washer: asset('dorm-b', 'washer-01'),
    fridge: asset('dorm-b', 'fridge-01'),
  };
}

/** Profile file of a planned asset (profiles/<file>.json). */
export function profilePath(assetSlug: string): string {
  for (const c of COMMUNITIES) {
    const a = c.assets.find((x) => x.slug === assetSlug);
    if (a) return join(PROFILES_DIR, a.profileFile);
  }
  throw new Error(`no profile for ${assetSlug}`);
}

export const slugOf = (assetId: string): string => assetId.split('.')[0]!;
