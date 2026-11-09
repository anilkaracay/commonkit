/**
 * deployments/testnet.json — the public record of every account the setup created. No secrets.
 *
 * Schema (version 1):
 * {
 *   "schema": 1, "network": "testnet", "root": "<root>.testnet", "factory": "sputnikv2.testnet",
 *   "updated_at": ISO time,
 *   "code": { "asset" | "commons": { path, bytes, sha256 (hex of the wasm), code_hash (base58 sha256 as
 *             shown by view_account), build: "non-reproducible" | "reproducible", git_commit (HEAD when this code_hash was first recorded) } },
 *   "communities": { <slug>: { name, root_account, dao_id, dao_council: [account], commons_id,
 *                    assets: [asset account], dao_tx?, commons_tx? } },
 *   "accounts": { <account_id>: {
 *       role: "root" | "community-root" | "dao" | "commons" | "asset" | "council" | "member" |
 *             "bridge" | "agent" | "supplier" | "funding-helper",
 *       kind: "team" | "pilot" | "demo-bot" | "contract",
 *       keyless: true | false | "pending",   // true = verify.sh requires an empty key list
 *       community?, label?, profile? (profiles/<file>.json for assets), group_id?,
 *       created_tx?, deploy_tx?, keys_deleted_tx?, code_hash?, initial_balance? (yocto string) } },
 *   "function_call_keys": [ { account, public_key, receiver_id, method_names, tx } ]
 * }
 * Every write goes through `mergeDeployments` so a resumed run only adds or updates fields.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { DEPLOYMENTS_FILE, NETWORK, ROOT_ACCOUNT, SPUTNIK_FACTORY } from './config.js';

export const accountRoles = [
  'root',
  'community-root',
  'dao',
  'commons',
  'asset',
  'council',
  'member',
  'bridge',
  'agent',
  'supplier',
  'funding-helper',
] as const;

const accountEntry = z.object({
  role: z.enum(accountRoles),
  kind: z.enum(['team', 'pilot', 'demo-bot', 'contract']),
  keyless: z.union([z.boolean(), z.literal('pending')]),
  community: z.string().optional(),
  label: z.string().optional(),
  profile: z.string().optional(),
  group_id: z.string().optional(),
  created_tx: z.string().optional(),
  deploy_tx: z.string().optional(),
  keys_deleted_tx: z.array(z.string()).optional(),
  code_hash: z.string().optional(),
  initial_balance: z.string().optional(),
});

const codeEntry = z.object({
  path: z.string(),
  bytes: z.number(),
  sha256: z.string(),
  code_hash: z.string(),
  build: z.enum(['non-reproducible', 'reproducible']),
  git_commit: z.string().optional(),
});

const community = z.object({
  name: z.string(),
  root_account: z.string(),
  dao_id: z.string(),
  dao_council: z.array(z.string()),
  commons_id: z.string(),
  assets: z.array(z.string()),
  dao_tx: z.string().optional(),
  commons_tx: z.string().optional(),
});

const fcKey = z.object({
  account: z.string(),
  public_key: z.string(),
  receiver_id: z.string(),
  method_names: z.array(z.string()),
  tx: z.string(),
});

export const deploymentsSchema = z.object({
  schema: z.literal(1),
  network: z.literal('testnet'),
  root: z.string(),
  factory: z.string(),
  updated_at: z.string(),
  code: z.object({ asset: codeEntry.optional(), commons: codeEntry.optional() }),
  communities: z.record(community),
  accounts: z.record(accountEntry),
  function_call_keys: z.array(fcKey),
});

export type Deployments = z.infer<typeof deploymentsSchema>;
export type AccountEntry = z.infer<typeof accountEntry>;
export type CommunityEntry = z.infer<typeof community>;
export type FcKeyEntry = z.infer<typeof fcKey>;
export type CodeEntry = z.infer<typeof codeEntry>;

export interface DeploymentsPatch {
  code?: Partial<Deployments['code']>;
  communities?: Record<string, Partial<CommunityEntry>>;
  accounts?: Record<string, Partial<AccountEntry>>;
  function_call_keys?: FcKeyEntry[];
}

export function emptyDeployments(): Deployments {
  return {
    schema: 1,
    network: NETWORK,
    root: ROOT_ACCOUNT,
    factory: SPUTNIK_FACTORY,
    updated_at: new Date(0).toISOString(),
    code: {},
    communities: {},
    accounts: {},
    function_call_keys: [],
  };
}

const union = (a: string[], b: string[] | undefined): string[] => [
  ...a,
  ...(b ?? []).filter((x) => !a.includes(x)),
];

/**
 * Pure merge: patch fields overwrite, arrays of ids are unioned (order kept), function-call keys
 * are deduplicated by public key. Never drops an existing account, community or key.
 */
export function mergeDeployments(
  base: Deployments,
  patch: DeploymentsPatch,
  now = new Date(),
): Deployments {
  const out: Deployments = structuredClone(base);
  out.updated_at = now.toISOString();
  if (patch.code) out.code = { ...out.code, ...patch.code };
  for (const [slug, c] of Object.entries(patch.communities ?? {})) {
    const prev = out.communities[slug];
    const merged = { ...prev, ...c } as CommunityEntry;
    merged.assets = union(prev?.assets ?? [], c.assets);
    merged.dao_council = union(prev?.dao_council ?? [], c.dao_council);
    out.communities[slug] = community.parse(merged);
  }
  for (const [id, a] of Object.entries(patch.accounts ?? {})) {
    const prev = out.accounts[id];
    const merged = { ...prev, ...a } as AccountEntry;
    if (prev?.keys_deleted_tx || a.keys_deleted_tx)
      merged.keys_deleted_tx = union(prev?.keys_deleted_tx ?? [], a.keys_deleted_tx);
    // Once verified keyless, an account can never go back (no key can be added to it).
    if (prev?.keyless === true) merged.keyless = true;
    out.accounts[id] = accountEntry.parse(merged);
  }
  for (const k of patch.function_call_keys ?? [])
    if (
      !out.function_call_keys.some((x) => x.public_key === k.public_key && x.account === k.account)
    )
      out.function_call_keys.push(fcKey.parse(k));
  return deploymentsSchema.parse(out);
}

export function loadDeployments(path = DEPLOYMENTS_FILE): Deployments {
  if (!existsSync(path)) return emptyDeployments();
  return deploymentsSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

/** Read-merge-write so concurrent steps of one run never lose each other's fields. */
export function updateDeployments(patch: DeploymentsPatch, path = DEPLOYMENTS_FILE): Deployments {
  const next = mergeDeployments(loadDeployments(path), patch);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}
