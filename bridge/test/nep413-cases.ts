import { createHash } from "node:crypto";
import { base64 } from "@scure/base";
import { buildChallengeMessage, recipientFor } from "../src/nep413/challenge.js";
import { nep413Hash, nep413SignWithSeed, serializeNep413 } from "../src/nep413/payload.js";

/**
 * Deterministic NEP-413 test vectors (BRIDGE §3.1). Everything derives from fixed strings,
 * so `pnpm --filter @commonkit/bridge gen:vectors` always writes the same file.
 */
export const VECTOR_ENV = {
  bridgeAccount: "bridge-01.makerlab.testnet",
  assetId: "washer-01.dorm-b.testnet",
  accountId: "alice.testnet",
  reservationId: 7n,
  chainTimeNs: 1_800_000_000_000_000_000n,
  ttlSec: 300,
};

const sha = (s: string) => new Uint8Array(createHash("sha256").update(s).digest());
export const MEMBER_SEED = sha("commonkit/nep413/test-vector/member/v1");
export const STRANGER_SEED = sha("commonkit/nep413/test-vector/stranger/v1");
export const nonceFor = (name: string) => sha(`commonkit/nep413/test-vector/nonce/${name}`);

export type ExpectedReason = "ok" | "RECIPIENT_MISMATCH" | "NONCE_USED" | "NONCE_EXPIRED" | "KEY_NOT_ON_ACCOUNT";

export interface VectorCase {
  name: string;
  description: string;
  account_id: string;
  public_key: string;
  /** Recipient the wallet signed for. */
  signed_recipient: string;
  nonce_b64: string;
  message: string;
  callback_url: null;
  payload_borsh_hex: string;
  payload_sha256_hex: string;
  signature_b64: string;
  /** Chain time offset (ns) from issuance at which the request is submitted. */
  submit_offset_ns: string;
  /** For reused_nonce: the case whose nonce/signature is replayed. */
  replay_of: string | null;
  expect: ExpectedReason;
}

interface Spec {
  name: string;
  description: string;
  seed: Uint8Array;
  recipient?: string;
  offsetNs?: bigint;
  replayOf?: string;
  expect: ExpectedReason;
}

const specs: Spec[] = [
  { name: "valid", description: "member key on account, our recipient, fresh nonce", seed: MEMBER_SEED, expect: "ok" },
  {
    name: "wrong_recipient",
    description: "wallet signed for another recipient",
    seed: MEMBER_SEED,
    recipient: recipientFor("evil.testnet"),
    expect: "RECIPIENT_MISMATCH",
  },
  { name: "reused_nonce", description: "the valid request replayed", seed: MEMBER_SEED, replayOf: "valid", expect: "NONCE_USED" },
  {
    name: "expired",
    description: "valid signature submitted 1 ns after the 5 min challenge expiry (chain time)",
    seed: MEMBER_SEED,
    offsetNs: BigInt(VECTOR_ENV.ttlSec) * 1_000_000_000n + 1n,
    expect: "NONCE_EXPIRED",
  },
  {
    name: "key_not_on_account",
    description: "valid signature by a key that view_access_key does not find on the account",
    seed: STRANGER_SEED,
    expect: "KEY_NOT_ON_ACCOUNT",
  },
];

/** Nonce names in the order the challenge store issues them during the test. */
export const ISSUE_ORDER = ["valid", "wrong_recipient", "expired", "key_not_on_account"];

export function buildVectors(): { env: Record<string, string | number>; cases: VectorCase[] } {
  const ours = recipientFor(VECTOR_ENV.bridgeAccount);
  const built = new Map<string, VectorCase>();
  for (const s of specs) {
    if (s.replayOf) {
      const src = built.get(s.replayOf);
      if (!src) throw new Error(`replay source ${s.replayOf} missing`);
      built.set(s.name, { ...src, name: s.name, description: s.description, replay_of: s.replayOf, expect: s.expect });
      continue;
    }
    const nonce = nonceFor(s.name);
    const nonceB64 = base64.encode(nonce);
    const message = buildChallengeMessage({
      action: "access",
      assetId: VECTOR_ENV.assetId,
      accountId: VECTOR_ENV.accountId,
      reservationId: VECTOR_ENV.reservationId,
      nonce: nonceB64,
      recipient: ours,
      issuedAtNs: VECTOR_ENV.chainTimeNs,
      expiresAtNs: VECTOR_ENV.chainTimeNs + BigInt(VECTOR_ENV.ttlSec) * 1_000_000_000n,
    });
    const recipient = s.recipient ?? ours;
    const payload = { message, nonce, recipient, callbackUrl: null };
    const { publicKey, signature } = nep413SignWithSeed(payload, s.seed);
    built.set(s.name, {
      name: s.name,
      description: s.description,
      account_id: VECTOR_ENV.accountId,
      public_key: publicKey,
      signed_recipient: recipient,
      nonce_b64: nonceB64,
      message,
      callback_url: null,
      payload_borsh_hex: Buffer.from(serializeNep413(payload)).toString("hex"),
      payload_sha256_hex: Buffer.from(nep413Hash(payload)).toString("hex"),
      signature_b64: signature,
      submit_offset_ns: (s.offsetNs ?? 0n).toString(),
      replay_of: null,
      expect: s.expect,
    });
  }
  return {
    env: {
      bridge_account: VECTOR_ENV.bridgeAccount,
      recipient: ours,
      asset_id: VECTOR_ENV.assetId,
      reservation_id: VECTOR_ENV.reservationId.toString(),
      chain_time_ns: VECTOR_ENV.chainTimeNs.toString(),
      ttl_sec: VECTOR_ENV.ttlSec,
      member_seed_hex: Buffer.from(MEMBER_SEED).toString("hex"),
      stranger_seed_hex: Buffer.from(STRANGER_SEED).toString("hex"),
      tag: 2147484061,
    },
    cases: [...built.values()],
  };
}
