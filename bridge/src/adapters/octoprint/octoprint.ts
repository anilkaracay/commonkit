import { readFile } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { canonicalJson, sha256Hex } from "../../util/near.js";
import { deviceJson, secretFromEnv } from "../http.js";
import { AdapterState } from "../state.js";
import type { Adapter, AdapterContext, DeviceStatus, Metrics, SessionContext, VerificationOutcome, VerificationTest } from "../types.js";

export const octoprintConfigSchema = z.object({
  base_url: z.url(),
  api_key_env: z.string().optional(),
  default_job: z.string().optional(),
  poll_ms: z.number().int().positive().default(2_000),
  time_scale: z.number().positive().default(1),
});
export type OctoprintConfig = z.infer<typeof octoprintConfigSchema>;

const jobSchema = z.object({
  job: z.object({
    file: z.object({ name: z.string().nullable() }),
    filament: z.object({ tool0: z.object({ length: z.number().nullable() }).optional() }).nullable().optional(),
  }),
  progress: z.object({ completion: z.number().nullable(), printTime: z.number().nullable() }),
  state: z.string(),
  error: z.string().optional(),
});
type JobView = z.infer<typeof jobSchema>;
const uploadSchema = z.object({ done: z.boolean(), files: z.object({ local: z.object({ name: z.string() }) }) });

const stateSchema = z.object({
  locked: z.boolean(),
  /** OctoPrint has no cumulative totals API: the adapter counts finished jobs itself (once each). */
  counters: z.object({
    jobs_total: z.number().int().nonnegative(),
    jobs_failed: z.number().int().nonnegative(),
    print_seconds: z.number().nonnegative(),
    filament_used_mm: z.number().nonnegative(),
  }),
  current: z.object({ session_id: z.string(), filename: z.string().nullable(), counted: z.boolean() }).nullable(),
});
type State = z.infer<typeof stateSchema>;

const PRINTING = new Set(["Printing", "Pausing", "Paused", "Cancelling", "Resuming", "Starting"]);

/** OctoPrint fallback printer adapter (BRIDGE §4.2). Same contract as moonraker. */
export class OctoprintAdapter implements Adapter {
  readonly kind = "octoprint";
  readonly simulated = false;
  private readonly state: AdapterState<State>;
  private readonly headers: Record<string, string>;

  constructor(
    private readonly config: OctoprintConfig,
    private readonly ctx: AdapterContext,
  ) {
    this.state = new AdapterState(ctx.stateDir, ctx.assetId, "octoprint", stateSchema, {
      locked: true,
      counters: { jobs_total: 0, jobs_failed: 0, print_seconds: 0, filament_used_mm: 0 },
      current: null,
    });
    const key = secretFromEnv(ctx.env, config.api_key_env, "octoprint api key");
    this.headers = key ? { "x-api-key": key } : {};
  }

  private url(p: string): string {
    return new URL(p, this.config.base_url).toString();
  }

  async init(): Promise<void> {
    await this.state.load();
    if (!this.state.value.current) this.state.value.locked = true;
    await this.state.save();
    await this.job();
  }

  async status(): Promise<DeviceStatus> {
    try {
      const j = await this.job();
      return {
        online: true,
        locked: this.state.value.locked,
        busy: PRINTING.has(j.state) || this.state.value.current !== null,
        details: { state: j.state, file: j.job.file.name, completion: j.progress.completion },
      };
    } catch (err) {
      return { online: false, locked: this.state.value.locked, busy: false, details: { error: (err as Error).message } };
    }
  }

  async unlock(session: SessionContext): Promise<void> {
    const cur = this.state.value.current;
    if (cur?.session_id === session.sessionId) return;
    if (cur) throw new Error(`printer busy with session ${cur.session_id}`);
    if (PRINTING.has((await this.job()).state)) throw new Error("printer is already printing");
    const job = session.jobFile?.path ?? (this.config.default_job ? this.resolvePath(this.config.default_job) : null);
    const filename = job ? await this.upload(job, session.jobFile?.name ?? basename(job)) : null;
    this.state.value = { ...this.state.value, locked: false, current: { session_id: session.sessionId, filename, counted: false } };
    await this.state.save();
  }

