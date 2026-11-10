/**
 * One full SIMULATED washer loop on NEAR testnet (lead's Lane B item 4):
 *   member reserve (wallet-equivalent tx from the member's keychain key) -> NEP-413 /access ->
 *   simulator session -> mark_session_finished -> report_telemetry -> evidence/bridge-washer-loop.json
 *
 *   pnpm --filter @commonkit/bridge washer-loop               # DRY RUN: views only, prints the plan
 *   pnpm --filter @commonkit/bridge washer-loop --go          # sends transactions (only after "testnet go")
 *
 * Preconditions for --go: the asset is keyless in deployments/testnet.json, the bridge's function-call
 * key for the asset is listed there and present in the keychain, the asset is in service, and the
 * bridge is the asset's operator. The washer is a simulator asset: everything is labelled SIMULATED.
 */
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { NearRpc } from "@commonkit/sdk";
import { NearSigner, TGAS, readKeychainKey } from "@commonkit/sdk/signer";
import { base58, base64 } from "@scure/base";
import { pino } from "pino";
import { z } from "zod";
import { Bridge } from "../src/bridge.js";
import { NearChainClient } from "../src/chain/near.js";
import { NearSignerTxSigner, resolveSigners } from "../src/chain/signer.js";
import { parseConfig } from "../src/config.js";
import { buildServer } from "../src/http/server.js";
import { nep413SignWithSeed } from "../src/nep413/payload.js";
import { systemClock } from "../src/util/clock.js";

