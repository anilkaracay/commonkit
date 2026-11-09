/**
 * Every E_* code in docs/CONTRACT_SPEC.md §10 (ERROR_CODES in @commonkit/sdk) mapped to a plain
 * message. The Record type makes a missing code a compile error; errors.test.ts also checks the spec.
 */
import { type ErrorCode as SdkErrorCode } from '@commonkit/sdk';

/** Codes added to the spec after the sdk list was cut (D-301 era); drop once the sdk has them. */
type NewerCode = 'E_INVALID_ARGS' | 'E_NOT_FOUND';
export type ErrorCode = SdkErrorCode | NewerCode;

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  E_UNAUTHORIZED: 'Your account is not allowed to do this.',
  E_NOT_DAO: "Only the community's DAO can do this, through an approved proposal.",
  E_NOT_COMMONS: "Only the community's commons contract can call this.",
  E_NOT_BRIDGE: "Only this machine's bridge can report sessions and telemetry.",
  E_NOT_AGENT: "Only this machine's operations agent can do this. The agent may have been switched off by the DAO.",
  E_MISSING_ROLE: "You don't have the community role this needs (steward, verifier, trainer or council).",
  E_SELF_VERIFY: "You can't approve your own work. Another member has to check it.",
  E_INVALID_PROFILE: 'The machine profile is invalid, so nothing was changed.',
  E_WRONG_AMOUNT: 'The amount attached does not match the fee plus deposit. Nothing was charged.',
  E_SLOT_TAKEN: 'Someone already booked one of these slots. Pick another time.',
  E_SLOT_OUT_OF_RANGE: 'That time is outside the booking window. Pick a slot between now and the booking horizon.',
  E_TOO_MANY_SLOTS: 'That is more slots than one reservation allows.',
  E_BAD_STATE: "This can't be done right now: the reservation or task is in a different stage.",
  E_WINDOW_CLOSED: 'The start window for this slot has closed.',
  E_TELEMETRY_NOT_MONOTONIC: 'Telemetry counters can only go up; this report went backwards and was refused.',
  E_RULE_NOT_FOUND: "This machine's profile has no such maintenance rule.",
  E_RULE_NOT_DUE: 'This maintenance is not due yet: the usage counter has not crossed its threshold.',
  E_TASK_ALREADY_OPEN: 'A task for this maintenance is already open.',
  E_QUOTA_EXCEEDED: "This machine has used up its reward quota for this period. Try again next period.",
  E_CASH_CAP_EXCEEDED: "That cash reward is above this machine's limit. It needs a DAO proposal instead.",
  E_INSUFFICIENT_FLOAT: "The machine's float is too low for this. The DAO can top it up.",
  E_TOO_MANY_ESCALATIONS: 'Too many requests to the DAO are already open for this machine.',
  E_OP_NOT_RETRYABLE: 'Only a failed payment can be retried. This one is pending or already paid.',
  E_ALREADY_REWARDED: 'This work has already been rewarded. Rewards are paid exactly once.',
  E_NON_TRANSFERABLE: 'COMMONKIT cards belong to the person who earned them. They cannot be transferred.',
  E_RIGHT_NOT_ACTIVE: 'This usage right is already locked for a reservation or used up.',
  E_RIGHT_WRONG_GROUP: 'This usage right was earned in a different machine group and does not work here.',
  E_RIGHT_EXPIRED: 'This usage right has expired.',
  E_CREDENTIAL_MISSING: 'This machine needs a credential card first. Ask a trainer for the safety training.',
  E_ASSET_NOT_REGISTERED: 'This machine is not registered (or no longer active) in the community.',
  E_INVALID_ARGS: 'Some of the details sent were malformed or out of range. Nothing was changed.',
  E_NOT_FOUND: 'That card, training or record does not exist.',
  E_NO_REVOCATION: 'Granted rights can never be taken back, by anyone.',
};

export const ERROR_CODES = Object.keys(ERROR_MESSAGES) as ErrorCode[];

function parseErrorCode(text: string): ErrorCode | null {
  for (const m of text.matchAll(/\bE_[A-Z_]+\b/g)) {
    if (Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, m[0])) return m[0] as ErrorCode;
  }
  return null;
}

export interface HumanError {
  code: ErrorCode | null;
  message: string;
  /** The original text (panic string, RPC error), kept for the details toggle. */
  raw: string;
}

/** Pull the first known E_* code out of a contract panic / RPC error and humanize it. */
export function humanizeError(err: unknown): HumanError {
  const raw =
    typeof err === 'string'
      ? err
      : err instanceof Error
        ? err.message
        : (() => {
            try {
              return JSON.stringify(err);
            } catch {
              return String(err);
            }
          })();
  const code = parseErrorCode(raw);
  if (code) return { code, message: ERROR_MESSAGES[code], raw };
  return { code: null, message: 'Something went wrong. Open the details for the raw error.', raw };
}
