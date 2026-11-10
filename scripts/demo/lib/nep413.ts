/**
 * NEP-413 signing for demo members (the wallet's `signMessage`, done with the member's keychain
 * key). Same byte layout as bridge/src/nep413/payload.ts and checked against its test vectors:
 *   sha256( u32le(2^31 + 413) ++ borsh{message, nonce[32], recipient, callbackUrl?} ) → ed25519.
 * The private key is read from the keychain into memory only; nothing here prints it.
 */
import { createHash } from 'node:crypto';
import { KeyPair, type KeyPairString } from 'near-api-js';
import { readKeychainKey } from '@commonkit/sdk/signer';

export const NEP413_TAG = 2 ** 31 + 413;

export interface Nep413Payload {
  message: string;
  nonce: Uint8Array;
  recipient: string;
  callbackUrl?: string | null;
}

const u32le = (n: number): Buffer => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const borshString = (s: string): Buffer => {
  const bytes = Buffer.from(s, 'utf8');
  return Buffer.concat([u32le(bytes.length), bytes]);
};

export function serializeNep413(p: Nep413Payload): Buffer {
  if (p.nonce.length !== 32) throw new Error('NEP-413 nonce must be 32 bytes');
  const cb =
    p.callbackUrl === undefined || p.callbackUrl === null
      ? Buffer.from([0])
      : Buffer.concat([Buffer.from([1]), borshString(p.callbackUrl)]);
  return Buffer.concat([
    u32le(NEP413_TAG),
    borshString(p.message),
    Buffer.from(p.nonce),
    borshString(p.recipient),
    cb,
  ]);
}

export const nep413Hash = (p: Nep413Payload): Buffer =>
  createHash('sha256').update(serializeNep413(p)).digest();

/** Sign with an `ed25519:<base58 secret>` key; returns the wallet-style output. */
export function signNep413(
  p: Nep413Payload,
  privateKey: KeyPairString,
): { publicKey: string; signature: string } {
  const kp = KeyPair.fromString(privateKey);
  const { signature } = kp.sign(nep413Hash(p));
  return {
    publicKey: kp.getPublicKey().toString(),
    signature: Buffer.from(signature).toString('base64'),
  };
}

/** A member's NEP-413 signer backed by their primary (full-access) keychain key (D-019). */
export function keychainNep413Signer(
  accountId: string,
  dir?: string,
): (p: Nep413Payload) => { publicKey: string; signature: string } {
  const key = readKeychainKey(accountId, dir ? { dir } : {});
  return (p) => signNep413(p, key);
}
