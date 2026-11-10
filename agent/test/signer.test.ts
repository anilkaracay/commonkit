import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NearRpc } from "@commonkit/sdk";
import { AmbiguousTxError, TGAS, TxPanicError, TxRejectedError, type OutcomeSummary, type TxRef } from "@commonkit/sdk/signer";
import { describe, expect, it } from "vitest";
import { Agent } from "../src/agent.js";
import { NearAgentChain } from "../src/chain/near.js";
import { NearAgentSigner, resolveAgentSigners, type SignerLike } from "../src/chain/signer.js";
import { ChainError } from "../src/chain/types.js";
import { aliasOf, agentAccountOf, deployedAssets, testnetLimitsPlan, type DeploymentsView } from "../src/deployments.js";
import { EventBus, type AgentEvent } from "../src/events.js";
import { outcomeCode } from "../src/limits-demo.js";
import { AgentMemory } from "../src/memory.js";
import { templateOnly } from "../src/rationale/llm.js";

const AGENT = "agent.commonkit-sxflo.testnet";
const PRINTER = "printer-01.makerlab.commonkit-sxflo.testnet";
const FRIDGE = "fridge-01.dorm-b.commonkit-sxflo.testnet";
const ref = (txHash = "HASH1", nonce = 42n): TxRef => ({ txHash, nonce, accountId: AGENT, publicKey: "ed25519:pk" });
const outcome = (code: string | null, returnValue: unknown = null): OutcomeSummary =>
  ({
    ok: code === null, failure: code ? `{"ActionError":"Smart contract panicked: ${code}: x"}` : null, errorCode: code, receiptFailures: [],
    logs: [], events: [], returnValue, gasBurnt: 1n, signerId: AGENT, receiverId: PRINTER,
  }) as OutcomeSummary;

type Send = SignerLike["signAndSend"];
function mockSigner(send: (req: Parameters<Send>[0]) => Promise<{ txHash: string; returnValue?: unknown }>, settled: () => boolean = () => true) {
  const sent: Parameters<Send>[0][] = [];
  const settleChecks: unknown[] = [];
  const signer: SignerLike = {
    accountId: AGENT,
    publicKey: "ed25519:pk",
    signAndSend: (async (req) => {
      sent.push(req);
      const r = await send(req);
      return { txHash: r.txHash, nonce: 1n, outcome: outcome(null, r.returnValue ?? null), logs: [] };
    }) as Send,
    isSettled: async (r) => {
      settleChecks.push(r);
      return settled();
    },
  };
  return { signer, sent, settleChecks };
}

