import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { z } from "zod";

/** Reads a JSON state file and validates it; returns undefined if the file does not exist. */
export async function readStateFile<T>(path: string, schema: z.ZodType<T>): Promise<T | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  const parsed = schema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`state file ${path} is invalid: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** Atomic write: temp file + rename, so a crash never leaves a half-written state file. */
export async function writeStateFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await rename(tmp, path);
}

/** File-name-safe form of a NEAR account id. */
export function safeName(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, "_");
}
