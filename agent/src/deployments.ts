/**
 * Read-only view of deployments/testnet.json (full schema: scripts/lib/deployments.ts, owned by
 * chain-ops). The agent only needs accounts by role, asset profiles and function-call keys.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { z } from "zod";

const schema = z.object({
  schema: z.literal(1),
  network: z.literal("testnet"),
  communities: z.record(z.string(), z.object({ dao_id: z.string(), assets: z.array(z.string()) })),
  accounts: z.record(
    z.string(),
    z.object({ role: z.string(), profile: z.string().optional(), community: z.string().optional(), keyless: z.union([z.boolean(), z.literal("pending")]) }),
  ),
  function_call_keys: z.array(z.object({ account: z.string(), public_key: z.string(), receiver_id: z.string(), method_names: z.array(z.string()) })),
});

export type DeploymentsView = z.infer<typeof schema>;

export interface DeployedAsset {
  assetId: string;
  /** Profile file name, e.g. "printer_3d.json". */
  profile: string | null;
  community: string | null;
  /** Env suffix for AGENT_KEY_<ALIAS>: first label of the account, upper-cased ("printer-01" → PRINTER_01). */
  alias: string;
}

export function loadDeploymentsView(path: string): DeploymentsView {
  return schema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function aliasOf(assetId: string): string {
  return assetId.split(".")[0]!.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

export function deployedAssets(d: DeploymentsView): DeployedAsset[] {
  return Object.entries(d.accounts)
    .filter(([, a]) => a.role === "asset")
    .map(([assetId, a]) => ({
      assetId,
      profile: a.profile ? basename(a.profile) : null,
      community: a.community ?? null,
      alias: aliasOf(assetId),
    }));
}

/** The single agent account, unless `explicit` names one. */
export function agentAccountOf(d: DeploymentsView, explicit?: string): string {
  if (explicit) return explicit;
  const agents = Object.entries(d.accounts).filter(([, a]) => a.role === "agent").map(([id]) => id);
  if (agents.length !== 1) throw new Error(`expected exactly one agent account in deployments, found ${agents.length}; pass --agent`);
  return agents[0]!;
}

/** Assets the agent holds a function-call key for, with the methods each key allows. */
export function agentKeys(d: DeploymentsView, agent: string): Map<string, string[]> {
  return new Map(d.function_call_keys.filter((k) => k.account === agent).map((k) => [k.receiver_id, k.method_names]));
}

export interface TestnetPlanOverrides {
  quotaAsset?: string;
  revokedAsset?: string;
}

/**
 * Testnet LimitsPlan: Metric attempts on the printer, the Schedule attempt on the fridge
 * (`weekly_clean`, DEMO_SCRIPT step 20), quota on the washer and revocation on the printer unless
 * overridden. The chain-ops preconditions (quota nearly used, DAO revocation) are set up in M6.
 */
export function testnetLimitsPlan(d: DeploymentsView, o: TestnetPlanOverrides = {}) {
  const assets = deployedAssets(d);
  const byProfile = (file: string): string => {
    const a = assets.find((x) => x.profile === file);
    if (!a) throw new Error(`no deployed asset with profile ${file} in deployments`);
    return a.assetId;
  };
  const printer = byProfile("printer_3d.json");
  return {
    metricAsset: printer,
    scheduleAsset: byProfile("community_fridge.json"),
    scheduleRule: "weekly_clean",
    quotaAsset: o.quotaAsset ?? byProfile("washer.json"),
    revokedAsset: o.revokedAsset ?? printer,
  };
}
