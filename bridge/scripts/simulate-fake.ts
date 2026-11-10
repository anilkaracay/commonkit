/**
 * `./scripts/simulate.sh <asset_type> --fake` (D-420): the upkeep loop with the bridge and the
 * agent in-process on their in-memory FAKE chains, for machines without a NEAR sandbox binary.
 * NO CONTRACT CODE RUNS: reservations and the claim/approval are written straight into the
 * fakes, rights, the right reservation and the sweep are not modelled (reported as skipped).
 * Local time is a manual clock, so the run is fast and deterministic. Everything is SIMULATED.
 *
 *   tsx scripts/simulate-fake.ts --input <plan.json> --out <result.json>
 */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { base64 } from "@scure/base";
import { pino } from "pino";
import { z } from "zod";
import { Agent } from "../../agent/src/agent.js";
import { FakeAgentChain } from "../../agent/src/chain/fake.js";
import { EventBus } from "../../agent/src/events.js";
import { AgentMemory } from "../../agent/src/memory.js";
import { templateOnly } from "../../agent/src/rationale/llm.js";
import { Bridge } from "../src/bridge.js";
import { FakeChainClient } from "../src/chain/fake.js";
import { parseConfig } from "../src/config.js";
import { buildServer } from "../src/http/server.js";
import { nep413SignWithSeed } from "../src/nep413/payload.js";
import { ManualClock } from "../src/util/clock.js";

const inputSchema = z.object({
  assetType: z.string(),
  scenarioFile: z.string(),
  demoProfile: z.record(z.string(), z.unknown()),
  rule: z.object({ rule_id: z.string(), kind: z.string(), requires_verification_test: z.boolean(), reward_rights: z.number() }),
  expense: z.string().regex(/^\d+$/),
  telemetryIntervalSec: z.number().int().positive(),
  gauges: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))).optional(),
});

interface Step {
  label: string;
  ok: boolean;
  tx: string | null;
  detail: string;
}

