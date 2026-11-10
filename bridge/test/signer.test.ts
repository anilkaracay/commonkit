import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NearRpc } from "@commonkit/sdk";
import { AmbiguousTxError, TGAS, TxPanicError, TxRejectedError, type OutcomeSummary, type TxRef } from "@commonkit/sdk/signer";
import { describe, expect, it } from "vitest";
import { NearChainClient } from "../src/chain/near.js";
import { NearSignerTxSigner, resolveSigners, type SignerLike } from "../src/chain/signer.js";
import { ChainError, isRetryableChainError } from "../src/chain/types.js";
import { ManualClock } from "../src/util/clock.js";
import { tempDir } from "./helpers/harness.js";

const ref: TxRef = { txHash: "HASH1", nonce: 42n, accountId: "bridge-01.makerlab.testnet", publicKey: "ed25519:pk" };
const outcome = (code: string | null): OutcomeSummary =>
  ({ ok: false, failure: `{"panic":"${code}: x"}`, errorCode: code, receiptFailures: [], logs: [], events: [], returnValue: null, gasBurnt: 1n, signerId: ref.accountId, receiverId: "a.testnet" }) as unknown as OutcomeSummary;

/** Mocked NearSigner: no network, records every call. */
function mockSigner(behaviour: { send?: () => Promise<{ txHash: string }>; settled?: boolean }) {
  const sent: unknown[] = [];
  const signer: SignerLike = {
    accountId: ref.accountId,
    publicKey: "ed25519:pk",
    signAndSend: (async (req: unknown) => {
      sent.push(req);
      const r = await (behaviour.send ?? (async () => ({ txHash: "OK1" })))();
      return { ...r, nonce: 1n, outcome: outcome(null), logs: [] };
    }) as SignerLike["signAndSend"],
    isSettled: async () => behaviour.settled ?? false,
  };
  return { signer, sent };
}

describe("NearSignerTxSigner over @commonkit/sdk/signer (mocked NearSigner)", () => {
  const clock = () => new ManualClock();

  it("sends a function call with Tgas converted to gas units and returns the tx hash", async () => {
    const { signer, sent } = mockSigner({});
    const tx = new NearSignerTxSigner(signer, { clock: clock() });
    expect(await tx.functionCall("a.testnet", "report_telemetry", { metrics: [["cycles", 1]] }, 30)).toEqual({ txHash: "OK1" });
    expect(sent).toEqual([{ receiverId: "a.testnet", methodName: "report_telemetry", args: { metrics: [["cycles", 1]] }, gas: 30n * TGAS }]);
  });

  it("TxPanicError -> ChainError kind panic with the contract code, never retried", async () => {
    const { signer } = mockSigner({ send: async () => Promise.reject(new TxPanicError(ref, outcome("E_OUT_OF_SERVICE"))) });
    const err = await new NearSignerTxSigner(signer, { clock: clock() }).functionCall("a.testnet", "mark_session_started", { id: "1" }, 30).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChainError);
    expect(err).toMatchObject({ kind: "panic", code: "E_OUT_OF_SERVICE", txHash: "HASH1" });
    expect(isRetryableChainError(err)).toBe(false);
  });

  it("TxRejectedError -> kind rejected (nothing applied), retryable", async () => {
    const { signer } = mockSigner({ send: async () => Promise.reject(new TxRejectedError(ref, { NotEnoughBalance: {} })) });
    const err = await new NearSignerTxSigner(signer, { clock: clock() }).functionCall("a.testnet", "report_telemetry", {}, 30).catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: "rejected" });
    expect(isRetryableChainError(err)).toBe(true);
  });

  it("AmbiguousTxError waits for isSettled: settled -> ambiguous_settled (re-read, then retry); never -> not retried", async () => {
    const amb = () => Promise.reject(new AmbiguousTxError(ref, "timeout"));
    const settled = await new NearSignerTxSigner(mockSigner({ send: amb, settled: true }).signer, { clock: clock() })
      .functionCall("a.testnet", "mark_session_finished", {}, 100)
      .catch((e: unknown) => e);
    expect(settled).toMatchObject({ kind: "ambiguous_settled", txHash: "HASH1" });
    expect(isRetryableChainError(settled)).toBe(true);
    const c = clock();
    const start = c.now();
    const never = await new NearSignerTxSigner(mockSigner({ send: amb, settled: false }).signer, { clock: c, settleTimeoutMs: 10_000, settlePollMs: 1_000 })
      .functionCall("a.testnet", "mark_session_finished", {}, 100)
      .catch((e: unknown) => e);
    expect(never).toMatchObject({ kind: "ambiguous" });
    expect(isRetryableChainError(never)).toBe(false);
    expect(c.now() - start).toBeGreaterThanOrEqual(10_000);
  });

  it("NearChainClient routes each asset to its own key; an asset without a key fails as config (not retried)", async () => {
    const a = mockSigner({});
    const signers = new Map([["printer-01.testnet", new NearSignerTxSigner(a.signer, { clock: clock() })]]);
    const c = new NearChainClient(new NearRpc("https://rpc.example.test", async () => new Response("{}")), (id) => signers.get(id) ?? null);
    await c.markSessionStarted("printer-01.testnet", 3n, { simulated: true });
    expect(a.sent).toEqual([{ receiverId: "printer-01.testnet", methodName: "mark_session_started", args: { id: "3" }, gas: 30n * TGAS }]);
    const err = await c.markSessionStarted("laser-01.testnet", 1n, { simulated: true }).catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: "config" });
    expect(isRetryableChainError(err)).toBe(false);
  });
});

