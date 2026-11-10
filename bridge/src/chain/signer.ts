import { readFile } from "node:fs/promises";
import { AmbiguousTxError, NearSigner, TGAS, TxPanicError, TxRejectedError, type SignerOptions } from "@commonkit/sdk/signer";
import { z } from "zod";
import type { LocalClock } from "../util/clock.js";
import { ChainError, extractErrorCode, type TxOutcome } from "./types.js";
import type { TxSigner } from "./near.js";

/** The part of NearSigner the bridge uses (mockable). */
export type SignerLike = Pick<NearSigner, "accountId" | "publicKey" | "signAndSend" | "isSettled">;

export interface SignerAdapterOptions {
  clock: LocalClock;
  /** How long to wait for an ambiguous tx to settle before giving up (ms). */
  settleTimeoutMs?: number;
  settlePollMs?: number;
}

/**
 * Thin TxSigner over @commonkit/sdk/signer (D-707). Maps its errors onto ChainError kinds so the
 * bridge's retry rules hold:
 *   TxPanicError    -> kind "panic"      (executed and failed; never retried)
 *   TxRejectedError -> kind "rejected"   (not applied; safe to retry)
 *   AmbiguousTxError-> wait until isSettled, then kind "ambiguous" (callers re-read state before
 *                      any resend; if it never settles we still refuse to resend blindly)
 */
export class NearSignerTxSigner implements TxSigner {
  constructor(
    private readonly signer: SignerLike,
    private readonly opts: SignerAdapterOptions,
  ) {}

  get publicKey(): string {
    return this.signer.publicKey;
  }

  async functionCall(receiverId: string, methodName: string, args: object, gasTgas: number): Promise<TxOutcome> {
    try {
      const r = await this.signer.signAndSend({ receiverId, methodName, args, gas: BigInt(gasTgas) * TGAS });
      return { txHash: r.txHash };
    } catch (err) {
      if (err instanceof TxPanicError) {
        throw new ChainError(err.message, err.code ?? extractErrorCode(err.message, () => null), "panic", err.ref.txHash);
      }
      if (err instanceof TxRejectedError) throw new ChainError(err.message, null, "rejected", err.ref.txHash);
      if (err instanceof AmbiguousTxError) {
        const settled = await this.waitSettled(err.ref.txHash, err.ref.nonce);
        throw new ChainError(
          `${err.message}; ${settled ? "now settled: re-read state before any resend" : "still unsettled"}`,
          null,
          settled ? "ambiguous_settled" : "ambiguous",
          err.ref.txHash,
        );
      }
      throw new ChainError((err as Error).message, null, "rpc", null);
    }
  }

  private async waitSettled(txHash: string, nonce: bigint): Promise<boolean> {
    const deadline = this.opts.clock.now() + (this.opts.settleTimeoutMs ?? 60_000);
    while (this.opts.clock.now() < deadline) {
      if (await this.signer.isSettled({ txHash, nonce }).catch(() => false)) return true;
      await this.opts.clock.sleep(this.opts.settlePollMs ?? 2_000);
    }
    return false;
  }
}

const deploymentsSchema = z.object({
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

export interface ResolveSignersInput {
  bridgeAccount: string;
  assets: Array<{ asset_id: string; signer_env?: string | undefined }>;
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
 * One function-call key per (bridge, asset) — a NEAR function-call key is bound to one receiver.
 * Order: asset `signer_env` (env var with the private key) -> keychain key listed in
 * deployments/testnet.json for (bridge, asset) -> none (writes for that asset are refused).
 */
export async function resolveSigners(input: ResolveSignersInput): Promise<{
  signers: Map<string, SignerLike>;
  report: SignerResolution[];
}> {
  const make = input.make ?? {
    fromEnv: (a: string, v: string) => NearSigner.fromEnv(a, v, input.signerOptions),
    fromKeychain: (a: string, pk: string) =>
      NearSigner.fromKeychain(a, { publicKey: pk, ...(input.keychainDir ? { dir: input.keychainDir } : {}) }, input.signerOptions),
  };
  let keys: z.infer<typeof deploymentsSchema>["function_call_keys"] = [];
  if (input.deploymentsPath) {
    try {
      keys = deploymentsSchema.parse(JSON.parse(await readFile(input.deploymentsPath, "utf8"))).function_call_keys;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
  const signers = new Map<string, SignerLike>();
  const report: SignerResolution[] = [];
  for (const a of input.assets) {
    const envVar = a.signer_env;
    if (envVar && input.env[envVar]) {
      const s = make.fromEnv(input.bridgeAccount, envVar);
      signers.set(a.asset_id, s);
      report.push({ assetId: a.asset_id, source: "env", publicKey: s.publicKey, detail: envVar });
      continue;
    }
    const listed = keys.find((k) => k.account === input.bridgeAccount && k.receiver_id === a.asset_id);
    if (listed) {
      try {
        const s = make.fromKeychain(input.bridgeAccount, listed.public_key);
        signers.set(a.asset_id, s);
        report.push({ assetId: a.asset_id, source: "keychain", publicKey: listed.public_key, detail: "deployments function_call_keys" });
        continue;
      } catch (err) {
        report.push({ assetId: a.asset_id, source: "none", publicKey: listed.public_key, detail: `keychain: ${(err as Error).message}` });
        continue;
      }
    }
    report.push({ assetId: a.asset_id, source: "none", publicKey: null, detail: "no signer_env value and no function-call key in deployments" });
  }
  return { signers, report };
}
