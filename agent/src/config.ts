/** `agent/config*.yaml` (AGENT_SPEC §6): assets, poll interval, purchase hints, LLM on/off. */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { PurchaseHint } from "./needs.js";

const accountId = z.string().regex(/^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/, "NEAR account id");
const yocto = z.string().regex(/^\d+$/).transform((v) => BigInt(v));

const hintSchema = z.object({
  rule_id: z.string().min(1),
  after_n: z.number().int().positive(),
  item: z.string().min(1),
  amount: yocto,
  receiver: accountId,
});

const assetSchema = z.object({
  asset_id: accountId,
  /** Env suffix for the function-call key: AGENT_KEY_<ALIAS>. */
  alias: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  /** Profile JSON (profiles/*.json); its meta.purchase_hints are used unless overridden. */
  profile: z.string().min(1),
  simulated: z.boolean(),
  supplier_is_team_account: z.boolean().default(false),
  purchase_hints: z.array(hintSchema).optional(),
});

export const configSchema = z.object({
  network: z.literal("testnet"),
  agent_account: accountId,
  chain: z.enum(["fake", "near"]),
  rpc_url: z.string().url().default("https://rpc.testnet.near.org"),
  poll_seconds: z.number().positive().default(30),
  sync_every_seconds: z.number().positive().default(60),
  listen: z.object({ host: z.string().default("127.0.0.1"), port: z.number().int().positive().default(8788) }).default({ host: "127.0.0.1", port: 8788 }),
  cors_origins: z.array(z.string()).default([]),
  state_dir: z.string().default("state"),
  evidence_dir: z.string().default("state/evidence"),
  llm: z.object({ enabled: z.boolean().default(false) }).default({ enabled: false }),
  /** Fake chain only: a small usage driver so the feed shows the loop (all simulated). */
  fake: z.object({ drive: z.boolean().default(false), hours_per_tick: z.number().int().nonnegative().default(12) }).default({ drive: false, hours_per_tick: 12 }),
  assets: z.array(assetSchema).min(1),
});

export type AgentConfig = z.infer<typeof configSchema>;

const profileFileSchema = z.object({
  profile: z.unknown(),
  meta: z.object({ purchase_hints: z.array(hintSchema).default([]) }).partial().optional(),
});

export interface LoadedAsset {
  assetId: string;
  alias: string;
  simulated: boolean;
  supplierIsTeamAccount: boolean;
  purchaseHints: PurchaseHint[];
  /** The `profile` object of the profile file (contract JSON), used to seed the fake chain. */
  profileJson: unknown;
}

export interface LoadedConfig {
  config: AgentConfig;
  baseDir: string;
  assets: LoadedAsset[];
}

export function loadProfileFile(path: string): { profileJson: unknown; purchaseHints: PurchaseHint[] } {
  const file = profileFileSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  return { profileJson: file.profile, purchaseHints: file.meta?.purchase_hints ?? [] };
}

export function loadConfig(path: string): LoadedConfig {
  const config = configSchema.parse(parseYaml(readFileSync(path, "utf8")));
  const baseDir = dirname(resolve(path));
  const assets = config.assets.map((a): LoadedAsset => {
    const p = loadProfileFile(resolve(baseDir, a.profile));
    return {
      assetId: a.asset_id,
      alias: a.alias,
      simulated: a.simulated,
      supplierIsTeamAccount: a.supplier_is_team_account,
      purchaseHints: a.purchase_hints ?? p.purchaseHints,
      profileJson: p.profileJson,
    };
  });
  return { config, baseDir, assets };
}
