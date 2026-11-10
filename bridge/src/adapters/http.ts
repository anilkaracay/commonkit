import { z } from "zod";
import { AdapterOfflineError } from "./types.js";

/** Device answered with an HTTP error (auth, bad request, busy). */
export class DeviceHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    message: string,
  ) {
    super(message);
    this.name = "DeviceHttpError";
  }
}

export interface DeviceRequest {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: RequestInit["body"];
  timeoutMs?: number;
}

/**
 * One HTTP call to a device, zod-validated (device responses are external input).
 * Network failures and timeouts become AdapterOfflineError; HTTP >= 400 becomes DeviceHttpError.
 */
export async function deviceJson<T>(url: string, schema: z.ZodType<T>, req: DeviceRequest = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: req.method ?? "GET",
      ...(req.headers ? { headers: req.headers } : {}),
      ...(req.body !== undefined ? { body: req.body } : {}),
      signal: AbortSignal.timeout(req.timeoutMs ?? 5_000),
    });
  } catch (err) {
    throw new AdapterOfflineError(`device unreachable at ${new URL(url).origin}: ${(err as Error).message}`);
  }
  const text = await res.text();
  if (res.status >= 400) {
    const what = res.status === 401 || res.status === 403 ? "authentication failed" : `HTTP ${res.status}`;
    throw new DeviceHttpError(res.status, text, `device ${what}: ${text.slice(0, 200)}`);
  }
  if (res.status === 204 || text === "") return schema.parse(null);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new DeviceHttpError(res.status, text, "device returned non-JSON");
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error(`unexpected device response from ${new URL(url).pathname}: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

/** Secrets never live in config files: config names an env var. */
export function secretFromEnv(env: NodeJS.ProcessEnv, name: string | undefined, what: string): string | null {
  if (!name) return null;
  const v = env[name];
  if (!v) throw new Error(`${what}: environment variable ${name} is not set`);
  return v;
}
