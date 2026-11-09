import { readFileSync } from "node:fs";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base64 } from "@scure/base";
import { serialize } from "borsh";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/http/server.js";
import { FakeChainClient } from "../src/chain/fake.js";
import { NEP413_TAG, nep413Hash, parsePublicKey, serializeNep413, verifyNep413Signature } from "../src/nep413/payload.js";
import { ISSUE_ORDER, MEMBER_SEED, STRANGER_SEED, VECTOR_ENV, buildVectors, nonceFor, type VectorCase } from "./nep413-cases.js";
import { FIXTURES, makeHarness, type Harness } from "./helpers/harness.js";

const fixture = JSON.parse(readFileSync(`${FIXTURES}nep413-vectors.json`, "utf8")) as ReturnType<typeof buildVectors>;
const byName = (n: string): VectorCase => {
  const c = fixture.cases.find((x) => x.name === n);
  if (!c) throw new Error(`no vector ${n}`);
  return c;
};
const payloadOf = (c: VectorCase, recipient = c.signed_recipient) => ({
  message: c.message,
  nonce: base64.decode(c.nonce_b64),
  recipient,
  callbackUrl: null,
});

describe("NEP-413 payload and signature (fixed vectors)", () => {
  it("committed vectors are reproduced bit-for-bit from the fixed seeds", () => {
    expect(JSON.parse(JSON.stringify(buildVectors()))).toEqual(fixture);
  });

  it("tag is 2^31 + 413 as little-endian u32 prefix", () => {
    expect(NEP413_TAG).toBe(2147484061);
    const bytes = serializeNep413(payloadOf(byName("valid")));
    expect(Buffer.from(bytes.slice(0, 4)).toString("hex")).toBe("9d010080");
  });

  it("payload borsh matches the independent borsh-js serializer", () => {
    const schema = {
      struct: {
        message: "string",
        nonce: { array: { type: "u8", len: 32 } },
        recipient: "string",
        callbackUrl: { option: "string" },
      },
    } as const;
    for (const c of fixture.cases) {
      const ref = serialize(schema, {
        message: c.message,
        nonce: Array.from(base64.decode(c.nonce_b64)),
        recipient: c.signed_recipient,
        callbackUrl: null,
      });
      const ours = serializeNep413(payloadOf(c));
      expect(Buffer.from(ours.slice(4)).toString("hex")).toBe(Buffer.from(ref).toString("hex"));
      expect(Buffer.from(ours).toString("hex")).toBe(c.payload_borsh_hex);
    }
  });

  it("callbackUrl Some(..) is encoded as 1 + borsh string", () => {
    const p = { ...payloadOf(byName("valid")), callbackUrl: "https://x.y/cb" };
    const ref = serialize(
      { struct: { message: "string", nonce: { array: { type: "u8", len: 32 } }, recipient: "string", callbackUrl: { option: "string" } } },
      { ...p, nonce: Array.from(p.nonce) },
    );
    expect(Buffer.from(serializeNep413(p).slice(4)).toString("hex")).toBe(Buffer.from(ref).toString("hex"));
  });

  it("signatures verify with an independent ed25519 implementation (noble) over sha256(tag||payload)", () => {
    expect(ed25519.getPublicKey(MEMBER_SEED)).toEqual(parsePublicKey(byName("valid").public_key).bytes);
    expect(ed25519.getPublicKey(STRANGER_SEED)).toEqual(parsePublicKey(byName("key_not_on_account").public_key).bytes);
    for (const c of fixture.cases) {
      const hash = nep413Hash(payloadOf(c));
      expect(Buffer.from(hash).toString("hex")).toBe(c.payload_sha256_hex);
      expect(ed25519.verify(base64.decode(c.signature_b64), hash, parsePublicKey(c.public_key).bytes)).toBe(true);
      expect(verifyNep413Signature(payloadOf(c), c.public_key, c.signature_b64)).toBe(true);
    }
  });

  it("rejects tampered signature, message, nonce and the wrong recipient", () => {
    const c = byName("valid");
    const sig = base64.decode(c.signature_b64);
    sig[0] = (sig[0] ?? 0) ^ 1;
    expect(verifyNep413Signature(payloadOf(c), c.public_key, base64.encode(sig))).toBe(false);
    expect(verifyNep413Signature({ ...payloadOf(c), message: c.message + " " }, c.public_key, c.signature_b64)).toBe(false);
    expect(verifyNep413Signature({ ...payloadOf(c), nonce: new Uint8Array(32) }, c.public_key, c.signature_b64)).toBe(false);
    const wr = byName("wrong_recipient");
    expect(verifyNep413Signature(payloadOf(wr, fixture.env.recipient as string), wr.public_key, wr.signature_b64)).toBe(false);
    expect(verifyNep413Signature(payloadOf(c), "secp256k1:abc", c.signature_b64)).toBe(false);
    expect(verifyNep413Signature(payloadOf(c), c.public_key, "not-base64!")).toBe(false);
  });
});

