import { join } from "node:path";
import type { z } from "zod";
import { readStateFile, safeName, writeStateFile } from "../util/state-file.js";

/** Adapter-private persistent state in bridge/state/<asset>.<kind>.json (zod-validated on load). */
export class AdapterState<T> {
  value: T;
  private readonly path: string;

  constructor(
    stateDir: string,
    assetId: string,
    kind: string,
    private readonly schema: z.ZodType<T>,
    initial: T,
  ) {
    this.path = join(stateDir, `${safeName(assetId)}.${kind}.json`);
    this.value = initial;
  }

  async load(): Promise<T> {
    const saved = await readStateFile(this.path, this.schema);
    if (saved !== undefined) this.value = saved;
    return this.value;
  }

  async save(): Promise<void> {
    await writeStateFile(this.path, this.value);
  }
}
