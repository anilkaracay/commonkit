/**
 * Read-only testnet smoke: for every asset in deployments/testnet.json, read get_wiring and
 * get_rule_status and report which agent key would sign for it. Sends no transaction.
 *   tsx src/smoke.ts [--deployments path] [--rpc url] [--agent account]
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NearRpc, TESTNET_RPC } from "@commonkit/sdk";
import { NearAgentChain } from "./chain/near.js";
import { agentAccountOf, agentKeys, deployedAssets, loadDeploymentsView } from "./deployments.js";
import { toJson } from "./events.js";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const d = loadDeploymentsView(flag("--deployments") ?? resolve(repo, "deployments/testnet.json"));
  const agent = agentAccountOf(d, flag("--agent"));
  const keys = agentKeys(d, agent);
  const assets = deployedAssets(d);
  if (assets.length === 0) throw new Error("deployments lists no asset accounts yet");
  const chain = new NearAgentChain(new NearRpc(flag("--rpc") ?? TESTNET_RPC), agent, null); // no signer: read-only
  let failed = 0;
  for (const a of assets) {
    try {
      const [wiring, rules] = await Promise.all([chain.getWiring(a.assetId), chain.getRuleStatus(a.assetId)]);
      process.stdout.write(
        toJson({
          asset_id: a.assetId,
          profile: a.profile,
          agent_bound: wiring.agentId === agent,
          agent_key_methods: keys.get(a.assetId) ?? null,
          rules: rules.map((r) => ({ rule_id: r.ruleId, kind: r.kind, trigger: r.trigger.type, current: r.current, due_value: r.dueValue, due: r.due, open_task: r.openTask })),
        }) + "\n",
      );
    } catch (err) {
      failed++;
      process.stdout.write(toJson({ asset_id: a.assetId, error: err instanceof Error ? err.message : String(err) }) + "\n");
    }
  }
  if (failed > 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