  async lock(): Promise<void> {
    const cur = this.state.value.current;
    if (cur?.filename) {
      if (PRINTING.has((await this.job()).state)) {
        await deviceJson(this.url("/api/job"), z.unknown(), {
          method: "POST",
          headers: { ...this.headers, "content-type": "application/json" },
          body: JSON.stringify({ command: "cancel" }),
        });
      }
      await this.countIfFinished(await this.job());
    }
    this.state.value.current = null;
    this.state.value.locked = true;
    await this.state.save();
  }

  async readMetrics(): Promise<Metrics> {
    const c = this.state.value.counters;
    const printSeconds = BigInt(Math.floor(c.print_seconds));
    return {
      print_seconds: printSeconds,
      nozzle_seconds: printSeconds,
      jobs_total: BigInt(c.jobs_total),
      jobs_failed: BigInt(c.jobs_failed),
      filament_used_mm: BigInt(Math.floor(c.filament_used_mm)),
    };
  }

  async sessionDone(session: SessionContext): Promise<boolean> {
    const cur = this.state.value.current;
    if (!cur || cur.session_id !== session.sessionId) return true;
    if (!cur.filename) return false;
    return this.countIfFinished(await this.job());
  }

  async runVerification(test: VerificationTest): Promise<VerificationOutcome> {
    if (test.type !== "calibration_print") throw new Error(`octoprint cannot run a ${test.type} test`);
    if (this.state.value.current) throw new Error("printer busy with a session");
    const name = await this.upload(this.resolvePath(test.file), basename(test.file));
    const deadline = this.ctx.clock.now() + (test.max_minutes * 60_000) / this.config.time_scale;
    let j = await this.job();
    while (PRINTING.has(j.state) && this.ctx.clock.now() < deadline) {
      await this.ctx.clock.sleep(this.config.poll_ms);
      j = await this.job();
    }
    const timedOut = PRINTING.has(j.state);
    const passed = !timedOut && j.state === "Operational" && (j.progress.completion ?? 0) >= 100;
    const details = {
      adapter: "octoprint",
      asset_id: this.ctx.assetId,
      test,
      file: name,
      final_state: timedOut ? "timeout" : j.state,
      completion: j.progress.completion,
      print_time_s: j.progress.printTime,
      error: j.error ?? null,
    };
    return { passed, details, detailsHash: sha256Hex(canonicalJson(details)) };
  }

  /** Adds a finished session job to the local counters exactly once. Returns true when finished. */
  private async countIfFinished(j: JobView): Promise<boolean> {
    const cur = this.state.value.current;
    if (!cur?.filename || j.job.file.name !== cur.filename || PRINTING.has(j.state)) return false;
    if (!cur.counted) {
      const c = this.state.value.counters;
      const completion = Math.min(100, j.progress.completion ?? 0) / 100;
      c.jobs_total += 1;
      if (j.state === "Error" || j.state.startsWith("Offline")) c.jobs_failed += 1;
      c.print_seconds += j.progress.printTime ?? 0;
      c.filament_used_mm += (j.job.filament?.tool0?.length ?? 0) * completion;
      cur.counted = true;
      await this.state.save();
    }
    return true;
  }

  private async job(): Promise<JobView> {
    return deviceJson(this.url("/api/job"), jobSchema, { headers: this.headers });
  }

  private async upload(path: string, name: string): Promise<string> {
    const fd = new FormData();
    fd.append("select", "true");
    fd.append("print", "true");
    fd.append("file", new Blob([await readFile(path)]), name);
    const r = await deviceJson(this.url("/api/files/local"), uploadSchema, { method: "POST", headers: this.headers, body: fd, timeoutMs: 30_000 });
    return r.files.local.name;
  }

  private resolvePath(p: string): string {
    return isAbsolute(p) ? p : resolve(this.ctx.configDir, p);
  }
}
