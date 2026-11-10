import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import type { Logger } from "pino";
import { z } from "zod";
import { systemClock, type LocalClock } from "../util/clock.js";

/**
 * Device emulators (D-022): small HTTP servers that implement exactly the documented API subset our
 * adapters use (docs/RESEARCH_RESULTS.md E1-E9). They are NOT devices; every response carries the
 * header `x-commonkit-emulated: <device>` and every log line `emulated: true, simulated: true`.
 */
export const EMULATED_HEADER = "x-commonkit-emulated";

/** Emulated time in ms. Tests use ManualClock; the CLI uses ScaledClock (speed factor). */
export interface EmuClock {
  now(): number;
}

/** Wall clock sped up by `speed` (e.g. 60 = one emulated minute per real second). */
export class ScaledClock implements EmuClock {
  private readonly realStart: number;
  private readonly emuStart: number;
  constructor(
    readonly speed: number,
    private readonly base: LocalClock = systemClock,
  ) {
    this.realStart = base.now();
    this.emuStart = base.now();
  }
  now(): number {
    return this.emuStart + (this.base.now() - this.realStart) * this.speed;
  }
}

/** Failure modes every emulator supports; devices add their own. */
export const baseFaultsSchema = z.object({
  /** Connections are dropped (like an unplugged device / Wi-Fi loss). */
  offline: z.boolean().default(false),
  /** Every API call answers 401 (wrong / rotated credentials). */
  auth_fail: z.boolean().default(false),
});
export type BaseFaults = z.infer<typeof baseFaultsSchema>;

export interface EmulatorOptions {
  clock: EmuClock;
  logger: Logger;
}

export interface Emulator {
  readonly device: string;
  readonly app: FastifyInstance;
  /** Current internal state (for /__emulator and tests). */
  snapshot(): Record<string, unknown>;
}

/**
 * Fastify instance with the emulator conventions:
 *   - `/__emulator` (GET state, POST /faults) is the control plane; it stays reachable when "offline".
 *   - offline: device API connections are destroyed without an answer.
 *   - auth_fail: device API answers 401.
 */
export function createEmulatorApp<F extends BaseFaults>(
  device: string,
  logger: Logger,
  faults: F,
  faultsSchema: z.ZodType<Partial<F>>,
  snapshot: () => Record<string, unknown>,
): FastifyInstance {
  const app = Fastify({
    loggerInstance: logger.child({ emulated: true, simulated: true, device }) as FastifyBaseLogger,
    bodyLimit: 32 * 1024 * 1024,
  });
  app.addHook("onRequest", async (req, reply) => {
    if (req.url.startsWith("/__emulator")) return;
    if (faults.offline) {
      req.raw.socket.destroy();
      return reply.hijack();
    }
    if (faults.auth_fail) return reply.status(401).send({ error: { code: 401, message: "Unauthorized" } });
  });
  app.addHook("onSend", async (_req, reply, payload) => {
    reply.header(EMULATED_HEADER, device);
    return payload;
  });
  app.get("/__emulator", async () => ({ device, emulated: true, simulated: true, faults, state: snapshot() }));
  app.post("/__emulator/faults", async (req, reply) => {
    const parsed = faultsSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: z.prettifyError(parsed.error) });
    Object.assign(faults, parsed.data);
    req.log.warn({ faults }, "emulator faults changed");
    return { faults };
  });
  return app;
}

/** Throws 401 unless the X-Api-Key header matches (Moonraker, OctoPrint). */
export function checkApiKey(headerValue: unknown, expected: string | null): boolean {
  return expected === null || headerValue === expected;
}
