import { randomUUID } from "node:crypto";
import type { VerificationOutcome, VerificationTest } from "../adapters/types.js";
import { isRetryableChainError, type ChainClient } from "../chain/types.js";
import { BridgeError } from "../errors.js";
import type { EventBus } from "../events/bus.js";
import type { AssetRuntime } from "../runtime.js";
import type { LocalClock } from "../util/clock.js";
import type { KeyedMutex } from "../util/mutex.js";
import { withRetry } from "../util/retry.js";

export type RunStatus = "running" | "reported" | "device_error" | "report_failed";

export interface VerificationRun {
  id: string;
  assetId: string;
  taskId: bigint;
  ruleId: string;
  accountId: string;
  test: VerificationTest;
  status: RunStatus;
  outcome: VerificationOutcome | null;
  tx: string | null;
  error: string | null;
  simulated: boolean;
}

/**
 * Runs the profile's verification test after a maintenance submission (asked by the claimer)
 * and reports the result with submit_verification_result. The bridge never approves anything.
 */
export class VerificationRunner {
  private readonly runs = new Map<string, VerificationRun>();
  private readonly done = new Map<string, Promise<VerificationRun>>();

  constructor(
    private readonly assets: Map<string, AssetRuntime>,
    private readonly chain: ChainClient,
    private readonly bus: EventBus,
    private readonly chainMutex: KeyedMutex,
    private readonly clock: LocalClock,
    private readonly retry = { attempts: 4, baseDelayMs: 500 },
  ) {}

  get(id: string): VerificationRun | undefined {
    return this.runs.get(id);
  }

  /** Resolves when the run has finished (tests, CLI). */
  wait(id: string): Promise<VerificationRun> {
    const p = this.done.get(id);
    if (!p) throw new BridgeError(404, "RUN_NOT_FOUND", id);
    return p;
  }

  /** Validates the request against chain state, claims the device, starts the run in the background. */
  async start(assetId: string, taskId: bigint, accountId: string): Promise<VerificationRun> {
    const rt = this.assets.get(assetId);
    if (!rt) throw new BridgeError(404, "UNKNOWN_ASSET", assetId);
    let task;
    try {
      task = await this.chain.getTask(assetId, taskId);
    } catch (err) {
      throw new BridgeError(503, "CHAIN_UNAVAILABLE", (err as Error).message);
    }
    if (!task) throw new BridgeError(404, "TASK_NOT_FOUND", `task ${taskId}`);
    if (task.status !== "Submitted") throw new BridgeError(409, "TASK_NOT_SUBMITTED", `task is ${task.status}`);
    if (task.claimer !== accountId) throw new BridgeError(403, "NOT_TASK_CLAIMER", "only the task claimer can start verification");
    if (task.verifier) throw new BridgeError(409, "TASK_NOT_SUBMITTED", "a verifier already decided this task");
    // The contract accepts a new result while no verifier decided; re-running only makes sense after a failure.
    if (task.verification?.passed) throw new BridgeError(409, "ALREADY_VERIFIED", "a passing verification result is already recorded");
    const test = rt.config.verification_tests[task.ruleId] ?? (rt.adapter.simulated ? { type: "simulated" as const } : null);
    if (!test) {
      const why = task.requiresVerificationTest ? "the rule requires one but" : "the rule does not require one and";
      throw new BridgeError(422, "NO_VERIFICATION_TEST", `${why} no test is configured for rule ${task.ruleId}`);
    }
    if (rt.occupancy) throw new BridgeError(409, "DEVICE_BUSY", `device is busy (${rt.occupancy.kind})`);

    const run: VerificationRun = {
      id: randomUUID(),
      assetId,
      taskId,
      ruleId: task.ruleId,
      accountId,
      test,
      status: "running",
      outcome: null,
      tx: null,
      error: null,
      simulated: rt.simulated,
    };
    rt.occupancy = { kind: "verification", runId: run.id };
    this.runs.set(run.id, run);
    this.emit(rt, "verification_started", { run_id: run.id, task_id: taskId, rule_id: task.ruleId, test });
    this.done.set(run.id, this.execute(rt, run));
    return run;
  }

  private async execute(rt: AssetRuntime, run: VerificationRun): Promise<VerificationRun> {
    try {
      run.outcome = await rt.adapter.runVerification(run.test);
    } catch (err) {
      run.status = "device_error";
      run.error = (err as Error).message;
      this.emit(rt, "verification_device_error", { run_id: run.id, task_id: run.taskId, error: run.error }, "error");
      return run;
    } finally {
      if (rt.occupancy?.kind === "verification" && rt.occupancy.runId === run.id) rt.occupancy = null;
    }
    const outcome = run.outcome;
    this.emit(rt, "verification_finished", {
      run_id: run.id,
      task_id: run.taskId,
      passed: outcome.passed,
      details_hash: outcome.detailsHash,
      details: outcome.details,
    });
    try {
      run.tx = await this.chainMutex.run(rt.config.asset_id, () =>
        withRetry(
          async () => {
            const t = await this.chain.getTask(run.assetId, run.taskId);
            if (t?.verification?.detailsHash === outcome.detailsHash) return null; // already recorded
            return (
              await this.chain.submitVerificationResult(run.assetId, run.taskId, outcome.passed, outcome.detailsHash, {
                simulated: rt.simulated,
              })
            ).txHash;
          },
          { ...this.retry, clock: this.clock, retryable: isRetryableChainError },
        ),
      );
      run.status = "reported";
      this.emit(rt, "verification_reported", { run_id: run.id, task_id: run.taskId, passed: outcome.passed, tx: run.tx });
    } catch (err) {
      run.status = "report_failed";
      run.error = (err as Error).message;
      this.emit(rt, "verification_report_failed", { run_id: run.id, task_id: run.taskId, error: run.error }, "error");
    }
    return run;
  }

  private emit(rt: AssetRuntime, type: string, data: Record<string, unknown>, level: "info" | "warn" | "error" = "info"): void {
    this.bus.emit({ type, assetId: rt.config.asset_id, simulated: rt.simulated, data, level });
  }
}
