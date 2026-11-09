import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { base58, base64 } from "@scure/base";

/**
 * NEP-413 (https://github.com/near/NEPs/blob/master/neps/nep-0413.md):
 *   hash = sha256( borsh_u32(2^31 + 413) ++ borsh(Payload{message, nonce[32], recipient, callbackUrl?}) )
 *   signature = ed25519_sign(hash)   -- the 32-byte hash is the signed message
 * Output: publicKey "ed25519:<base58>", signature base64.
 */
export const NEP413_TAG = 2 ** 31 + 413; // 2147484061

export interface Nep413Payload {
  message: string;
  nonce: Uint8Array; // exactly 32 bytes
  recipient: string;
  callbackUrl?: string | null;
}

function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

function borshString(s: string): Uint8Array {
  const bytes = new TextEncoder().encode(s);
  return concat(u32le(bytes.length), bytes);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Borsh bytes of the tag followed by the payload struct (field order per the NEP). */
export function serializeNep413(p: Nep413Payload): Uint8Array {
  if (p.nonce.length !== 32) throw new Error("NEP-413 nonce must be 32 bytes");
  const callback =
    p.callbackUrl === undefined || p.callbackUrl === null
      ? new Uint8Array([0])
      : concat(new Uint8Array([1]), borshString(p.callbackUrl));
  return concat(u32le(NEP413_TAG), borshString(p.message), p.nonce, borshString(p.recipient), callback);
}

export function nep413Hash(p: Nep413Payload): Uint8Array {
  return new Uint8Array(createHash("sha256").update(serializeNep413(p)).digest());
}

export type ParsedPublicKey = { type: "ed25519"; bytes: Uint8Array };

/** Parses "ed25519:<base58>". Other key types (secp256k1) are not supported by the bridge. */
export function parsePublicKey(s: string): ParsedPublicKey {
  const [type, data] = s.split(":");
  if (type !== "ed25519" || !data) throw new Error("only ed25519 public keys are supported");
  const bytes = base58.decode(data);
  if (bytes.length !== 32) throw new Error("ed25519 public key must be 32 bytes");
  return { type, bytes };
}

export function formatPublicKey(bytes: Uint8Array): string {
  return `ed25519:${base58.encode(bytes)}`;
}

function ed25519PublicKeyObject(raw: Uint8Array): KeyObject {
  return createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(raw).toString("base64url") }, format: "jwk" });
}

/** Verifies a base64 NEP-413 signature over the payload with an ed25519 public key. */
export function verifyNep413Signature(p: Nep413Payload, publicKey: string, signatureB64: string): boolean {
  let key: ParsedPublicKey;
  let sig: Uint8Array;
  try {
    key = parsePublicKey(publicKey);
    sig = base64.decode(signatureB64);
  } catch {
    return false;
  }
  if (sig.length !== 64) return false;
  return verify(null, nep413Hash(p), ed25519PublicKeyObject(key.bytes), sig);
}

/** Test / tooling helper: deterministic signing from a 32-byte ed25519 seed. */
export function nep413SignWithSeed(p: Nep413Payload, seed: Uint8Array): { publicKey: string; signature: string } {
  if (seed.length !== 32) throw new Error("seed must be 32 bytes");
  const pkcs8 = concat(Buffer.from("302e020100300506032b657004220420", "hex"), seed);
  const priv = createPrivateKey({ key: Buffer.from(pkcs8), format: "der", type: "pkcs8" });
  const jwk = createPublicKey(priv).export({ format: "jwk" });
  if (typeof jwk.x !== "string") throw new Error("could not derive public key");
  const pub = new Uint8Array(Buffer.from(jwk.x, "base64url"));
  const signature = base64.encode(new Uint8Array(sign(null, nep413Hash(p), priv)));
  return { publicKey: formatPublicKey(pub), signature };
}
