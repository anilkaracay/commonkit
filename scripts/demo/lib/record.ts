/**
 * Judge-flow evidence (TEST_PLAN §5): one record per step in `evidence/steps.json`, upserted by
 * step number. The record is a superset of `scripts/lib/evidence.ts` StepRecord
 * ({step, title, txHashes, explorerLinks, assertions, timestamp, simulated}) with `core`,
 * `status`, labelled transactions, notes and `outputs` (ids later steps resume from).
 * Records are written on failure too, so a rerun resumes instead of spending again.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { EVIDENCE_DIR, explorerTx } from '../../lib/config.js';
import type { TxResult } from '../../lib/near.js';

export interface Assertion {
  what: string;
  ok: boolean;
  detail?: string;
}

export interface TxEntry {
  label: string;
  hash: string;
  ok: boolean;
  /** Who produced it: a script signer, the bridge, the agent or a DAO vote. */
  by: string;
  receiver?: string;
  events?: string[];
  error_code?: string | null;
  failure?: string;
  /** Expected failure (negative step): the tx is evidence of a refusal. */
  expected_failure?: boolean;
}

export type StepStatus = 'passed' | 'failed';

export interface DemoStepRecord {
  step: number;
  title: string;
  core: boolean;
  simulated: boolean;
  negative: boolean;
  status: StepStatus;
  txHashes: string[];
  explorerLinks: string[];
  transactions: TxEntry[];
  assertions: Assertion[];
  notes: string[];
  outputs: Record<string, string>;
  /** Set when the step has no transaction of its own (e.g. a bridge refusal, verify.sh). */
  no_tx_reason?: string;
  error?: string;
  timestamp: string;
}

export const STEPS_FILE = join(EVIDENCE_DIR, 'steps.json');

export function readSteps(path = STEPS_FILE): DemoStepRecord[] {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as DemoStepRecord[]) : [];
}

export function upsertStep(record: DemoStepRecord, path = STEPS_FILE): DemoStepRecord[] {
  const steps = readSteps(path).filter((s) => s.step !== record.step);
  steps.push(record);
  steps.sort((a, b) => a.step - b.step);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(steps, null, 2)}\n`);
  return steps;
}

const MAX_FAILURE = 400;

/** Collects what one step did; `finish()` turns it into the stored record. */
export class StepRecorder {
  readonly transactions: TxEntry[];
  readonly assertions: Assertion[] = [];
  readonly notes: string[] = [];
  outputs: Record<string, string>;
  noTxReason: string | undefined;
  /** Passed checks of an earlier attempt (e.g. a refused tx that a rerun must not resend). */
  private readonly earlier: Assertion[];

  constructor(
    readonly meta: { step: number; title: string; core: boolean; simulated: boolean; negative: boolean },
    previous?: DemoStepRecord,
    private readonly print: (line: string) => void = (l) => console.log(l),
  ) {
    // Outputs and transactions of an earlier (failed or forced) attempt are kept: the rerun resumes
    // from them, and the evidence still lists every transaction the step sent.
    this.outputs = { ...(previous?.outputs ?? {}) };
    this.transactions = [...(previous?.transactions ?? [])];
    this.earlier = (previous?.assertions ?? []).filter((a) => a.ok);
  }

  tx(label: string, tx: TxResult, opts: { expectedFailure?: boolean } = {}): TxResult {
    this.transactions.push({
      label,
      hash: tx.hash,
      ok: tx.ok,
      by: tx.signer,
      receiver: tx.receiver,
      events: tx.events.map((e) => e.event),
      error_code: tx.errorCode,
      ...(tx.failure ? { failure: tx.failure.slice(0, MAX_FAILURE) } : {}),
      ...(opts.expectedFailure ? { expected_failure: true } : {}),
    });
    this.print(`  ${tx.ok ? 'tx' : 'tx FAILED'} ${tx.hash}  ${label}`);
    return tx;
  }

  /** A tx sent by another component (bridge, agent): hash known, outcome checked via views. */
  externalTx(label: string, hash: string, by: string, ok = true): void {
    if (this.transactions.some((t) => t.hash === hash)) return;
    this.transactions.push({ label, hash, ok, by });
    this.print(`  tx ${hash}  ${label} (by ${by})`);
  }

  check(what: string, ok: boolean, detail?: unknown): boolean {
    const d = detail === undefined ? undefined : typeof detail === 'string' ? detail : stringify(detail);
    this.assertions.push({ what, ok, ...(d !== undefined ? { detail: d } : {}) });
    this.print(`  ${ok ? 'ok  ' : 'FAIL'} ${what}${d ? ` — ${d}` : ''}`);
    return ok;
  }

  eq(what: string, actual: unknown, expected: unknown): boolean {
    const a = stringify(actual);
    const e = stringify(expected);
    return this.check(what, a === e, a === e ? a : `got ${a}, expected ${e}`);
  }

  /** Negative path: the tx must have failed with exactly `code`. */
  expectCode(what: string, tx: TxResult, code: string): boolean {
    const got = tx.errorCode ?? protocolCode(tx.failure);
    return this.check(what, !tx.ok && got === code, `${code} expected; got ${tx.ok ? 'success' : got ?? tx.failure?.slice(0, 160)} (tx ${tx.hash})`);
  }

  note(text: string): void {
    this.notes.push(text);
    this.print(`  note: ${text}`);
  }

  out(key: string, value: string | bigint | number): void {
    this.outputs[key] = value.toString();
  }

  finish(error?: unknown): DemoStepRecord {
    // Checks proven by an earlier attempt and not repeated now stay in the record, marked as such.
    const now = new Set(this.assertions.map((a) => a.what));
    const kept = this.earlier
      .filter((a) => !now.has(a.what) && !now.has(`${a.what} (earlier attempt)`))
      .map((a) => ({ ...a, what: a.what.endsWith('(earlier attempt)') ? a.what : `${a.what} (earlier attempt)` }));
    const assertions = [...kept, ...this.assertions];
    const failed = error !== undefined || this.assertions.length === 0 || this.assertions.some((a) => !a.ok);
    const hashes = [...new Set(this.transactions.map((t) => t.hash))];
    return {
      ...this.meta,
      status: failed ? 'failed' : 'passed',
      txHashes: hashes,
      explorerLinks: hashes.map(explorerTx),
      transactions: this.transactions,
      assertions,
      notes: this.notes,
      outputs: this.outputs,
      ...(this.noTxReason && hashes.length === 0 ? { no_tx_reason: this.noTxReason } : {}),
      ...(error !== undefined ? { error: error instanceof Error ? error.message : String(error) } : {}),
      timestamp: new Date().toISOString(),
    };
  }
}

/** `PROTOCOL:<kind>` for failures the runtime raises before contract code (no E_* code). */
export function protocolCode(failure: string | null | undefined): string | null {
  if (!failure) return null;
  const kinds = ['MethodNotFound', 'DepositWithFunctionCall', 'MethodNameMismatch', 'NotEnoughAllowance', 'ReceiverMismatch', 'MethodResolveError'];
  const k = kinds.find((x) => new RegExp(`\\b${x}\\b`).test(failure));
  return k ? `PROTOCOL:${k}` : null;
}

export const stringify = (v: unknown): string =>
  typeof v === 'string' ? v : JSON.stringify(v, (_k, x: unknown) => (typeof x === 'bigint' ? x.toString() : x));
