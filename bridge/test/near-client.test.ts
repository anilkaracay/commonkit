import { NearRpc } from "@commonkit/sdk";
import { describe, expect, it } from "vitest";
import { NearChainClient } from "../src/chain/near.js";
import { ChainError, isRetryableChainError } from "../src/chain/types.js";

type Handler = (method: string, params: Record<string, unknown>) => unknown;

/** Fake JSON-RPC endpoint; `view` results are returned as call_function byte arrays. */
function rpcWith(handler: Handler): { rpc: NearRpc; seen: Array<{ method: string; params: Record<string, unknown> }> } {
  const seen: Array<{ method: string; params: Record<string, unknown> }> = [];
  const fetchImpl = async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { method: string; params: Record<string, unknown> };
    seen.push(body);
    const out = handler(body.method, body.params);
    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { rpc: new NearRpc("https://rpc.example.test", fetchImpl), seen };
}
const viewResult = (v: unknown) => ({ jsonrpc: "2.0", id: "x", result: { result: [...Buffer.from(JSON.stringify(v))] } });

describe("NearChainClient (reads via @commonkit/sdk NearRpc)", () => {
  it("chain time uses header.timestamp_nanosec (string, no float precision loss)", async () => {
    const { rpc } = rpcWith(() => ({ result: { header: { timestamp: 1, timestamp_nanosec: "1794229306287123456" } } }));
    expect(await new NearChainClient(rpc).getChainTime()).toBe(1794229306287123456n);
  });

  it("view_access_key: FullAccess, FunctionCall, and unknown key -> null", async () => {
    let mode = 0;
    const { rpc, seen } = rpcWith(() => {
      if (mode === 0) return { result: { nonce: 1, permission: "FullAccess", block_height: 1, block_hash: "h" } };
      if (mode === 1) {
        return { result: { nonce: 1, permission: { FunctionCall: { allowance: null, receiver_id: "a.testnet", method_names: ["x"] } } } };
      }
      return { error: { name: "HANDLER_ERROR", cause: { name: "UNKNOWN_ACCESS_KEY", info: {} } } };
    });
    const c = new NearChainClient(rpc);
    expect(await c.viewAccessKey("alice.testnet", "ed25519:abc")).toEqual({ kind: "full_access" });
    expect(seen[0]?.params).toMatchObject({ request_type: "view_access_key", finality: "final", account_id: "alice.testnet", public_key: "ed25519:abc" });
    mode = 1;
    expect(await c.viewAccessKey("alice.testnet", "ed25519:abc")).toEqual({ kind: "function_call", receiverId: "a.testnet", methodNames: ["x"] });
    mode = 2;
    expect(await c.viewAccessKey("alice.testnet", "ed25519:abc")).toBeNull();
  });

  it("parses can_access, reservation, task and telemetry (U64 strings, u64 numbers)", async () => {
    const { rpc } = rpcWith((_m, p) => {
      switch (p.method_name) {
        case "can_access":
          return viewResult({ ok: false, reason: "start window closed", window_start: "10", window_end: "20" });
        case "get_reservation":
          return viewResult({ id: "7", holder: "alice.testnet", start_slot: "99", slots: 2, status: "InSession", session_started_at: "5", session_finished_at: null, extra: 1 });
        case "get_task":
          return viewResult({ id: "3", rule_id: "filter_clean", status: "Submitted", claimer: "alice.testnet", verification: null });
        default:
          return viewResult({ metrics: [["cycles", 31], ["simulated", 1]], updated_at: "5", reports: "2", epoch: "0", reset_pending: false });
      }
    });
    const c = new NearChainClient(rpc);
    expect(await c.canAccess("w.testnet", "alice.testnet", 7n)).toEqual({ ok: false, reason: "start window closed", windowStart: 10n, windowEnd: 20n });
    expect(await c.getReservation("w.testnet", 7n)).toMatchObject({ id: 7n, status: "InSession", startSlot: 99n, sessionStartedAt: 5n });
    expect(await c.getTask("w.testnet", 3n)).toMatchObject({ id: 3n, ruleId: "filter_clean", claimer: "alice.testnet", verification: null });
    expect((await c.getTelemetry("w.testnet")).metrics).toEqual({ cycles: 31n, simulated: 1n });
  });

  it("keeps E_* codes the sdk does not know yet (E_OUT_OF_SERVICE) and marks them non-retryable", async () => {
    const { rpc } = rpcWith(() => ({}));
    const c = new NearChainClient(rpc, {
      functionCall: async () => {
        throw new Error("Smart contract panicked: E_OUT_OF_SERVICE: asset is out of service");
      },
    });
    const err = await c.markSessionStarted("w.testnet", 1n, { simulated: false }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChainError);
    expect((err as ChainError).code).toBe("E_OUT_OF_SERVICE");
    expect(isRetryableChainError(err)).toBe(false);
    expect(isRetryableChainError(new ChainError("RPC HTTP 503", null))).toBe(true);
  });

  it("refuses writes without a signer instead of pretending", async () => {
    const { rpc } = rpcWith(() => ({}));
    await expect(new NearChainClient(rpc).reportTelemetry("w.testnet", { cycles: 1n }, { simulated: false })).rejects.toBeInstanceOf(ChainError);
  });

  it("sends metrics as sorted [name, number] pairs with the configured gas", async () => {
    const { rpc } = rpcWith(() => ({}));
    const calls: unknown[] = [];
    const c = new NearChainClient(rpc, {
      functionCall: async (receiver, method, args, gas) => {
        calls.push({ receiver, method, args, gas });
        return { txHash: "tx1" };
      },
    });
    await c.markSessionFinished("w.testnet", 7n, { run_seconds: 10n, cycles: 2n }, { simulated: false });
    expect(calls).toEqual([{ receiver: "w.testnet", method: "mark_session_finished", args: { id: "7", metrics: [["cycles", 2], ["run_seconds", 10]] }, gas: 100 }]);
  });
});
