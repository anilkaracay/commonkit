/** Every rejection the HTTP API returns; `reason` is a stable machine code. */
export type RejectReason =
  | "BAD_REQUEST"
  | "UNKNOWN_ASSET"
  | "NONCE_UNKNOWN"
  | "NONCE_USED"
  | "NONCE_EXPIRED"
  | "ACTION_MISMATCH"
  | "RECIPIENT_MISMATCH"
  | "MESSAGE_MISMATCH"
  | "REQUEST_MISMATCH"
  | "UNSUPPORTED_KEY_TYPE"
  | "BAD_SIGNATURE"
  | "KEY_NOT_ON_ACCOUNT"
  | "RESERVATION_NOT_ACCESSIBLE"
  | "OUT_OF_SERVICE"
  | "CHAIN_UNAVAILABLE"
  | "CHAIN_WRITE_FAILED"
  | "DEVICE_BUSY"
  | "DEVICE_OFFLINE"
  | "DEVICE_ERROR"
  | "SESSION_NOT_FOUND"
  | "NOT_SESSION_HOLDER"
  | "TASK_NOT_FOUND"
  | "TASK_NOT_SUBMITTED"
  | "NOT_TASK_CLAIMER"
  | "ALREADY_VERIFIED"
  | "NO_VERIFICATION_TEST"
  | "RUN_NOT_FOUND"
  | "TOO_MANY_CHALLENGES";

export class BridgeError extends Error {
  constructor(
    readonly status: number,
    readonly reason: RejectReason,
    readonly detail: string,
  ) {
    super(`${reason}: ${detail}`);
    this.name = "BridgeError";
  }
}
