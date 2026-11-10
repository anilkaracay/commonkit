import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { canonicalJson, sha256Hex } from "../../util/near.js";
import { deviceJson, secretFromEnv } from "../http.js";
import { AdapterState } from "../state.js";
import type { Adapter, AdapterContext, DeviceStatus, Metrics, SessionContext, VerificationOutcome, VerificationTest } from "../types.js";

export const moonrakerConfigSchema = z.object({
  base_url: z.url(),
  /** Env var holding the Moonraker API key (research E4/E5: only the bridge knows it). */
  api_key_env: z.string().optional(),
  /** Job printed when the member sends no file (relative to the config file). */
  default_job: z.string().optional(),
  /** Real ms between status polls while waiting for a verification print. */
  poll_ms: z.number().int().positive().default(2_000),
  /** Emulated devices only: emulated seconds per real second (keeps waits proportional). */
  time_scale: z.number().positive().default(1),
});
export type MoonrakerConfig = z.infer<typeof moonrakerConfigSchema>;

const totalsSchema = z.object({
  result: z.object({
    job_totals: z.object({
      total_jobs: z.number().nonnegative(),
      total_time: z.number().nonnegative(),
      total_print_time: z.number().nonnegative(),
      total_filament_used: z.number().nonnegative(),
      longest_job: z.number().nonnegative(),
      longest_print: z.number().nonnegative(),
    }),
  }),
});
const queryStatusSchema = z.object({
  result: z.object({
    status: z.object({
      print_stats: z.object({
        filename: z.string().nullable(),
        total_duration: z.number(),
        print_duration: z.number(),
        filament_used: z.number(),
        state: z.enum(["standby", "printing", "paused", "complete", "cancelled", "error"]),
        message: z.string(),
      }),
      virtual_sdcard: z.object({ is_active: z.boolean(), progress: z.number() }),
    }),
  }),
});
type PrintStats = z.infer<typeof queryStatusSchema>["result"]["status"]["print_stats"];
// Moonraker may or may not wrap the upload answer in `result`; accept both.
const uploadInner = z.object({ print_started: z.boolean(), item: z.object({ path: z.string() }) });
const uploadSchema = z.union([uploadInner, z.object({ result: uploadInner }).transform((r) => r.result)]);
const okSchema = z.unknown();

const stateSchema = z.object({
  locked: z.boolean(),
  jobs_failed: z.number().int().nonnegative(),
  current: z
    .object({ session_id: z.string(), filename: z.string().nullable(), failure_counted: z.boolean() })
    .nullable(),
});
type State = z.infer<typeof stateSchema>;

const TERMINAL = new Set(["complete", "cancelled", "error"]);

/**
 * Klipper/Moonraker printer (BRIDGE §4.1). Locking = only the bridge holds the API key and member
 * UIs are disabled (research E5); `unlock` uploads and starts the job; `lock` cancels a print that is
 * still running when the session is over. Counters come from /server/history/totals.
 */
export class MoonrakerAdapter implements Adapter {
  readonly kind = "moonraker";
  readonly simulated = false;
  private readonly state: AdapterState<State>;
  private readonly headers: Record<string, string>;

  constructor(
    private readonly config: MoonrakerConfig,
    private readonly ctx: AdapterContext,
  ) {
    this.state = new AdapterState(ctx.stateDir, ctx.assetId, "moonraker", stateSchema, { locked: true, jobs_failed: 0, current: null });
    const key = secretFromEnv(ctx.env, config.api_key_env, "moonraker api key");
    this.headers = key ? { "x-api-key": key } : {};
  }

  private url(path: string): string {
    return new URL(path, this.config.base_url).toString();
  }

  async init(): Promise<void> {
    await this.state.load();
    if (!this.state.value.current) this.state.value.locked = true;
    await this.state.save();
    await this.totals(); // fails fast on wrong URL or API key
  }

  async status(): Promise<DeviceStatus> {
    try {
      const ps = await this.printStats();
      return {
        online: true,
        locked: this.state.value.locked,
        busy: ps.state === "printing" || ps.state === "paused" || this.state.value.current !== null,
        details: { print_state: ps.state, filename: ps.filename, message: ps.message },
      };
    } catch (err) {
      return { online: false, locked: this.state.value.locked, busy: false, details: { error: (err as Error).message } };
    }
  }

