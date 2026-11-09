import { base64 } from "@scure/base";
import type { FastifyInstance } from "fastify";
import { expect } from "vitest";
import { nep413SignWithSeed } from "../../src/nep413/payload.js";

/** Plays the member's wallet: gets a challenge, signs it per NEP-413, posts the signed request. */
export async function signedPost(
  app: FastifyInstance,
  url: string,
  challenge: Record<string, unknown>,
  seed: Uint8Array,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const ch = await app.inject({ method: "POST", url: "/access/challenge", payload: challenge });
  expect(ch.statusCode, ch.body).toBe(200);
  const c = ch.json<{ nonce: string; message: string; recipient: string }>();
  const { publicKey, signature } = nep413SignWithSeed(
    { message: c.message, nonce: base64.decode(c.nonce), recipient: c.recipient, callbackUrl: null },
    seed,
  );
  const res = await app.inject({
    method: "POST",
    url,
    payload: { ...challenge, action: undefined, public_key: publicKey, signature, nonce: c.nonce, message: c.message, recipient: c.recipient },
  });
  return { statusCode: res.statusCode, body: res.json<Record<string, unknown>>() };
}

export function publicKeyOf(seed: Uint8Array): string {
  return nep413SignWithSeed({ message: "x", nonce: new Uint8Array(32), recipient: "x", callbackUrl: null }, seed).publicKey;
}
