/**
 * deployments/testnet.json → the normalized `Deployment` the app uses. The raw file is written by
 * scripts/setup-testnet.ts (chain-ops); this is the only place that knows its layout.
 */
import { displayName } from '@commonkit/sdk';
import type { CodeRecord, DeployedAsset, DeployedCommunity, DeployedMember, Deployment, Keyless, MemberKind } from './offchain';

interface RawAccount {
  role: string;
  kind: string;
  keyless: Keyless;
  community?: string;
  label?: string;
  profile?: string;
  group_id?: string;
  code_hash?: string;
  deploy_tx?: string;
}

export interface RawDeployment {
  network: string;
  root: string;
  factory: string;
  updated_at: string;
  code: { asset: Partial<CodeRecord>; commons: Partial<CodeRecord> };
  communities: Record<string, { name: string; dao_id: string; dao_council: string[]; commons_id: string; assets: string[] }>;
  accounts: Record<string, RawAccount>;
}

const code = (c: Partial<CodeRecord> | undefined): CodeRecord => ({
  code_hash: c?.code_hash ?? '',
  sha256: c?.sha256 ?? '',
  build: c?.build ?? 'unknown',
});

const MEMBER_ROLES = new Set(['member', 'council', 'supplier', 'pilot']);

export function parseDeployment(raw: RawDeployment): Deployment {
  const accounts = Object.entries(raw.accounts);
  const byRole = (role: string) => accounts.find(([, a]) => a.role === role)?.[0] ?? null;

  const communities: DeployedCommunity[] = Object.entries(raw.communities).map(([slug, c]) => ({
    slug,
    name: c.name,
    dao_id: c.dao_id,
    dao_council: c.dao_council,
    commons_id: c.commons_id,
    commons_code_hash: raw.accounts[c.commons_id]?.code_hash ?? '',
    agent_id: byRole('agent'),
    bridge_id: byRole('bridge'),
    simulated: true,
  }));

  const assets: DeployedAsset[] = Object.values(raw.communities).flatMap((c) =>
    c.assets.map((assetId) => {
      const a = raw.accounts[assetId];
      return {
        asset_id: assetId,
        alias: assetId.split('.')[0] ?? assetId,
        community: Object.entries(raw.communities).find(([, x]) => x.assets.includes(assetId))?.[0] ?? '',
        profile_file: (a?.profile ?? '').split('/').pop() ?? '',
        group_id: a?.group_id ?? '',
        simulated: true,
        keyless: a?.keyless ?? 'pending',
        code_hash: a?.code_hash ?? '',
        deploy_tx: a?.deploy_tx ?? null,
      };
    }),
  );

  const members: DeployedMember[] = accounts
    .filter(([, a]) => MEMBER_ROLES.has(a.role))
    .map(([id, a]) => ({
      account_id: id,
      display_name: displayName(id),
      kind: (['team', 'pilot', 'demo-bot'].includes(a.kind) ? a.kind : 'team') as MemberKind,
      role: a.role,
      community: a.community ?? null,
    }));

  const keyless_accounts = accounts
    .filter(([, a]) => a.keyless === true || a.keyless === 'pending')
    .map(([id, a]) => ({ account_id: id, keyless: a.keyless, role: a.role }));

  return {
    network: 'testnet',
    root: raw.root,
    sputnik_factory: raw.factory,
    updated_at: raw.updated_at,
    code: { asset: code(raw.code.asset), commons: code(raw.code.commons) },
    communities,
    assets,
    members,
    keyless_accounts,
  };
}
