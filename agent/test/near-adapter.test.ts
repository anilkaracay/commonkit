import { NearRpc } from "@commonkit/sdk";
import { describe, expect, it } from "vitest";
import { NearAgentChain, type AgentTxSigner } from "../src/chain/near.js";
import { ChainError } from "../src/chain/types.js";

const ASSET = "printer-01.makerlab.commonkit-sxflo.testnet";

/** Answers RPC `call_function` queries from a table of contract-shaped JSON (views.rs). */
function rpcWith(views: Record<string, (args: Record<string, unknown>) => unknown>): NearRpc {
  return new NearRpc("http://rpc.test", async (_url, init) => {
    const body = JSON.parse(String(init!.body)) as { method: string; params: Record<string, string> };
    if (body.method === "block") return Response.json({ result: { header: { timestamp_nanosec: "1800000000000000000" } } });
    const args = JSON.parse(Buffer.from(body.params["args_base64"]!, "base64").toString()) as Record<string, unknown>;
    const view = views[body.params["method_name"]!];
    if (!view) return Response.json({ result: { error: "wasm execution failed: MethodNotFound" } });
    return Response.json({ result: { result: [...Buffer.from(JSON.stringify(view(args)))] } });
  });
}

function recordingSigner(returnValue: unknown = "7"): AgentTxSigner & { sent: { method: string; args: object; gas: number }[] } {
  const sent: { method: string; args: object; gas: number }[] = [];
  return {
    sent,
    functionCall: async (_r, method, args, gas) => {
      sent.push({ method, args, gas });
      return { txHash: "HASH", returnValue };
    },
    isSettled: async () => true,
  };
}

describe("NearAgentChain (testnet adapter) against contract-shaped JSON", () => {
  it("decodes rule status, tasks (paged), wiring, period and ledger", async () => {
    const task = (id: number) => ({
      id: String(id), rule_id: "nozzle_clean", kind: "Maintenance", trigger: { Metric: { metric: "nozzle_seconds", threshold: 720000 } },
      opened_by: "agent-01.testnet", manual: false, rationale: "r", due_value_at_open: 720000, reward_rights: 2, reward_cash: "0",
      reimbursable_max: "0", right_max_slots: 2, right_validity_days: 60, requires_verification_test: true, claim_timeout_hours: 72,
      needs_council: false, status: "Rewarded", claimer: "ayse.testnet", claimed_at: "1", evidence_hash: null, evidence_uri: null,
      expense: "0", receipt_hash: null, expense_state: "None", verification: null, verifier: null, council_approver: null,
      metric_value_at_approval: 720000, reward_state: "Done", minted_right_ids: [], cash_op_id: null, reimbursement_op_id: null, created_at: "5",
    });
    const pages: unknown[][] = [];
    const chain = new NearAgentChain(
      rpcWith({
        get_rule_status: () => [{
          rule_id: "weekly_clean", kind: "Cleaning", trigger: { Schedule: { every_hours: 168 } }, current: "3", baseline: "1799989200000000000",
          due_value: "3", due: false, next_due_estimate: "1800594000000000000", open_task: null, reward_rights: 2, reward_cash: "0", reimbursable_max: "0",
        }],
        get_tasks: (a) => {
          const from = Number(a["from_index"]);
          const rows = Array.from({ length: from === 0 ? 100 : 3 }, (_, i) => task(from + i));
          pages.push(rows);
          return rows;
        },
        get_wiring: () => ({
          dao_id: "makerlab.sputnikv2.testnet", commons_id: "commons.testnet", bridge_id: null, agent_id: "agent-01.testnet", profile_version: 1,
          roles_version: "0", telemetry_epoch: "0", dao_proposal_bond: "100000000000000000000000", dao_proposal_period: "604800000000000", open_escalations: 1,
        }),
        get_period: () => ({ started_at: "1", rights_minted: 4, rights_reserved: 2 }),
        get_ledger: () => ({ float_free: "5", float_cap: "9", deposits_held: "1", rewards_reserved: "0", pending_out: "0", invariant_ok: true }),
      }),
      "agent-01.testnet",
    );
    const [rs] = await chain.getRuleStatus(ASSET);
    expect(rs).toMatchObject({ ruleId: "weekly_clean", due: false, trigger: { type: "Schedule", everyHours: 168 }, nextDueEstimate: 1_800_594_000_000_000_000n });
    const tasks = await chain.getTasks(ASSET);
    expect(tasks).toHaveLength(103);
    expect(pages).toHaveLength(2);
    expect(await chain.getWiring(ASSET)).toMatchObject({ agentId: "agent-01.testnet", daoProposalBond: 10n ** 23n, openEscalations: 1 });
    expect(await chain.getPeriod(ASSET)).toEqual({ startedAt: 1n, rightsMinted: 4, rightsReserved: 2 });
    expect(await chain.getLedger(ASSET)).toEqual({ floatFree: 5n, floatCap: 9n, depositsHeld: 1n, rewardsReserved: 0n });
    expect(await chain.getChainTime()).toBe(1_800_000_000_000_000_000n);
  });

  it("sends exactly the contract arguments, never manual, and returns the new id", async () => {
    const signer = recordingSigner("7");
    const chain = new NearAgentChain(rpcWith({}), "agent-01.testnet", signer);
    expect(await chain.openUpkeepTask(ASSET, "nozzle_clean", "why")).toEqual({ txHash: "HASH", taskId: 7n });
    await chain.escalate(ASSET, { kind: "reimbursement", receiver: "ayse.testnet", amount: 8n * 10n ** 23n, reason: "r", taskId: 3n });
    expect(signer.sent).toEqual([
      { method: "open_upkeep_task", args: { rule_id: "nozzle_clean", rationale: "why" }, gas: 30 },
      { method: "escalate", args: { kind: "reimbursement", receiver: "ayse.testnet", amount: "800000000000000000000000", reason: "r", task_id: "3" }, gas: 60 },
    ]);
  });

  it("refuses writes without a signer and maps contract panics to E_* codes", async () => {
    const chain = new NearAgentChain(rpcWith({}), "agent-01.testnet", null);
    await expect(chain.openUpkeepTask(ASSET, "r", "x")).rejects.toMatchObject({ code: null, ambiguous: false });
    const panicking: AgentTxSigner = {
      functionCall: async () => {
        throw new Error("Smart contract panicked: E_RULE_NOT_DUE: the rule's trigger has not fired");
      },
      isSettled: async () => true,
    };
    const err = await new NearAgentChain(rpcWith({}), "agent-01.testnet", panicking).openUpkeepTask(ASSET, "r", "x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChainError);
    expect((err as ChainError).code).toBe("E_RULE_NOT_DUE");
  });
});
