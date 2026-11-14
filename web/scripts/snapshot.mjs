// Optional build-time Board placeholder. Same bounded public RPC source as the app.
// Any error or a 45s timeout removes stale output and leaves a working live-only build.
import { rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const root = fileURLToPath(new URL('..', import.meta.url));
const out = fileURLToPath(new URL('../src/data/snapshot/web-snapshot.json', import.meta.url));
rmSync(out, { force: true });
if (process.env.COMMONKIT_SKIP_WEB_SNAPSHOT === '1') {
  console.log('web snapshot skipped (live reads only)');
  process.exit(0);
}
const stop = setTimeout(() => {
  rmSync(out, { force: true });
  console.warn('web snapshot skipped: 45s timeout (live reads only)');
  process.exit(0);
}, 45_000);
let server;
try {
  server = await createServer({ root, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false } });
  const { recordSnapshot } = await server.ssrLoadModule('/src/data/snapshot/record.ts');
  const snap = await recordSnapshot(process.env.VITE_NEAR_RPC);
  writeFileSync(out, JSON.stringify(snap));
  console.log(`web snapshot: ${snap.board.assets.length} assets, read ${snap.read_at}`);
} catch (e) {
  rmSync(out, { force: true });
  console.warn(`web snapshot skipped (live reads only): ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await server?.close();
  clearTimeout(stop);
  // Failed parallel RPC reads can still have retry timers; this one-shot CLI must not hold a build open.
  process.exit(0);
}
