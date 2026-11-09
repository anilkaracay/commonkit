import { createHash } from "node:crypto";
import { z } from "zod";

/** NEAR account id rules (nearcore): 2..64 chars, lowercase alnum separated by single - _ or . */
const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export const accountIdSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(ACCOUNT_RE, "invalid NEAR account id");

/** u64 ids travel as decimal strings (U64 JSON); numbers are accepted for convenience. */
export const u64Schema = z
  .union([z.string().regex(/^\d{1,20}$/), z.number().int().nonnegative()])
  .transform((v) => BigInt(v))
  .refine((v) => v <= 0xffff_ffff_ffff_ffffn, "u64 overflow");

export const NS_PER_MS = 1_000_000n;
export const NS_PER_SEC = 1_000_000_000n;

export function nsToIso(ns: bigint): string {
  return new Date(Number(ns / NS_PER_MS)).toISOString();
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Deterministic JSON with sorted keys and bigint as decimal strings (for hashing). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortValue((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}