describe("NearAgentSigner over @commonkit/sdk/signer (mocked NearSigner)", () => {
  it("converts Tgas to gas, never attaches a deposit, and returns the contract's return value", async () => {
    const m = mockSigner(async () => ({ txHash: "OK", returnValue: "5" }));
    const s = new NearAgentSigner(new Map([[PRINTER, m.signer]]));
    expect(await s.functionCall(PRINTER, "open_upkeep_task", { rule_id: "r", rationale: "x" }, 30)).toEqual({ txHash: "OK", returnValue: "5" });
    expect(m.sent).toEqual([{ receiverId: PRINTER, methodName: "open_upkeep_task", args: { rule_id: "r", rationale: "x" }, gas: 30n * TGAS }]);
    await s.rawCall(PRINTER, "fund_float", {}, 60, 1n);
    expect(m.sent[1]).toMatchObject({ methodName: "fund_float", deposit: 1n, gas: 60n * TGAS });
  });

  it("TxPanicError → ChainError with the E_* code and the on-chain tx hash, not ambiguous", async () => {
    const m = mockSigner(async () => Promise.reject(new TxPanicError(ref(), outcome("E_RULE_NOT_DUE"))));
    const err = (await new NearAgentSigner(new Map([[PRINTER, m.signer]])).functionCall(PRINTER, "open_upkeep_task", {}, 30).catch((e: unknown) => e)) as ChainError;
    expect(err).toBeInstanceOf(ChainError);
    expect(err).toMatchObject({ code: "E_RULE_NOT_DUE", ambiguous: false });
    expect(err.ref?.txHash).toBe("HASH1");
  });

  it("TxRejectedError → not applied (no code, not ambiguous); protocol refusals map to PROTOCOL codes", async () => {
    const m = mockSigner(async () =>
      Promise.reject(new TxRejectedError(ref(), { name: "HANDLER_ERROR", cause: { name: "INVALID_TRANSACTION", info: { InvalidAccessKeyError: { DepositWithFunctionCall: null } } } })),
    );
    const err = (await new NearAgentSigner(new Map([[PRINTER, m.signer]])).rawCall(PRINTER, "fund_float", {}, 60, 1n).catch((e: unknown) => e)) as ChainError;
    expect(err).toMatchObject({ code: null, ambiguous: false, ref: null });
    expect(outcomeCode(err)).toBe("PROTOCOL:DepositWithFunctionCall");
  });

  it("AmbiguousTxError → ambiguous with a ref; isSettled asks the signer of that asset", async () => {
    const m = mockSigner(async () => Promise.reject(new AmbiguousTxError(ref("H2", 77n), "timeout")), () => false);
    const fridge = mockSigner(async () => ({ txHash: "x" }));
    const s = new NearAgentSigner(new Map([[PRINTER, m.signer], [FRIDGE, fridge.signer]]), () => 123);
    const err = (await s.functionCall(PRINTER, "escalate", {}, 60).catch((e: unknown) => e)) as ChainError;
    expect(err).toMatchObject({ ambiguous: true, code: null });
    expect(err.ref).toEqual({ method: "escalate", receiverId: PRINTER, txHash: "H2", nonce: 77n, sentAtMs: 123 });
    expect(await s.isSettled(err.ref!)).toBe(false);
    expect(m.settleChecks).toEqual([{ txHash: "H2", nonce: 77n }]);
    expect(fridge.settleChecks).toEqual([]);
  });

  it("refuses an asset it holds no key for", async () => {
    const err = await new NearAgentSigner(new Map()).functionCall(PRINTER, "open_upkeep_task", {}, 30).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: null, ambiguous: false });
    expect((err as Error).message).toMatch(/no agent function-call key/);
  });

  it("the loop holds an ambiguous open_upkeep_task until the signer says it is settled", async () => {
    let settled = false;
    const m = mockSigner(async () => Promise.reject(new AmbiguousTxError(ref("H3", 9n), "timeout")), () => settled);
    const status = {
      rule_id: "bed_level", kind: "Maintenance", trigger: { Metric: { metric: "jobs_total", threshold: 50 } }, current: "60", baseline: "0",
      due_value: "60", due: true, next_due_estimate: null, open_task: null, reward_rights: 1, reward_cash: "0", reimbursable_max: "0",
    };
    const views: Record<string, unknown> = {
      get_wiring: { dao_id: "d", agent_id: AGENT, dao_proposal_bond: "1", dao_proposal_period: "1", open_escalations: 0 },
      get_rule_status: [status],
      get_profile: { display_name: "Printer", period_days: 30, period_reward_quota: 10, auto_reward_cash_cap: "0", rules: [{
        rule_id: "bed_level", kind: "Maintenance", trigger: { Metric: { metric: "jobs_total", threshold: 50 } }, title: "Level the bed",
        reward_rights: 1, reward_cash: "0", reimbursable_max: "0", requires_verification_test: true, claim_timeout_hours: 72 }] },
      get_period: { started_at: "1800000000000000000", rights_minted: 0, rights_reserved: 0 },
      get_ledger: { float_free: "1000", float_cap: "2000", deposits_held: "0", rewards_reserved: "0" },
      get_tasks: [],
      get_escalations: [],
      get_service_status: { in_service: true, since: "1" },
    };
    const rpc = new NearRpc("http://rpc.test", async (_u, init) => {
      const body = JSON.parse(String(init!.body)) as { method: string; params: Record<string, string> };
      if (body.method === "block") return Response.json({ result: { header: { timestamp_nanosec: "1800000000000000001" } } });
      return Response.json({ result: { result: [...Buffer.from(JSON.stringify(views[body.params["method_name"]!]))] } });
    });
    const events: AgentEvent[] = [];
    const bus = new EventBus(null, null);
    bus.subscribe((e) => events.push(e));
    const agent = new Agent({
      chain: new NearAgentChain(rpc, AGENT, new NearAgentSigner(new Map([[PRINTER, m.signer]]))),
      assets: [{ assetId: PRINTER, alias: "PRINTER_01", simulated: true, purchaseHints: [], supplierIsTeamAccount: false }],
      bus,
      rephraser: templateOnly,
      memory: new AgentMemory(null),
      syncEveryMs: 60_000,
    });
    await agent.tick();
    await agent.tick();
    expect(m.sent).toHaveLength(1);
    expect(events.find((e) => e.type === "write_ambiguous")!.data).toMatchObject({ tx_hash: "H3", landed: false });
    settled = true; // the tx can no longer land and the rule still shows no open task
    await agent.tick();
    expect(m.sent).toHaveLength(2);
    expect(m.sent[1]).toMatchObject({ methodName: "open_upkeep_task", gas: 30n * TGAS });
    expect(Object.keys(m.sent[1]!.args)).toEqual(["rule_id", "rationale"]);
  });
});

