import { randomBytes } from "node:crypto";
import { base64 } from "@scure/base";
import { NS_PER_SEC, nsToIso } from "../util/near.js";

export type ChallengeAction = "access" | "finish" | "verify";

export interface ChallengeRequest {
  action: ChallengeAction;
  assetId: string;
  accountId: string;
  reservationId?: bigint;
  taskId?: bigint;
}

export interface Challenge extends ChallengeRequest {
  nonce: string; // base64 of 32 bytes
  message: string;
  recipient: string;
  issuedAtNs: bigint;
  expiresAtNs: bigint;
  used: boolean;
}

export type ConsumeFailure = "NONCE_UNKNOWN" | "NONCE_USED" | "NONCE_EXPIRED";

export function recipientFor(bridgeAccount: string): string {
  return `commonkit-bridge:${bridgeAccount}`;
}

/** Human-readable message the member's wallet shows and signs. Contains asset, ids, nonce and expiry. */
export function buildChallengeMessage(c: Omit<Challenge, "message" | "used">): string {
  const lines = [
    "COMMONKIT bridge request",
    `action: ${c.action}`,
    `asset: ${c.assetId}`,
    `account: ${c.accountId}`,
  ];
  if (c.reservationId !== undefined) lines.push(`reservation: ${c.reservationId}`);
  if (c.taskId !== undefined) lines.push(`task: ${c.taskId}`);
  lines.push(`nonce: ${c.nonce}`, `expires_at: ${nsToIso(c.expiresAtNs)} (chain time)`);
  return lines.join("\n");
}

export interface ChallengeStoreOptions {
  recipient: string;
  ttlSec: number;
  maxOutstanding?: number;
  /** Injectable for deterministic test vectors. */
  random?: (n: number) => Uint8Array;
}

/**
 * Issued nonces live in memory only: a bridge restart invalidates every outstanding
 * challenge, which fails closed. Used nonces are kept until expiry so reuse is reported precisely.
 */
export class ChallengeStore {
  private readonly byNonce = new Map<string, Challenge>();
  private readonly ttlNs: bigint;
  private readonly max: number;
  private readonly random: (n: number) => Uint8Array;

  constructor(private readonly opts: ChallengeStoreOptions) {
    this.ttlNs = BigInt(opts.ttlSec) * NS_PER_SEC;
    this.max = opts.maxOutstanding ?? 10_000;
    this.random = opts.random ?? ((n) => new Uint8Array(randomBytes(n)));
  }

  issue(req: ChallengeRequest, chainNowNs: bigint): Challenge {
    this.prune(chainNowNs);
    if (this.byNonce.size >= this.max) throw new Error("too many outstanding challenges");
    const nonce = base64.encode(this.random(32));
    if (this.byNonce.has(nonce)) throw new Error("nonce collision");
    const base = {
      ...req,
      nonce,
      recipient: this.opts.recipient,
      issuedAtNs: chainNowNs,
      expiresAtNs: chainNowNs + this.ttlNs,
    };
    const challenge: Challenge = { ...base, message: buildChallengeMessage(base), used: false };
    this.byNonce.set(nonce, challenge);
    return challenge;
  }

  /** Check 1 of BRIDGE §3.1: issued, unused, not expired. Marks it used on success. */
  consume(nonce: string, chainNowNs: bigint): { ok: true; challenge: Challenge } | { ok: false; reason: ConsumeFailure } {
    const c = this.byNonce.get(nonce);
    if (!c) return { ok: false, reason: "NONCE_UNKNOWN" };
    if (c.used) return { ok: false, reason: "NONCE_USED" };
    if (chainNowNs > c.expiresAtNs) {
      c.used = true;
      return { ok: false, reason: "NONCE_EXPIRED" };
    }
    c.used = true;
    return { ok: true, challenge: c };
  }

  private prune(chainNowNs: bigint): void {
    for (const [k, c] of this.byNonce) if (chainNowNs > c.expiresAtNs) this.byNonce.delete(k);
  }
}
