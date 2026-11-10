import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { verificationTestSchema } from "./adapters/types.js";
import { gaugesConfigSchema } from "./telemetry/gauges.js";
import { accountIdSchema } from "./util/near.js";

export const ADAPTER_KINDS = ["simulator", "moonraker", "octoprint", "smart_plug", "manual_qr"] as const;

const safetySchema = z
  .object({
    /** Devices that can hurt someone when energised (laser cutter, heater). */
    dangerous: z.boolean().default(false),
    /** What is physically connected instead of the real device, e.g. "desk lamp (stand-in for laser cutter)". */
    stand_in: z.string().min(3).max(120).optional(),
    /**
     * Operator attests a human is physically present at the real dangerous device for this run.
     * Required to energise a dangerous device that is not a stand-in. Never set this in committed config.
     */
    human_present_confirmed: z.boolean().default(false),
  })
  .default({ dangerous: false, human_present_confirmed: false });

export const assetConfigSchema = z
  .object({
    asset_id: accountIdSchema,
    adapter: z.enum(ADAPTER_KINDS),
    adapter_config: z.record(z.string(), z.unknown()).default({}),
    telemetry_interval_sec: z.number().int().positive().max(86_400).default(60),
    session_timeout_min: z.number().int().positive().max(24 * 60).default(240),
    session_poll_sec: z.number().positive().max(300).default(2),
    /** rule_id -> verification test run after a maintenance submission. */
    verification_tests: z.record(z.string(), verificationTestSchema).default({}),
    /**
     * The adapter talks to a device EMULATOR, not a device (D-022). Everything about the asset is then
     * labelled simulated (events, logs, on-chain `simulated` metric) exactly like the simulator.
     */
    emulated_device: z.boolean().default(false),
    /** Env var holding this asset's bridge function-call private key (BRIDGE §2); else the keychain key from deployments. */
    signer_env: z.string().regex(/^[A-Z][A-Z0-9_]*$/).optional(),
    /** gauge name -> derived monotonic counters (D-410). */
    gauges: gaugesConfigSchema,
    safety: safetySchema,
  })
  .superRefine((a, ctx) => {
    const derived = Object.values(a.gauges).flatMap((rules) => rules.map((r) => r.counter));
    if (new Set(derived).size !== derived.length) {
      ctx.addIssue({ code: "custom", path: ["gauges"], message: "derived counter names must be unique" });
    }
    if (a.safety.dangerous && a.adapter !== "simulator" && !a.safety.stand_in && !a.safety.human_present_confirmed) {
      ctx.addIssue({
        code: "custom",
        path: ["safety"],
        message:
          "dangerous device: configure a labelled stand_in, or set human_present_confirmed only while a human is physically at the device",
      });
    }
  });
export type AssetConfig = z.infer<typeof assetConfigSchema>;

export const bridgeConfigSchema = z
  .object({
    network: z.literal("testnet"),
    rpc_url: z.url().default("https://rpc.testnet.near.org"),
    bridge_account: accountIdSchema,
    /** fake = in-memory chain for tests and sim mode (everything labelled simulated). */
    chain: z.enum(["fake", "near"]).default("near"),
    listen: z
      .object({ host: z.string().default("127.0.0.1"), port: z.number().int().min(0).max(65_535).default(8787) })
      .default({ host: "127.0.0.1", port: 8787 }),
    state_dir: z.string().default("state"),
    evidence_dir: z.string().default("../evidence"),
    challenge_ttl_sec: z.number().int().positive().max(3600).default(300),
    cors_origins: z.array(z.string()).default([]),
    /** chain: near only. Where the bridge finds its per-asset function-call keys. */
    signer: z
      .object({
        deployments: z.string().default("../deployments/testnet.json"),
        keychain_dir: z.string().optional(),
      })
      .default({ deployments: "../deployments/testnet.json" }),
    assets: z.array(assetConfigSchema).min(1),
  })
  .superRefine((c, ctx) => {
    const ids = c.assets.map((a) => a.asset_id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "duplicate asset_id" });
  });
export type BridgeConfig = z.infer<typeof bridgeConfigSchema> & { configDir: string };

/** Replaces ${VAR} and ${VAR:-default}; a missing VAR without default is an error. */
export function substituteEnv(text: string, env: NodeJS.ProcessEnv): string {
  return text.replace(/\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/g, (_m, name: string, def: string | undefined) => {
    const v = env[name];
    if (v !== undefined && v !== "") return v;
    if (def !== undefined) return def;
    throw new Error(`config references unset environment variable ${name}`);
  });
}

export function parseConfig(text: string, configDir: string, env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const parsed = bridgeConfigSchema.safeParse(parseYaml(substituteEnv(text, env)));
  if (!parsed.success) throw new Error(`invalid bridge config: ${z.prettifyError(parsed.error)}`);
  const c = parsed.data;
  return {
    ...c,
    state_dir: resolve(configDir, c.state_dir),
    evidence_dir: resolve(configDir, c.evidence_dir),
    signer: {
      deployments: resolve(configDir, c.signer.deployments),
      ...(c.signer.keychain_dir ? { keychain_dir: resolve(configDir, c.signer.keychain_dir) } : {}),
    },
    configDir,
  };
}

export async function loadConfig(path: string, env: NodeJS.ProcessEnv = process.env): Promise<BridgeConfig> {
  const abs = resolve(path);
  return parseConfig(await readFile(abs, "utf8"), dirname(abs), env);
}
