import { base64 } from "@scure/base";
import { z } from "zod";
import type { ChainClock } from "../chain/clock.js";
import type { AccessKeyPermission, ChainClient } from "../chain/types.js";
import { BridgeError, type RejectReason } from "../errors.js";
import type { EventBus } from "../events/bus.js";
import type { Challenge, ChallengeAction, ChallengeStore } from "../nep413/challenge.js";
import { parsePublicKey, verifyNep413Signature } from "../nep413/payload.js";
import { accountIdSchema, u64Schema } from "../util/near.js";

/** Body of every NEP-413-signed request (/access, /sessions/:id/finish, /verification/...). */
export const signedRequestSchema = z.object({
  asset_id: accountIdSchema,
  account_id: accountIdSchema,
  reservation_id: u64Schema.optional(),
  task_id: u64Schema.optional(),
  public_key: z.string().min(10).max(128),
  /** base64 of the 64-byte ed25519 signature, as returned by wallet signMessage. */
  signature: z.string().min(1).max(256),
  /** base64 of the 32-byte nonce issued by /access/challenge. */
  nonce: z.string().min(1).max(64),
  message: z.string().min(1).max(2000),
  /** Optional: recipient the wallet was asked to sign for (reported precisely if wrong). */
  recipient: z.string().max(200).optional(),
  callback_url: z.string().max(500).optional(),
});
export type SignedRequest = z.infer<typeof signedRequestSchema>;

export interface VerifiedRequest {
  challenge: Challenge;
  keyPermission: AccessKeyPermission;
}

/**
 * BRIDGE_AND_ADAPTERS §3.1. Checks 1-4 for every signed request; check 5 (can_access) for "access".
 * Every rejection is emitted as an `access_rejected` event (demo evidence) and thrown as 403.
 */
export class AccessVerifier {
  constructor(
    private readonly challenges: ChallengeStore,
    private readonly chain: ChainClient,
    private readonly clock: ChainClock,
    private readonly bus: EventBus,
    private readonly isSimulated: (assetId: string) => boolean,
  ) {}

  async verify(req: SignedRequest, action: ChallengeAction): Promise<VerifiedRequest> {
    const now = await this.chainNow();
    const reject = (reason: RejectReason, detail: string, status = 403): never => {
      this.bus.emit({
        type: "access_rejected",
        assetId: req.asset_id,
        simulated: this.isSimulated(req.asset_id),
        chainNs: now,
        level: "warn",
        data: {
          action,
          reason,
          detail,
          account_id: req.account_id,
          reservation_id: req.reservation_id ?? null,
          task_id: req.task_id ?? null,
          nonce: req.nonce,
        },
      });
      throw new BridgeError(status, reason, detail);
    };

    // 1. nonce issued, unused, not expired (chain time); marked used now.
    const consumed = this.challenges.consume(req.nonce, now);
    if (!consumed.ok) return reject(consumed.reason, describeNonce(consumed.reason));
    const c = consumed.challenge;

    // 2. recipient and message are exactly what we issued, for this request.
    if (c.action !== action) return reject("ACTION_MISMATCH", `challenge was issued for "${c.action}"`);
    if (req.recipient !== undefined && req.recipient !== c.recipient) {
      return reject("RECIPIENT_MISMATCH", `recipient must be "${c.recipient}"`);
    }
    if (req.message !== c.message) return reject("MESSAGE_MISMATCH", "message differs from the issued challenge");
    if (
      req.asset_id !== c.assetId ||
      req.account_id !== c.accountId ||
      req.reservation_id !== c.reservationId ||
      req.task_id !== c.taskId
    ) {
      return reject("REQUEST_MISMATCH", "asset, account, reservation or task differs from the challenge");
    }

    // 3. signature over the NEP-413 payload.
    try {
      parsePublicKey(req.public_key);
    } catch (err) {
      return reject("UNSUPPORTED_KEY_TYPE", (err as Error).message);
    }
    const ok = verifyNep413Signature(
      { message: c.message, nonce: base64.decode(c.nonce), recipient: c.recipient, callbackUrl: req.callback_url ?? null },
      req.public_key,
      req.signature,
    );
    if (!ok) return reject("BAD_SIGNATURE", "signature does not verify for the NEP-413 payload");

    // 4. the key currently belongs to the account (full-access or function-call; recorded).
    let permission: AccessKeyPermission | null;
    try {
      permission = await this.chain.viewAccessKey(req.account_id, req.public_key);
    } catch (err) {
      return reject("CHAIN_UNAVAILABLE", `view_access_key failed: ${(err as Error).message}`, 503);
    }
    if (!permission) return reject("KEY_NOT_ON_ACCOUNT", `${req.public_key} is not an access key of ${req.account_id}`);

    // 5. the asset contract agrees (access only; finish/verify have their own ownership checks).
    if (action === "access") {
      if (c.reservationId === undefined) return reject("BAD_REQUEST", "reservation_id is required");
      let check;
      try {
        check = await this.chain.canAccess(c.assetId, c.accountId, c.reservationId);
      } catch (err) {
        return reject("CHAIN_UNAVAILABLE", `can_access failed: ${(err as Error).message}`, 503);
      }
      if (!check.ok) return reject("RESERVATION_NOT_ACCESSIBLE", check.reason ?? "can_access returned ok=false");
    }

    return { challenge: c, keyPermission: permission };
  }

  private async chainNow(): Promise<bigint> {
    try {
      return await this.clock.now();
    } catch (err) {
      throw new BridgeError(503, "CHAIN_UNAVAILABLE", `cannot read chain time: ${(err as Error).message}`);
    }
  }
}

function describeNonce(r: "NONCE_UNKNOWN" | "NONCE_USED" | "NONCE_EXPIRED"): string {
  switch (r) {
    case "NONCE_UNKNOWN":
      return "nonce was not issued by this bridge (or the bridge restarted)";
    case "NONCE_USED":
      return "nonce was already used";
    case "NONCE_EXPIRED":
      return "challenge expired (chain time)";
  }
}