describe("resolveSigners: one function-call key per (bridge, asset)", () => {
  it("prefers the asset's signer_env, else the keychain key listed in deployments, else none", async () => {
    const dir = await tempDir();
    const deployments = join(dir, "testnet.json");
    await writeFile(
      deployments,
      JSON.stringify({
        schema: 1,
        function_call_keys: [
          { account: "bridge-01.testnet", public_key: "ed25519:LASERKEY", receiver_id: "laser-01.testnet", method_names: ["report_telemetry"], tx: "t" },
          { account: "agent-01.testnet", public_key: "ed25519:AGENTKEY", receiver_id: "washer-01.testnet", method_names: [], tx: "t" },
        ],
      }),
    );
    const made: string[] = [];
    const fake = (pk: string): SignerLike => ({ accountId: "bridge-01.testnet", publicKey: pk, signAndSend: (async () => ({})) as never, isSettled: async () => true });
    const { signers, report } = await resolveSigners({
      bridgeAccount: "bridge-01.testnet",
      assets: [
        { asset_id: "printer-01.testnet", signer_env: "BRIDGE_KEY_PRINTER" },
        { asset_id: "laser-01.testnet" },
        { asset_id: "washer-01.testnet" },
      ],
      deploymentsPath: deployments,
      env: { BRIDGE_KEY_PRINTER: "ed25519:secret" },
      make: {
        fromEnv: (_a, v) => (made.push(`env:${v}`), fake("ed25519:PRINTERKEY")),
        fromKeychain: (_a, pk) => (made.push(`keychain:${pk}`), fake(pk)),
      },
    });
    expect(made).toEqual(["env:BRIDGE_KEY_PRINTER", "keychain:ed25519:LASERKEY"]);
    expect([...signers.keys()]).toEqual(["printer-01.testnet", "laser-01.testnet"]);
    expect(report.map((r) => r.source)).toEqual(["env", "keychain", "none"]);
    // The agent's key for washer is not the bridge's: washer has no bridge signer.
    expect(report[2]?.publicKey).toBeNull();
  });

  it("a missing deployments file is not an error (nothing deployed yet)", async () => {
    const { report } = await resolveSigners({
      bridgeAccount: "b.testnet",
      assets: [{ asset_id: "a.testnet" }],
      deploymentsPath: join(await tempDir(), "missing.json"),
      env: {},
    });
    expect(report[0]?.source).toBe("none");
  });
});