describe("POST /access: the five checks against fixed vectors", () => {
  let h: Harness;
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    h = await makeHarness({ chain: new FakeChainClient(VECTOR_ENV.chainTimeNs) });
    h.chain.addAccessKey(VECTOR_ENV.accountId, byName("valid").public_key, { kind: "full_access" });
    // stranger key deliberately NOT added: view_access_key returns null.
    h.chain.addReservation(VECTOR_ENV.assetId, {
      id: VECTOR_ENV.reservationId,
      holder: VECTOR_ENV.accountId,
      status: "Confirmed",
      windowStart: VECTOR_ENV.chainTimeNs - 60_000_000_000n,
      windowEnd: VECTOR_ENV.chainTimeNs + 900_000_000_000n,
    });
    for (const n of ISSUE_ORDER) h.nonces.push(nonceFor(n));
    app = await buildServer(h.bridge);
  });
  afterEach(async () => {
    await app.close();
    await h.bridge.stop();
  });

  const challenge = async () => {
    const res = await app.inject({
      method: "POST",
      url: "/access/challenge",
      payload: { asset_id: VECTOR_ENV.assetId, reservation_id: "7", account_id: VECTOR_ENV.accountId },
    });
    expect(res.statusCode).toBe(200);
    return res.json<{ nonce: string; message: string; recipient: string }>();
  };
  const submit = (c: VectorCase, extra: Record<string, unknown> = {}) =>
    app.inject({
      method: "POST",
      url: "/access",
      payload: {
        asset_id: VECTOR_ENV.assetId,
        reservation_id: "7",
        account_id: c.account_id,
        public_key: c.public_key,
        signature: c.signature_b64,
        nonce: c.nonce_b64,
        message: c.message,
        ...extra,
      },
    });

  it("issues exactly the vector challenges (nonce, message, recipient)", async () => {
    for (const n of ISSUE_ORDER) {
      const ch = await challenge();
      expect(ch.nonce).toBe(byName(n).nonce_b64);
      expect(ch.message).toBe(byName(n).message);
      expect(ch.recipient).toBe(fixture.env.recipient);
    }
  });

  it("valid -> 200 and a session; replay -> NONCE_USED; wrong recipient; expired; key not on account", async () => {
    for (let i = 0; i < ISSUE_ORDER.length; i++) await challenge();

    const ok = await submit(byName("valid"));
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ ok: true, key_permission: "full_access", resumed: false });

    const replay = await submit(byName("reused_nonce"));
    expect(replay.statusCode).toBe(403);
    expect(replay.json()).toMatchObject({ ok: false, reason: "NONCE_USED" });

    const wr = byName("wrong_recipient");
    const wrong = await submit(wr, { recipient: wr.signed_recipient });
    expect(wrong.json()).toMatchObject({ ok: false, reason: "RECIPIENT_MISMATCH" });

    const stranger = await submit(byName("key_not_on_account"));
    expect(stranger.statusCode).toBe(403);
    expect(stranger.json()).toMatchObject({ ok: false, reason: "KEY_NOT_ON_ACCOUNT" });

    h.chain.setTime(VECTOR_ENV.chainTimeNs + BigInt(byName("expired").submit_offset_ns));
    const expired = await submit(byName("expired"));
    expect(expired.statusCode).toBe(403);
    expect(expired.json()).toMatchObject({ ok: false, reason: "NONCE_EXPIRED" });

    const rejected = h.bridge.bus.history().filter((e) => e.type === "access_rejected").map((e) => e.data.reason);
    expect(rejected).toEqual(["NONCE_USED", "RECIPIENT_MISMATCH", "KEY_NOT_ON_ACCOUNT", "NONCE_EXPIRED"]);
  });

  it("wrong recipient without the optional recipient field fails the signature check", async () => {
    await challenge();
    await challenge();
    const res = await submit(byName("wrong_recipient"));
    expect(res.json()).toMatchObject({ ok: false, reason: "BAD_SIGNATURE" });
  });

  it("check 5: can_access=false is a 403 with the contract's reason (no reservation -> no use)", async () => {
    h.chain.addReservation(VECTOR_ENV.assetId, {
      id: VECTOR_ENV.reservationId,
      holder: "bob.testnet",
      status: "Confirmed",
      windowStart: 0n,
      windowEnd: VECTOR_ENV.chainTimeNs * 2n,
    });
    await challenge();
    const res = await submit(byName("valid"));
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ reason: "RESERVATION_NOT_ACCESSIBLE", detail: "account is not the reservation holder" });
    expect(h.chain.calls).toHaveLength(0);
  });

  it("unknown nonce and edited message are rejected", async () => {
    const unknown = await submit(byName("valid"));
    expect(unknown.json()).toMatchObject({ reason: "NONCE_UNKNOWN" });
    await challenge();
    const edited = await submit(byName("valid"), { message: byName("valid").message.replace("7", "8") });
    expect(edited.json()).toMatchObject({ reason: "MESSAGE_MISMATCH" });
  });

  it("function-call keys are accepted and recorded", async () => {
    h.chain.addAccessKey(VECTOR_ENV.accountId, byName("valid").public_key, {
      kind: "function_call",
      receiverId: VECTOR_ENV.assetId,
      methodNames: [],
    });
    await challenge();
    const res = await submit(byName("valid"));
    expect(res.json()).toMatchObject({ ok: true, key_permission: "function_call" });
  });
});
