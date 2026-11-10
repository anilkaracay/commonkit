import multipart from "@fastify/multipart";
import { createHash } from "node:crypto";
import { z } from "zod";
import { baseFaultsSchema, checkApiKey, createEmulatorApp, type Emulator, type EmulatorOptions } from "./common.js";
import { PrinterCore, type Totals } from "./printer-core.js";

/**
 * Moonraker (Klipper) emulator — the API subset the moonraker adapter uses (research E1-E5):
 *   POST /server/files/upload            multipart: file, root, path, checksum (sha256), print
 *   POST /printer/print/start?filename=   POST /printer/print/cancel
 *   GET  /printer/objects/query?print_stats&virtual_sdcard
 *   GET  /server/history/totals           job_totals incl. total_filament_used (mm)
 *   Auth: X-Api-Key (401 otherwise). Errors: {"error": {"code", "message"}}.
 */
export const moonrakerFaultsSchema = baseFaultsSchema.extend({
  /** The next print fails half-way with a heater error (state "error"). */
  job_error: z.boolean().default(false),
});
export type MoonrakerFaults = z.infer<typeof moonrakerFaultsSchema>;

export interface MoonrakerEmulatorOptions extends EmulatorOptions {
  apiKey: string | null;
  initialTotals?: Partial<Totals>;
}

export function createMoonrakerEmulator(o: MoonrakerEmulatorOptions): Emulator & { printer: PrinterCore; faults: MoonrakerFaults } {
  const printer = new PrinterCore(o.clock, o.initialTotals);
  const faults: MoonrakerFaults = moonrakerFaultsSchema.parse({});
  const snapshot = () => ({ job: printer.job, totals: printer.totals, files: [...printer.files.keys()] });
  const app = createEmulatorApp("moonraker", o.logger, faults, moonrakerFaultsSchema.partial(), snapshot);
  const err = (code: number, message: string) => ({ error: { code, message } });

  app.register(multipart, { limits: { fileSize: 32 * 1024 * 1024 } });
  app.addHook("preHandler", async (req, reply) => {
    if (req.url.startsWith("/__emulator")) return;
    if (!checkApiKey(req.headers["x-api-key"], o.apiKey)) return reply.status(401).send(err(401, "Unauthorized"));
  });
  /** The job_error fault applies to exactly the next job started. */
  const startJob = (path: string) => {
    printer.failNextJob = faults.job_error;
    printer.start(path);
    faults.job_error = false;
  };

  app.post("/server/files/upload", async (req, reply) => {
    const fields: Record<string, string> = {};
    let content: Buffer | null = null;
    let filename = "";
    for await (const part of req.parts()) {
      if (part.type === "file") {
        content = await part.toBuffer();
        filename = part.filename;
      } else {
        fields[part.fieldname] = String(part.value);
      }
    }
    if (!content) return reply.status(400).send(err(400, "No file part in request"));
    const root = fields.root ?? "gcodes";
    if (root !== "gcodes") return reply.status(400).send(err(400, `Invalid root ${root}`));
    if (fields.checksum && fields.checksum !== createHash("sha256").update(content).digest("hex")) {
      return reply.status(422).send(err(422, "File checksum mismatch"));
    }
    const path = fields.path ? `${fields.path.replace(/\/+$/, "")}/${filename}` : filename;
    const stored = printer.store(path, content);
    let printStarted = false;
    if (fields.print === "true" && !printer.busy()) {
      startJob(path);
      printStarted = true;
    }
    return reply.status(201).send({
      item: { path, root, modified: stored.modified, size: stored.size, permissions: "rw" },
      print_started: printStarted,
      print_queued: false,
      action: "create_file",
    });
  });

  app.post("/printer/print/start", async (req, reply) => {
    const filename = z.object({ filename: z.string().min(1) }).safeParse(req.query);
    if (!filename.success) return reply.status(400).send(err(400, "filename required"));
    try {
      startJob(filename.data.filename);
    } catch (e) {
      return reply.status(400).send(err(400, (e as Error).message));
    }
    return { result: "ok" };
  });

  app.post("/printer/print/cancel", async (_req, reply) => {
    try {
      printer.cancel();
    } catch (e) {
      return reply.status(400).send(err(400, (e as Error).message));
    }
    return { result: "ok" };
  });

  app.get("/printer/objects/query", async () => {
    const p = printer.progress();
    const j = printer.job;
    const f = j ? printer.files.get(j.filename) : undefined;
    const active = j?.state === "printing";
    return {
      result: {
        eventtime: o.clock.now() / 1000,
        status: {
          print_stats: {
            filename: j?.filename ?? "",
            total_duration: p.elapsedSec,
            print_duration: p.elapsedSec,
            filament_used: p.filamentMm,
            state: j?.state ?? "standby",
            message: j?.message ?? "",
            info: { total_layer: null, current_layer: null },
          },
          virtual_sdcard: {
            is_active: active,
            progress: p.fraction,
            file_path: f ? `/home/pi/printer_data/gcodes/${f.path}` : null,
            file_position: f ? Math.floor(f.size * p.fraction) : 0,
            file_size: f?.size ?? 0,
          },
        },
      },
    };
  });

  app.get("/server/history/totals", async () => {
    printer.tick();
    return { result: { job_totals: { ...printer.totals }, auxiliary_totals: [] } };
  });

  return { device: "moonraker", app, snapshot, printer, faults };
}
