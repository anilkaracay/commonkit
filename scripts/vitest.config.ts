import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

// `@/…` is only used by Trezu's template engine, fetched outside the repo (see trezu/engine.ts).
const lock = JSON.parse(
  readFileSync(new URL('../integrations/trezu/engine.lock.json', import.meta.url), 'utf8'),
) as { commit: string };
const engineDir =
  process.env.TREZU_ENGINE_DIR ??
  join(tmpdir(), `commonkit-trezu-engine-${lock.commit.slice(0, 7)}`);

export default defineConfig({
  resolve: { alias: [{ find: /^@\/(.*)$/, replacement: `${engineDir}/nt-fe/$1` }] },
});