const BRIDGE_DIR = resolve(import.meta.dirname, "..");
const { values } = parseArgs({
  options: {
    go: { type: "boolean", default: false },
    member: { type: "string", default: "ali.commonkit-sxflo.testnet" },
    asset: { type: "string", default: "washer-01.dorm-b.commonkit-sxflo.testnet" },
    deployments: { type: "string", default: resolve(BRIDGE_DIR, "../deployments/testnet.json") },
    out: { type: "string", default: resolve(BRIDGE_DIR, "../evidence/bridge-washer-loop.json") },
    rpc: { type: "string", default: process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com" },
  },
});
const ASSET = values.asset;
const MEMBER = values.member;
const explorer = (tx: string) => `https://testnet.nearblocks.io/txns/${tx}`;
const log = (msg: string) => console.log(`[washer-loop SIMULATED] ${msg}`);

const deploymentsSchema = z.object({
  accounts: z.record(z.string(), z.object({ role: z.string(), keyless: z.union([z.boolean(), z.literal("pending")]) }).loose()),
  function_call_keys: z.array(z.object({ account: z.string(), public_key: z.string(), receiver_id: z.string() })),
});
const u64 = z.union([z.string(), z.number()]).transform((v) => BigInt(v));
const profileSchema = z
  .object({ slot_minutes: z.number(), start_window_minutes: z.number(), price_per_slot: u64, deposit: u64, deposit_trusted: u64, trusted_after: z.number() })
  .loose();

async function main(): Promise<void> {
  const rpc = new NearRpc(values.rpc);
  const dep = deploymentsSchema.parse(JSON.parse(await import("node:fs/promises").then((f) => f.readFile(values.deployments, "utf8"))));
  const assetEntry = dep.accounts[ASSET];
  const bridgeAccount = Object.entries(dep.accounts).find(([, v]) => v.role === "bridge")?.[0];
  const fcKey = dep.function_call_keys.find((k) => k.account === bridgeAccount && k.receiver_id === ASSET);
  const problems: string[] = [];
  if (!assetEntry) problems.push(`${ASSET} not in deployments`);
  else if (assetEntry.keyless !== true) problems.push(`${ASSET} keyless = ${String(assetEntry.keyless)} (must be true)`);
  if (!bridgeAccount) problems.push("no bridge account in deployments");
  if (!fcKey) problems.push(`no bridge function-call key for ${ASSET} in deployments`);
  else {
    try {
      readKeychainKey(bridgeAccount!, { publicKey: fcKey.public_key });
    } catch (err) {
      problems.push(`bridge key not in keychain: ${(err as Error).message}`);
    }
  }

  // Read-only plan.
  const wiring = (await rpc.view<{ bridge_id?: string | null }>(ASSET, "get_wiring")) ?? {};
  if (wiring.bridge_id !== bridgeAccount) problems.push(`asset bridge_id is ${String(wiring.bridge_id)}, expected ${bridgeAccount}`);
  const service = await rpc.view<{ in_service: boolean }>(ASSET, "get_service_status");
  if (!service.in_service) problems.push("asset is out of service");
  const profile = profileSchema.parse(await rpc.view(ASSET, "get_profile"));
  const rep = await rpc.view<{ clean_returns?: number } | null>(ASSET, "get_reputation", { account: MEMBER });
  const trusted = (rep?.clean_returns ?? 0) >= profile.trusted_after;
  const attached = profile.price_per_slot + (trusted ? profile.deposit_trusted : profile.deposit);
  const block = await rpc.call<{ header: { timestamp_nanosec: string } }>("block", { finality: "final" });
  // Use the current slot while its start window is still open for >= 5 min, else the next slot (and wait).
  const slotNs = BigInt(profile.slot_minutes) * 60_000_000_000n;
  const nowNs = BigInt(block.header.timestamp_nanosec);
  const intoSlotMin = Number((nowNs % slotNs) / 60_000_000_000n);
  const useCurrent = intoSlotMin + 5 <= profile.start_window_minutes;
  const slot = nowNs / slotNs + (useCurrent ? 0n : 1n);
  const waitMs = useCurrent ? 0 : Number((slot * slotNs - nowNs) / 1_000_000n) + 5_000;
  log(`asset ${ASSET}, member ${MEMBER}, bridge ${bridgeAccount}`);
  log(`plan: reserve slot ${slot} (${useCurrent ? "current" : `next, then wait ${Math.round(waitMs / 60_000)} min for its start`}), 1 slot, attach ${attached} yocto (fee ${profile.price_per_slot} + deposit ${trusted ? profile.deposit_trusted : profile.deposit})`);
  if (problems.length) log(`NOT READY:\n  - ${problems.join("\n  - ")}`);
  if (!values.go) {
    log("dry run only (no --go): nothing was sent.");
    return;
  }
  if (problems.length) throw new Error("refusing to send: preconditions not met");

  // 1. Member reserves (the member's own keychain key; the web app would use the wallet).
  const member = NearSigner.fromKeychain(MEMBER, {}, { rpcUrls: [values.rpc] });
  const reserveTx = await member.signAndSend({
    receiverId: ASSET,
    methodName: "reserve",
    args: { start_slot: slot.toString(), slots: 1, right_id: null },
    gas: 200n * TGAS,
    deposit: attached,
  });
  const pending = reserveTx.outcome.events.find((e) => e.event === "reservation_pending");
  const reservationId = String((pending?.data as Array<{ reservation_id?: string }> | undefined)?.[0]?.reservation_id ?? "");
  if (!reservationId) throw new Error(`reserve ${reserveTx.txHash}: no reservation_pending event`);
  log(`reserved #${reservationId}: ${explorer(reserveTx.txHash)}`);
  for (let i = 0; i < 20; i++) {
    const r = await rpc.view<{ status: string } | null>(ASSET, "get_reservation", { id: reservationId });
    if (r?.status === "Confirmed") break;
    if (r && r.status !== "PendingAuthorization") throw new Error(`reservation is ${r.status}`);
    await systemClock.sleep(2_000);
  }

  if (waitMs > 0) {
    log(`waiting ${Math.round(waitMs / 1000)} s for slot ${slot} to start (chain time)`);
    await systemClock.sleep(waitMs);
  }

  // 2. Bridge in-process (chain: near), washer only.
  const state = await mkdtemp(join(tmpdir(), "ck-washer-loop-"));
  const config = parseConfig(
    `
network: testnet
rpc_url: ${values.rpc}
bridge_account: ${bridgeAccount}
chain: near
state_dir: ${state}
evidence_dir: ${state}/evidence
signer: { deployments: ${values.deployments} }
assets:
  - asset_id: ${ASSET}
    adapter: simulator
    adapter_config: { scenario: test/fixtures/scenarios/washer.yaml, speed: 60 }
    telemetry_interval_sec: 5
    session_timeout_min: 60
    session_poll_sec: 2
`,
    BRIDGE_DIR,
    process.env,
  );
  const { signers } = await resolveSigners({ bridgeAccount: bridgeAccount!, assets: config.assets, deploymentsPath: values.deployments, env: process.env, signerOptions: { rpcUrls: [values.rpc] } });
  const tx = new Map([...signers].map(([a, s]) => [a, new NearSignerTxSigner(s, { clock: systemClock })]));
  const chain = new NearChainClient(rpc, (a) => tx.get(a) ?? null);
  const bridge = new Bridge({ config, chain, logger: pino({ level: "info", base: { simulated: true } }) });
  await bridge.init();
  const app = await buildServer(bridge);

  // 3. NEP-413 access, signed with the member's full-access key (what the wallet does).
  const ch = (await app.inject({ method: "POST", url: "/access/challenge", payload: { asset_id: ASSET, reservation_id: reservationId, account_id: MEMBER } })).json<{ nonce: string; message: string; recipient: string }>();
  const secret = base58.decode(readKeychainKey(MEMBER).split(":")[1]!);
  const sig = nep413SignWithSeed({ message: ch.message, nonce: base64.decode(ch.nonce), recipient: ch.recipient, callbackUrl: null }, secret.slice(0, 32));
  const access = await app.inject({
    method: "POST",
    url: "/access",
    payload: { asset_id: ASSET, reservation_id: reservationId, account_id: MEMBER, public_key: sig.publicKey, signature: sig.signature, nonce: ch.nonce, message: ch.message, recipient: ch.recipient },
  });
  if (access.statusCode !== 200) throw new Error(`/access: ${access.body}`);
  const sessionId = access.json<{ session_id: string }>().session_id;
  log(`access granted, session ${sessionId}`);

  // 4. Simulated wash cycle (~45 s at speed 60), then finish + telemetry.
  for (let i = 0; i < 150 && bridge.sessions.get(sessionId)?.status !== "finished"; i++) {
    await systemClock.sleep(2_000);
    await bridge.sessions.pollOnce();
  }
  const s = bridge.sessions.get(sessionId);
  if (s?.status !== "finished") throw new Error(`session did not finish: ${s?.status}`);
  await systemClock.sleep(6_000);
  await bridge.telemetry.tickOnce(ASSET);
  const events = bridge.bus.history();
  const telemetryTx = [...events].reverse().find((e) => e.type === "telemetry_reported")?.data.tx as string | undefined;
  await app.close();
  await bridge.stop();

  const evidence = {
    label: "SIMULATED washer loop on NEAR testnet (simulator adapter, D-022): reserve -> NEP-413 access -> session -> finish -> telemetry",
    simulated: true,
    network: "testnet",
    at: new Date().toISOString(),
    asset_id: ASSET,
    member: MEMBER,
    bridge: bridgeAccount,
    reservation_id: reservationId,
    session: { id: sessionId, finish_reason: s.finishReason, metrics_at_end: Object.fromEntries(Object.entries(s.metricsAtEnd ?? {}).map(([k, v]) => [k, v.toString()])) },
    txs: {
      reserve: reserveTx.txHash,
      mark_session_started: s.startTx,
      mark_session_finished: s.finishTx,
      report_telemetry: telemetryTx ?? null,
    },
    explorer: Object.fromEntries(
      Object.entries({ reserve: reserveTx.txHash, mark_session_started: s.startTx, mark_session_finished: s.finishTx, report_telemetry: telemetryTx }).flatMap(([k, v]) => (v ? [[k, explorer(v)]] : [])),
    ),
    bridge_events: events.map((e) => ({ type: e.type, simulated: e.simulated, data: e.data })),
  };
  await writeFile(values.out, JSON.stringify(evidence, null, 2) + "\n");
  log(`evidence written to ${values.out}`);
}

await main();