const ASSET = (t: string) => `${t.replace(/_/g, "-")}.fake.sim`;
const BRIDGE = "bridge.fake.sim";
const AGENT = "agent.fake.sim";
const ALI = "ali.fake.sim";
const AYSE = "ayse.fake.sim";
const seedOf = (s: string) => new Uint8Array(createHash("sha256").update(s).digest());

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { input: { type: "string" }, out: { type: "string" } } });
  if (!values.input || !values.out) throw new Error("--input and --out are required");
  const input = inputSchema.parse(JSON.parse(await readFile(values.input, "utf8")));
  const assetId = ASSET(input.assetType);
  const steps: Step[] = [];
  const say = (s: Step) => {
    steps.push(s);
    process.stdout.write(`[SIMULATED] [fake chain]   ${s.detail.startsWith("skipped") ? "⏭" : s.ok ? "✅" : "❌"} ${s.label}${s.tx ? `  ${s.tx}` : ""}${s.detail ? `  (${s.detail})` : ""}\n`);
    if (!s.ok) throw new Error(`${s.label}: ${s.detail}`);
  };
  const t0 = Date.now();
  let error: string | null = null;
  const state = await mkdtemp(join(tmpdir(), "ck-sim-fake-"));
  const clock = new ManualClock(Date.now());
  const chain = new FakeChainClient(BigInt(clock.now()) * 1_000_000n);
  const advance = (ms: number) => {
    clock.advance(ms);
    chain.advanceMs(ms);
  };
  const config = parseConfig(
    JSON.stringify({
      network: "sandbox",
      bridge_account: BRIDGE,
      chain: "fake",
      state_dir: join(state, "bridge"),
      evidence_dir: join(state, "evidence"),
      assets: [
        {
          asset_id: assetId,
          adapter: "simulator",
          adapter_config: { scenario: input.scenarioFile },
          telemetry_interval_sec: input.telemetryIntervalSec,
          session_timeout_min: 60,
          ...(input.gauges ? { gauges: input.gauges } : {}),
        },
      ],
    }),
    state,
    {},
  );
  const bridge = new Bridge({ config, chain, logger: pino({ level: "silent" }), clock, wallNow: () => clock.now(), chainClockMaxAgeMs: 0, retry: { attempts: 2, baseDelayMs: 1 } });
  const agentChain = new FakeAgentChain(AGENT, BigInt(clock.now()) * 1_000_000n);
  const agentBus = new EventBus(null, null, () => clock.now());
  try {
    await bridge.init();
    const app = await buildServer(bridge);
    agentChain.addAsset(assetId, { profileJson: input.demoProfile, policyCached: true });
    const agent = new Agent({
      chain: agentChain,
      assets: [{ assetId, alias: input.assetType.toUpperCase(), simulated: true, purchaseHints: [], supplierIsTeamAccount: true }],
      bus: agentBus,
      rephraser: templateOnly,
      memory: new AgentMemory(null),
      syncEveryMs: 60_000,
      nowMs: () => clock.now(),
    });
    say({ label: "bridge (simulator adapter) + agent on in-memory fake chains", ok: true, tx: null, detail: "no contract code runs in --fake" });
    const signed = async (url: string, challenge: Record<string, unknown>, seed: Uint8Array) => {
      const ch = await app.inject({ method: "POST", url: "/access/challenge", payload: challenge });
      const c = ch.json<{ nonce: string; message: string; recipient: string }>();
      const sig = nep413SignWithSeed({ message: c.message, nonce: base64.decode(c.nonce), recipient: c.recipient, callbackUrl: null }, seed);
      const { action: _a, ...rest } = challenge;
      const res = await app.inject({ method: "POST", url, payload: { ...rest, public_key: sig.publicKey, signature: sig.signature, nonce: c.nonce, message: c.message, recipient: c.recipient } });
      return { status: res.statusCode, body: res.json<Record<string, unknown>>() };
    };
    const pub = (seed: Uint8Array) => nep413SignWithSeed({ message: "x", nonce: new Uint8Array(32), recipient: "x", callbackUrl: null }, seed).publicKey;
    chain.addAccessKey(ALI, pub(seedOf("ali")));
    chain.addAccessKey(AYSE, pub(seedOf("ayse")));
    const now = await chain.getChainTime();
    chain.addReservation(assetId, { id: 1n, holder: ALI, status: "Confirmed", windowStart: now - 1_000_000_000n, windowEnd: now + 900_000_000_000n });
    say({ label: "reservation #1 for ali written into the fake chain", ok: true, tx: null, detail: "fake: no reserve() call, no fee" });
    // One telemetry sample before use, as the bridge's timer would take: gauges get a baseline.
    await bridge.telemetry.tickOnce(assetId);
    const acc = await signed("/access", { asset_id: assetId, reservation_id: "1", account_id: ALI, action: "access" }, seedOf("ali"));
    say({ label: "NEP-413 signed access → bridge 200 (real NEP-413 checks)", ok: acc.status === 200, tx: null, detail: acc.status === 200 ? `session ${String(acc.body.session_id)}` : JSON.stringify(acc.body) });
    const sid = String(acc.body.session_id);
    for (let i = 0; i < 2000 && bridge.sessions.get(sid)?.status !== "finished"; i++) {
      advance(1000);
      if (i % input.telemetryIntervalSec === 0) await bridge.telemetry.tickOnce(assetId);
      await bridge.sessions.pollOnce();
    }
    const s = bridge.sessions.get(sid);
    say({ label: `session finished (${s?.finishReason})`, ok: s?.status === "finished", tx: s?.finishTx ?? null, detail: "fake mark_session_finished" });
    // Telemetry → agent's fake chain until the rule is due (gauge-derived counters need ticks).
    let due = false;
    for (let i = 0; i < 600 && !due; i++) {
      advance(input.telemetryIntervalSec * 1000);
      agentChain.nowNs = BigInt(clock.now()) * 1_000_000n;
      await bridge.telemetry.tickOnce(assetId);
      const tel = await chain.getTelemetry(assetId);
      for (const [k, v] of Object.entries(tel.metrics)) agentChain.setMetric(assetId, k, v);
      due = (await agentChain.getRuleStatus(assetId)).some((r) => r.ruleId === input.rule.rule_id && r.due);
    }
    say({ label: `telemetry makes ${input.rule.rule_id} due`, ok: due, tx: null, detail: "fake chain telemetry" });
    await agent.tick();
    const opened = agentBus.history().find((e) => e.type === "task_opened" && e.data.rule_id === input.rule.rule_id);
    say({ label: `agent opens the ${input.rule.kind} task with a template rationale`, ok: opened?.simulated === true, tx: (opened?.data.tx_hash as string | undefined) ?? null, detail: `rationale: "${String(opened?.data.rationale ?? "").slice(0, 100)}…"` });
    const taskId = BigInt(String(opened?.data.task_id));
    chain.addTask(assetId, { id: taskId, ruleId: input.rule.rule_id, status: "Submitted", claimer: AYSE, requiresVerificationTest: input.rule.requires_verification_test });
    say({ label: `ayse's claim + submit written into the fake chain${BigInt(input.expense) > 0n ? " (with expense)" : ""}`, ok: true, tx: null, detail: "fake: no claim_task/submit_task call" });
    if (input.rule.requires_verification_test) {
      const run = await signed(`/verification/${assetId}/${taskId}/run`, { asset_id: assetId, task_id: String(taskId), account_id: AYSE, action: "verify" }, seedOf("ayse"));
      const done = run.status === 202 ? await bridge.verification.wait(String(run.body.run_id)) : null;
      say({ label: "bridge verification test passed → fake submit_verification_result", ok: done?.status === "reported" && chain.task(assetId, taskId)?.verification?.passed === true, tx: null, detail: `run ${String(run.body.run_id ?? run.status)}` });
    }
    const t = agentChain.completeTask(assetId, taskId, AYSE, BigInt(input.expense));
    say({ label: "approval and reward modelled by the agent's fake chain → task Rewarded", ok: t.status === "Rewarded", tx: null, detail: "fake: no approve_task, no rights minted" });
    for (const label of ["usage rights minted (NEP-171)", "reserve with the earned right", "sweep to the DAO treasury", "ledger invariant, keyless account, code_hash"])
      say({ label, ok: true, tx: null, detail: "skipped: not modelled by the fake chains (run without --fake)" });
    const events = bridge.bus.history();
    say({ label: "every bridge and agent event labelled simulated", ok: events.every((e) => e.simulated) && agentBus.history().filter((e) => e.asset_id === assetId).every((e) => e.simulated), tx: null, detail: `${events.length} bridge events` });
    await app.close();
  } catch (e) {
    error = (e as Error).message;
  } finally {
    await bridge.stop();
  }
  await writeFile(
    values.out,
    JSON.stringify({ assetType: input.assetType, assetId, mode: "fake", ok: error === null, ms: Date.now() - t0, steps, codeHash: null, invariantOk: null, error }, null, 2),
  );
}

await main();
