/** NEP-297 event decoding for COMMONKIT logs (`EVENT_JSON:` prefix). */
import { z } from 'zod';

export const EVENT_PREFIX = 'EVENT_JSON:';
export const COMMONKIT_STANDARD = 'commonkit';
export const COMMONKIT_VERSION = '1.0.0';

const eventSchema = z.object({
  standard: z.string(),
  version: z.string(),
  event: z.string(),
  data: z.unknown().optional(),
});

export type Nep297Event = z.infer<typeof eventSchema>;

/** Decode one log line. Returns null for non-event logs or malformed JSON. */
export function decodeEventLog(log: string): Nep297Event | null {
  if (!log.startsWith(EVENT_PREFIX)) return null;
  try {
    const parsed = eventSchema.safeParse(JSON.parse(log.slice(EVENT_PREFIX.length)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Decode all events from a list of logs, optionally filtered by standard (e.g. "commonkit", "nep171"). */
export function decodeEvents(logs: readonly string[], standard?: string): Nep297Event[] {
  return logs
    .map(decodeEventLog)
    .filter((e): e is Nep297Event => e !== null && (!standard || e.standard === standard));
}
