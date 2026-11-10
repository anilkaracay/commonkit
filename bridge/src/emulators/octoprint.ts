import multipart from "@fastify/multipart";
import { z } from "zod";
import { baseFaultsSchema, checkApiKey, createEmulatorApp, type Emulator, type EmulatorOptions } from "./common.js";
import { PrinterCore } from "./printer-core.js";

/**
 * OctoPrint emulator — API subset used by the octoprint adapter (research E6):
 *   POST /api/files/local   multipart: file, select, print   -> 201 + Location
 *   GET  /api/job           job + progress + state ("Operational" | "Printing" | "Error")
 *   POST /api/job           {"command": "cancel"} -> 204
 *   Auth: X-Api-Key. OctoPrint has no cumulative totals endpoint; the adapter keeps its own.
 */
export const octoprintFaultsSchema = baseFaultsSchema.extend({ job_error: z.boolean().default(false) });
export type OctoprintFaults = z.infer<typeof octoprintFaultsSchema>;

export function createOctoprintEmulator(
  o: EmulatorOptions & { apiKey: string | null },
): Emulator & { printer: PrinterCore; faults: OctoprintFaults } {
  const printer = new PrinterCore(o.clock);
  const faults: OctoprintFaults = octoprintFaultsSchema.parse({});
  const snapshot = () => ({ job: printer.job, files: [...printer.files.keys()] });
  const app = createEmulatorApp("octoprint", o.logger, faults, octoprintFaultsSchema.partial(), snapshot);
  const startJob = (path: string) => {
    printer.failNextJob = faults.job_error;
    printer.start(path);
    faults.job_error = false;
  };

  app.register(multipart, { limits: { fileSize: 32 * 1024 * 1024 } });
  app.addHook("preHandler", async (req, reply) => {
    if (req.url.startsWith("/__emulator")) return;
    if (!checkApiKey(req.headers["x-api-key"], o.apiKey)) return reply.status(403).send({ error: "Invalid API key" });
  });

  app.post("/api/files/local", async (req, reply) => {
    const fields: Record<string, string> = {};
    let content: Buffer | null = null;
    let filename = "";
    for await (const part of req.parts()) {
      if (part.type === "file") {
        content = await part.toBuffer();
        filename = part.filename;
      } else fields[part.fieldname] = String(part.value);
    }
    if (!content) return reply.status(400).send({ error: "No file included" });
    if (fields.print === "true" && printer.busy()) return reply.status(409).send({ error: "Printer is already printing" });
    printer.store(filename, content);
    if (fields.print === "true") startJob(filename);
    const resource = `/api/files/local/${encodeURIComponent(filename)}`;
    return reply
      .status(201)
      .header("location", resource)
      .send({ done: true, files: { local: { name: filename, origin: "local", refs: { resource, download: `/downloads/files/local/${filename}` } } } });
  });

  app.get("/api/job", async () => {
    const p = printer.progress();
    const j = printer.job;
    const f = j ? printer.files.get(j.filename) : undefined;
    const state = !j || j.state === "complete" || j.state === "cancelled" ? "Operational" : j.state === "error" ? "Error" : "Printing";
    return {
      job: {
        file: f ? { name: f.path, origin: "local", size: f.size, date: f.modified } : { name: null, origin: null, size: null, date: null },
        estimatedPrintTime: f?.durationSec ?? null,
        filament: f ? { tool0: { length: f.filamentMm, volume: null } } : null,
      },
      progress: {
        completion: j ? p.fraction * 100 : null,
        filepos: f ? Math.floor(f.size * p.fraction) : null,
        printTime: j ? Math.floor(p.elapsedSec) : null,
        printTimeLeft: j && j.state === "printing" ? Math.ceil(j.durationSec - p.elapsedSec) : null,
      },
      state,
      ...(j?.state === "error" ? { error: j.message } : {}),
    };
  });

  app.post("/api/job", async (req, reply) => {
    const body = z.object({ command: z.enum(["cancel", "start", "pause", "restart"]) }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: "Invalid command" });
    if (body.data.command !== "cancel") return reply.status(400).send({ error: "only cancel is emulated" });
    if (!printer.busy()) return reply.status(409).send({ error: "Printer is not printing" });
    printer.cancel();
    return reply.status(204).send();
  });

  return { device: "octoprint", app, snapshot, printer, faults };
}
