import { createHash } from "node:crypto";
import type { EmuClock } from "./common.js";

/** Klipper print_stats states (klippy/extras/print_stats.py, research E2). */
export type PrintState = "standby" | "printing" | "paused" | "complete" | "cancelled" | "error";

export interface StoredFile {
  path: string;
  size: number;
  modified: number; // unix seconds
  sha256: string;
  durationSec: number;
  filamentMm: number;
}

export interface Job {
  filename: string;
  startMs: number;
  durationSec: number;
  filamentMm: number;
  state: PrintState;
  endMs: number | null;
  /** If set, the job fails at this fraction (fault injection). */
  failAt: number | null;
  message: string;
}

export interface Totals {
  total_jobs: number;
  total_time: number;
  total_print_time: number;
  total_filament_used: number;
  longest_job: number;
  longest_print: number;
}

/**
 * Reads slicer metadata from G-code comments (PrusaSlicer / Cura style); defaults otherwise.
 *   ; estimated printing time (normal mode) = 1h 2m 3s     |  ;TIME:3723
 *   ; filament used [mm] = 4012.5                          |  ;Filament used: 4.0125m
 */
export function parseGcodeMeta(text: string): { durationSec: number; filamentMm: number } {
  let durationSec = 600;
  let filamentMm = 2000;
  const prusa = /;\s*estimated printing time[^=]*=\s*((?:\d+d\s*)?(?:\d+h\s*)?(?:\d+m\s*)?(?:\d+s)?)/i.exec(text);
  if (prusa?.[1]) {
    const p = prusa[1];
    const n = (u: string) => Number(new RegExp(`(\\d+)${u}`).exec(p)?.[1] ?? 0);
    durationSec = n("d") * 86400 + n("h") * 3600 + n("m") * 60 + n("s") || durationSec;
  }
  const cura = /^;TIME:(\d+)/m.exec(text);
  if (cura?.[1]) durationSec = Number(cura[1]);
  const pf = /;\s*filament used \[mm\]\s*=\s*([\d.]+)/i.exec(text);
  if (pf?.[1]) filamentMm = Number(pf[1]);
  const cf = /^;Filament used:\s*([\d.]+)m/m.exec(text);
  if (cf?.[1]) filamentMm = Number(cf[1]) * 1000;
  return { durationSec, filamentMm };
}

/** Emulated printer: files, one job at a time, cumulative history totals (Moonraker semantics). */
export class PrinterCore {
  readonly files = new Map<string, StoredFile>();
  job: Job | null = null;
  readonly totals: Totals = {
    total_jobs: 0,
    total_time: 0,
    total_print_time: 0,
    total_filament_used: 0,
    longest_job: 0,
    longest_print: 0,
  };
  /** Fault: the next started job errors half-way (e.g. thermal runaway, spaghetti). */
  failNextJob = false;

  constructor(
    private readonly clock: EmuClock,
    initial: Partial<Totals> = {},
  ) {
    Object.assign(this.totals, initial);
  }

  store(path: string, content: Buffer): StoredFile {
    const meta = parseGcodeMeta(content.toString("utf8"));
    const f: StoredFile = {
      path,
      size: content.length,
      modified: Math.floor(this.clock.now() / 1000),
      sha256: createHash("sha256").update(content).digest("hex"),
      ...meta,
    };
    this.files.set(path, f);
    return f;
  }

  busy(): boolean {
    this.tick();
    return this.job?.state === "printing";
  }

  start(path: string): Job {
    this.tick();
    const f = this.files.get(path);
    if (!f) throw new Error(`file ${path} not found`);
    if (this.busy()) throw new Error("printer is busy");
    this.job = {
      filename: path,
      startMs: this.clock.now(),
      durationSec: f.durationSec,
      filamentMm: f.filamentMm,
      state: "printing",
      endMs: null,
      failAt: this.failNextJob ? 0.5 : null,
      message: "",
    };
    this.failNextJob = false;
    return this.job;
  }

  cancel(): void {
    this.tick();
    if (this.job?.state !== "printing") throw new Error("no active print");
    this.finish("cancelled", this.clock.now(), "");
  }

  /** Seconds printed and filament used so far for the current/last job. */
  progress(): { elapsedSec: number; fraction: number; filamentMm: number } {
    this.tick();
    const j = this.job;
    if (!j) return { elapsedSec: 0, fraction: 0, filamentMm: 0 };
    const end = j.endMs ?? this.clock.now();
    const elapsedSec = Math.max(0, (end - j.startMs) / 1000);
    const fraction = Math.min(1, elapsedSec / j.durationSec);
    return { elapsedSec, fraction, filamentMm: j.filamentMm * fraction };
  }

  /** Lazily advances the job state machine to the current emulated time. */
  tick(): void {
    const j = this.job;
    if (!j || j.state !== "printing") return;
    const now = this.clock.now();
    if (j.failAt !== null && now >= j.startMs + j.durationSec * 1000 * j.failAt) {
      this.finish("error", j.startMs + j.durationSec * 1000 * j.failAt, "Heater extruder not heating at expected rate (emulated fault)");
    } else if (now >= j.startMs + j.durationSec * 1000) {
      this.finish("complete", j.startMs + j.durationSec * 1000, "");
    }
  }

  private finish(state: PrintState, atMs: number, message: string): void {
    const j = this.job;
    if (!j) return;
    j.state = state;
    j.endMs = atMs;
    j.message = message;
    const secs = (atMs - j.startMs) / 1000;
    const filament = j.filamentMm * Math.min(1, secs / j.durationSec);
    this.totals.total_jobs += 1;
    this.totals.total_time += secs;
    this.totals.total_print_time += secs;
    this.totals.total_filament_used += filament;
    this.totals.longest_job = Math.max(this.totals.longest_job, secs);
    this.totals.longest_print = Math.max(this.totals.longest_print, secs);
  }
}
