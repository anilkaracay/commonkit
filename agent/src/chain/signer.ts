/**
 * The agent's writes over the shared `@commonkit/sdk/signer` (D-707). A NEAR function-call key is
 * bound to one receiver, so there is one signer per asset contract (AGENT_SPEC §6).
 *
 * Error mapping onto the agent's idempotency rules (D-601):
 *   TxPanicError     → ChainError(code)           executed and failed; final, never retried
 *   TxRejectedError  → ChainError(no code)        refused before execution; nothing applied
 *   AmbiguousTxError → ChainError(ambiguous, ref) may have landed; held until isSettled(ref)
 */
import { readFileSync } from "node:fs";
import { AmbiguousTxError, NearSigner, TGAS, TxPanicError, TxRejectedError, type SignerOptions } from "@commonkit/sdk/signer";
import { parseErrorCode } from "@commonkit/sdk";
import { z } from "zod";
import type { AgentMethod, AgentTxSigner } from "./near.js";
import { ChainError, extractErrorCode, type WriteRef } from "./types.js";

/** The part of NearSigner the agent uses (mockable). */
export type SignerLike = Pick<NearSigner, "accountId" | "publicKey" | "signAndSend" | "isSettled">;

export class NearAgentSigner implements AgentTxSigner {
  constructor(
    /** asset contract id → signer holding the agent's function-call key for it. */
    private readonly signers: ReadonlyMap<string, SignerLike>,
    private readonly nowMs: () => number = () => Date.now(),
  ) {}

  has(assetId: string): boolean {
    return this.signers.has(assetId);
  }

  functionCall(receiverId: string, methodName: AgentMethod, args: object, gasTgas: number): Promise<{ txHash: string; returnValue: unknown }> {
    return this.send(receiverId, methodName, args, gasTgas, 0n);
  }

  /**
   * Limits demo only: any method, optionally with a deposit. A function-call key cannot attach a
   * deposit and cannot call methods outside its list; the protocol refuses both before execution.
   */
  rawCall(receiverId: string, methodName: string, args: object, gasTgas: number, deposit: bigint): Promise<{ txHash: string; returnValue: unknown }> {
    return this.send(receiverId, methodName, args, gasTgas, deposit);
  }

  async isSettled(ref: WriteRef): Promise<boolean> {
    const signer = ref.receiverId ? this.signers.get(ref.receiverId) : undefined;
    if (!signer) return true; // no key for it: nothing of ours can be pending there
    return signer.isSettled({ txHash: ref.txHash, nonce: ref.nonce });
  }

  private async send(receiverId: string, methodName: string, args: object, gasTgas: number, deposit: bigint): Promise<{ txHash: string; returnValue: unknown }> {
    const signer = this.signers.get(receiverId);
    if (!signer) throw new ChainError(`no agent function-call key for ${receiverId}; refusing ${methodName}`, null);
    const sentAtMs = this.nowMs();
    try {
      const r = await signer.signAndSend({
        receiverId,
        methodName,
        args,
        gas: BigInt(gasTgas) * TGAS,
        ...(deposit > 0n ? { deposit } : {}),
      });
      return { txHash: r.txHash, returnValue: r.outcome.returnValue };
    } catch (err) {
      if (err instanceof TxPanicError)
        // Executed on chain: keep the hash as evidence (ambiguous = false, so it is never held).
        throw new ChainError(err.message, err.code ?? extractErrorCode(err.message, parseErrorCode), false, {
          method: methodName,
          receiverId,
          txHash: err.ref.txHash,
          nonce: err.ref.nonce,
          sentAtMs,
        });
      if (err instanceof TxRejectedError) throw new ChainError(err.message, null, false);
      if (err instanceof AmbiguousTxError)
        throw new ChainError(err.message, null, true, { method: methodName, receiverId, txHash: err.ref.txHash, nonce: err.ref.nonce, sentAtMs });
      // Anything else happened before a transaction existed (key lookup, signing, block hash).
      throw new ChainError(err instanceof Error ? err.message : String(err), null, false);
    }
  }
}

const deploymentsKeysSchema = z.object({
  function_call_keys: z
    .array(z.object({ account: z.string(), public_key: z.string(), receiver_id: z.string(), method_names: z.array(z.string()) }))
    .default([]),
});

export interface SignerResolution {
  assetId: string;
  source: "env" | "keychain" | "none";
  publicKey: string | null;
  detail: string;
}

export interface ResolveAgentSignersInput {
  agentAccount: string;
  assets: ReadonlyArray<{ assetId: string; alias: string }>;
  /** deployments/testnet.json (public record of function-call keys; no secrets). */
  deploymentsPath: string | null;
  env: NodeJS.ProcessEnv;
  keychainDir?: string;
  signerOptions?: SignerOptions;
  /** Injection point for tests. */
  make?: {
    fromEnv: (account: string, envVar: string) => SignerLike;
    fromKeychain: (account: string, publicKey: string) => SignerLike;
  };
}

/**
 * Per asset: env `AGENT_KEY_<ALIAS>` (private key) → the keychain key that deployments lists as
 * the agent's function-call key for that asset → none (writes for that asset are refused).
 */
export function resolveAgentSigners(input: ResolveAgentSignersInput): { signers: Map<string, SignerLike>; report: SignerResolution[] } {
  const make = input.make ?? {
    fromEnv: (a: string, v: string) => NearSigner.fromEnv(a, v, input.signerOptions),
    fromKeychain: (a: string, pk: string) =>
      NearSigner.fromKeychain(a, { publicKey: pk, ...(input.keychainDir ? { dir: input.keychainDir } : {}) }, input.signerOptions),
  };
  let keys: z.infer<typeof deploymentsKeysSchema>["function_call_keys"] = [];
  if (input.deploymentsPath) {
    try {
      keys = deploymentsKeysSchema.parse(JSON.parse(readFileSync(input.deploymentsPath, "utf8"))).function_call_keys;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
  const signers = new Map<string, SignerLike>();
  const report: SignerResolution[] = [];
  for (const a of input.assets) {
    const envVar = `AGENT_KEY_${a.alias}`;
    if (input.env[envVar]) {
      const s = make.fromEnv(input.agentAccount, envVar);
      signers.set(a.assetId, s);
      report.push({ assetId: a.assetId, source: "env", publicKey: s.publicKey, detail: envVar });
      continue;
    }
    const listed = keys.find((k) => k.account === input.agentAccount && k.receiver_id === a.assetId);
    if (!listed) {
      report.push({ assetId: a.assetId, source: "none", publicKey: null, detail: `no ${envVar} and no agent function-call key in deployments` });
      continue;
    }
    try {
      const s = make.fromKeychain(input.agentAccount, listed.public_key);
      signers.set(a.assetId, s);
      report.push({ assetId: a.assetId, source: "keychain", publicKey: listed.public_key, detail: `methods: ${listed.method_names.join(",")}` });
    } catch (err) {
      report.push({ assetId: a.assetId, source: "none", publicKey: listed.public_key, detail: `keychain: ${(err as Error).message}` });
    }
  }
  return { signers, report };
}