  async unlock(session: SessionContext): Promise<void> {
    const cur = this.state.value.current;
    if (cur?.session_id === session.sessionId) return;
    if (cur) throw new Error(`printer busy with session ${cur.session_id}`);
    const ps = await this.printStats();
    if (ps.state === "printing" || ps.state === "paused") throw new Error("printer is already printing");
    const job = session.jobFile?.path ?? (this.config.default_job ? this.resolvePath(this.config.default_job) : null);
    let filename: string | null = null;
    if (job) {
      const up = await this.upload(job, session.jobFile?.name ?? basename(job), true);
      if (!up.print_started) throw new Error("printer did not start the job");
      filename = up.item.path;
    }
    this.state.value = { ...this.state.value, locked: false, current: { session_id: session.sessionId, filename, failure_counted: false } };
    await this.state.save();
  }

  async lock(): Promise<void> {
    const cur = this.state.value.current;
    if (cur?.filename) {
      const ps = await this.printStats();
      if (ps.state === "printing" || ps.state === "paused") {
        await deviceJson(this.url("/printer/print/cancel"), okSchema, { method: "POST", headers: this.headers });
      }
    }
    this.state.value.current = null;
    this.state.value.locked = true;
    await this.state.save();
  }

  async readMetrics(): Promise<Metrics> {
    const t = await this.totals();
    const printSeconds = BigInt(Math.floor(t.total_print_time));
    return {
      print_seconds: printSeconds,
      // Rule baselines handle nozzle changes (BRIDGE §4.1): nozzle_seconds = print_seconds.
      nozzle_seconds: printSeconds,
      jobs_total: BigInt(Math.floor(t.total_jobs)),
      jobs_failed: BigInt(this.state.value.jobs_failed),
      filament_used_mm: BigInt(Math.floor(t.total_filament_used)),
    };
  }

  async sessionDone(session: SessionContext): Promise<boolean> {
    const cur = this.state.value.current;
    if (!cur || cur.session_id !== session.sessionId) return true;
    if (!cur.filename) return false; // interactive session: holder or deadline ends it
    const ps = await this.printStats();
    if (ps.filename !== cur.filename || !TERMINAL.has(ps.state)) return false;
    if (ps.state === "error" && !cur.failure_counted) {
      this.state.value.jobs_failed += 1;
      cur.failure_counted = true;
      await this.state.save();
    }
    return true;
  }

  async runVerification(test: VerificationTest): Promise<VerificationOutcome> {
    if (test.type !== "calibration_print") throw new Error(`moonraker cannot run a ${test.type} test`);
    if (this.state.value.current) throw new Error("printer busy with a session");
    const before = await this.totals();
    const up = await this.upload(this.resolvePath(test.file), basename(test.file), true);
    if (!up.print_started) throw new Error("printer did not start the calibration print");
    const deadline = this.ctx.clock.now() + (test.max_minutes * 60_000) / this.config.time_scale;
    let ps = await this.printStats();
    while (!(ps.filename === up.item.path && TERMINAL.has(ps.state)) && this.ctx.clock.now() < deadline) {
      await this.ctx.clock.sleep(this.config.poll_ms);
      ps = await this.printStats();
    }
    let timedOut = false;
    if (!TERMINAL.has(ps.state)) {
      timedOut = true;
      await deviceJson(this.url("/printer/print/cancel"), okSchema, { method: "POST", headers: this.headers });
    }
    const after = await this.totals();
    const details = {
      adapter: "moonraker",
      asset_id: this.ctx.assetId,
      test,
      file: up.item.path,
      final_state: timedOut ? "timeout" : ps.state,
      message: ps.message,
      print_duration_s: ps.print_duration,
      filament_used_mm: ps.filament_used,
      jobs_total_before: before.total_jobs,
      jobs_total_after: after.total_jobs,
    };
    return { passed: !timedOut && ps.state === "complete", details, detailsHash: sha256Hex(canonicalJson(details)) };
  }

  private async totals() {
    return (await deviceJson(this.url("/server/history/totals"), totalsSchema, { headers: this.headers })).result.job_totals;
  }

  private async printStats(): Promise<PrintStats> {
    const r = await deviceJson(this.url("/printer/objects/query?print_stats&virtual_sdcard"), queryStatusSchema, { headers: this.headers });
    return r.result.status.print_stats;
  }

  private async upload(path: string, name: string, print: boolean) {
    const content = await readFile(path);
    const fd = new FormData();
    fd.append("root", "gcodes");
    fd.append("print", print ? "true" : "false");
    fd.append("checksum", createHash("sha256").update(content).digest("hex"));
    fd.append("file", new Blob([content]), name);
    return deviceJson(this.url("/server/files/upload"), uploadSchema, { method: "POST", headers: this.headers, body: fd, timeoutMs: 30_000 });
  }

  private resolvePath(p: string): string {
    return isAbsolute(p) ? p : resolve(this.ctx.configDir, p);
  }
}
