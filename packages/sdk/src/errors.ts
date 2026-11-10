/** Contract error codes (CONTRACT_SPEC §10) and a parser for panic messages. */
export const ERROR_CODES = [
  'E_UNAUTHORIZED', 'E_NOT_DAO', 'E_NOT_COMMONS', 'E_NOT_BRIDGE', 'E_NOT_AGENT', 'E_MISSING_ROLE',
  'E_SELF_VERIFY', 'E_INVALID_PROFILE', 'E_WRONG_AMOUNT', 'E_SLOT_TAKEN', 'E_SLOT_OUT_OF_RANGE',
  'E_TOO_MANY_SLOTS', 'E_BAD_STATE', 'E_WINDOW_CLOSED', 'E_TELEMETRY_NOT_MONOTONIC',
  'E_RULE_NOT_FOUND', 'E_RULE_NOT_DUE', 'E_TASK_ALREADY_OPEN', 'E_QUOTA_EXCEEDED',
  'E_CASH_CAP_EXCEEDED', 'E_INSUFFICIENT_FLOAT', 'E_TOO_MANY_ESCALATIONS', 'E_OP_NOT_RETRYABLE',
  'E_ALREADY_REWARDED', 'E_NON_TRANSFERABLE', 'E_RIGHT_NOT_ACTIVE', 'E_RIGHT_WRONG_GROUP',
  'E_RIGHT_EXPIRED', 'E_CREDENTIAL_MISSING', 'E_ASSET_NOT_REGISTERED', 'E_OUT_OF_SERVICE',
  'E_NO_RECENT_SESSION', 'E_ALREADY_REPORTED', 'E_NOT_REIMBURSABLE', 'E_EXPENSE_CAP',
  'E_INVALID_ARGS', 'E_LEDGER', 'E_MINT_FAILED', 'E_TRANSFER_FAILED', 'E_NOT_FOUND',
  'E_NO_REVOCATION',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Extract the first known E_* code from a panic/error message, if any. */
export function parseErrorCode(message: string): ErrorCode | null {
  const m = /\b(E_[A-Z_]+)\b/.exec(message);
  return m && (ERROR_CODES as readonly string[]).includes(m[1]!) ? (m[1] as ErrorCode) : null;
}