describe("signer resolution and deployments", () => {
  const deployments: DeploymentsView = {
    schema: 1,
    network: "testnet",
    communities: { makerlab: { dao_id: "makerlab-ck.sputnikv2.testnet", assets: [PRINTER] } },
    accounts: {
      [AGENT]: { role: "agent", keyless: false },
      [PRINTER]: { role: "asset", profile: "profiles/printer_3d.json", community: "makerlab", keyless: true },
      [FRIDGE]: { role: "asset", profile: "profiles/community_fridge.json", community: "dorm-b", keyless: true },
      "washer-01.dorm-b.commonkit-sxflo.testnet": { role: "asset", profile: "profiles/washer.json", community: "dorm-b", keyless: true },
    },
    function_call_keys: [
      { account: AGENT, public_key: "ed25519:printerkey", receiver_id: PRINTER, method_names: ["open_upkeep_task", "annotate_task", "escalate"] },
      { account: "bridge.testnet", public_key: "ed25519:other", receiver_id: FRIDGE, method_names: ["report_telemetry"] },
    ],
  };

  it("env AGENT_KEY_<ALIAS> first, then the agent's keychain key from deployments, else none", () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-dep-"));
    const path = join(dir, "testnet.json");
    writeFileSync(path, JSON.stringify(deployments));
    const made: string[] = [];
    const fake = (pk: string): SignerLike => ({ accountId: AGENT, publicKey: pk, signAndSend: (() => Promise.reject(new Error("no"))) as Send, isSettled: async () => true });
    const { signers, report } = resolveAgentSigners({
      agentAccount: AGENT,
      assets: [
        { assetId: PRINTER, alias: "PRINTER_01" },
        { assetId: FRIDGE, alias: "FRIDGE_01" },
        { assetId: "washer-01.dorm-b.commonkit-sxflo.testnet", alias: "WASHER_01" },
      ],
      deploymentsPath: path,
      env: { AGENT_KEY_WASHER_01: "ed25519:secret" },
      make: {
        fromEnv: (_a, v) => (made.push(`env:${v}`), fake("ed25519:fromenv")),
        fromKeychain: (_a, pk) => (made.push(`keychain:${pk}`), fake(pk)),
      },
    });
    expect(made).toEqual(["keychain:ed25519:printerkey", "env:AGENT_KEY_WASHER_01"]);
    expect([...signers.keys()]).toEqual([PRINTER, "washer-01.dorm-b.commonkit-sxflo.testnet"]);
    expect(report.map((r) => r.source)).toEqual(["keychain", "none", "env"]); // the bridge's fridge key is not ours
  });

  it("builds the testnet limits plan from asset profiles", () => {
    expect(aliasOf(PRINTER)).toBe("PRINTER_01");
    expect(agentAccountOf(deployments)).toBe(AGENT);
    expect(deployedAssets(deployments).map((a) => a.profile)).toEqual(["printer_3d.json", "community_fridge.json", "washer.json"]);
    expect(testnetLimitsPlan(deployments)).toEqual({
      metricAsset: PRINTER,
      scheduleAsset: FRIDGE,
      scheduleRule: "weekly_clean",
      quotaAsset: "washer-01.dorm-b.commonkit-sxflo.testnet",
      revokedAsset: PRINTER,
    });
    expect(testnetLimitsPlan(deployments, { revokedAsset: FRIDGE }).revokedAsset).toBe(FRIDGE);
    expect(() => testnetLimitsPlan({ ...deployments, accounts: { [AGENT]: { role: "agent", keyless: false } } })).toThrow(/printer_3d.json/);
  });
});
