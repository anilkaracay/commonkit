/**
 * A local NEAR sandbox node for `./scripts/simulate.sh` (D-420). SIMULATION ONLY: a private
 * single-node chain on 127.0.0.1 with throw-away keys. It is never testnet and never mainnet.
 *
 * Binary: nearcore `near-sandbox` 2.14.0, the version the Rust sandbox suite already uses
 * (crate near-sandbox 0.4.0 in contracts/Cargo.lock). Lookup order:
 *   1. NEAR_SANDBOX_BIN (or NEAR_SANDBOX_BIN_PATH, the near-sandbox-rs override)
 *   2. ~/.near/near-sandbox-2.14.0/near-sandbox (near-sandbox-rs default location)
 *   3. a copy the Rust suite downloaded under contracts/target (pnpm test:contracts:int)
 *   4. our cache (~/.cache/commonkit/near-sandbox-2.14.0), else download it there from NEAR's
 *      build bucket (the URL near-sandbox-rs uses); the archive's sha256 must match the pin below.
 * Nothing is vendored or redistributed.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

export const SANDBOX_VERSION = '2.14.0';

/** sha256 of `near-sandbox.tar.gz` per platform, measured 2026-11-10 (D-420). */
export const SANDBOX_ARCHIVE_SHA256: Record<string, string> = {
  'Darwin-arm64': 'ea53448ef97540c012e5c3d967c74d78292b0465a98cf7027811a936718fe232',
  'Linux-x86_64': 'a0ba004218b218bd74351795e7ce2eda4a2b6af5cd3e252bd5e8bfe3c8f2e691',
  'Linux-aarch64': 'd6b1ff773895972cd2fa098193c5d6cbc046912ff40bfe860e6c7abe807deedb',
};

export const ROOT_ACCOUNT = 'test.near';

export function sandboxPlatform(): string | null {
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'Darwin-arm64';
  if (process.platform === 'linux' && process.arch === 'x64') return 'Linux-x86_64';
  if (process.platform === 'linux' && process.arch === 'arm64') return 'Linux-aarch64';
  return null;
}

const archiveUrl = (platform: string): string =>
  `https://s3-us-west-1.amazonaws.com/build.nearprotocol.com/nearcore/${platform}/${SANDBOX_VERSION}/near-sandbox.tar.gz`;

const cacheDir = (): string =>
  join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'commonkit', `near-sandbox-${SANDBOX_VERSION}`);

function isExecutable(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** `contracts/target/<profile>/build/near-sandbox-<hash>/out/.near/near-sandbox-<v>/near-sandbox`. */
function findCargoCopy(repoRoot: string): string | null {
  const target = join(repoRoot, 'contracts', 'target');
  for (const profile of ['debug', 'release']) {
    const build = join(target, profile, 'build');
    if (!existsSync(build)) continue;
    for (const d of readdirSync(build).filter((x) => x.startsWith('near-sandbox-'))) {
      const p = join(build, d, 'out', '.near', `near-sandbox-${SANDBOX_VERSION}`, 'near-sandbox');
      if (isExecutable(p)) return p;
    }
  }
  return null;
}

/** An already present binary, or null (no download). */
export function locateSandboxBinary(repoRoot: string): { path: string; source: string } | null {
  const env = process.env.NEAR_SANDBOX_BIN || process.env.NEAR_SANDBOX_BIN_PATH;
  if (env) return isExecutable(env) ? { path: env, source: 'NEAR_SANDBOX_BIN' } : null;
  const home = join(homedir(), '.near', `near-sandbox-${SANDBOX_VERSION}`, 'near-sandbox');
  if (isExecutable(home)) return { path: home, source: '~/.near' };
  const cached = join(cacheDir(), 'near-sandbox');
  if (isExecutable(cached)) return { path: cached, source: 'cache' };
  const cargo = findCargoCopy(repoRoot);
  if (cargo) return { path: cargo, source: 'contracts/target (Rust sandbox suite)' };
  return null;
}

/** Downloads the pinned archive into the cache, checks its sha256 and extracts the binary. */
export async function downloadSandboxBinary(log: (m: string) => void): Promise<string> {
  const platform = sandboxPlatform();
  if (!platform) throw new Error(`no near-sandbox ${SANDBOX_VERSION} build for ${process.platform}-${process.arch}; use --fake`);
  const want = SANDBOX_ARCHIVE_SHA256[platform]!;
  const dir = cacheDir();
  mkdirSync(dir, { recursive: true });
  const work = mkdtempSync(join(dir, 'dl-'));
  try {
    const url = archiveUrl(platform);
    log(`downloading near-sandbox ${SANDBOX_VERSION} (${platform}) from ${url}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
    if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
    const archive = join(work, 'near-sandbox.tar.gz');
    const hash = createHash('sha256');
    const out = createWriteStream(archive);
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      hash.update(chunk);
      if (!out.write(chunk)) await new Promise<void>((r) => out.once('drain', () => r()));
    }
    await new Promise<void>((r, j) => out.end((e?: Error | null) => (e ? j(e) : r())));
    const got = hash.digest('hex');
    if (got !== want) throw new Error(`near-sandbox archive sha256 ${got} does not match the pin ${want}; refusing to run it`);
    const tar = spawnSync('tar', ['xzf', archive, '-C', work], { stdio: 'inherit' });
    if (tar.status !== 0) throw new Error('could not extract near-sandbox.tar.gz');
    const bin = join(work, platform, 'near-sandbox');
    if (!isExecutable(bin)) throw new Error('near-sandbox binary missing in the archive');
    chmodSync(bin, 0o755);
    renameSync(bin, join(dir, 'near-sandbox'));
    return join(dir, 'near-sandbox');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export async function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const s = createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      s.close(() => res(port));
    });
  });
}

const keyFileSchema = z.object({ account_id: z.string(), public_key: z.string(), secret_key: z.string().startsWith('ed25519:') });

export interface SandboxNode {
  rpcUrl: string;
  home: string;
  rootAccount: string;
  /** `ed25519:<secret>` of the root account (a throw-away sandbox key). */
  rootKey: string;
  binary: string;
  stop(): Promise<void>;
}

/** `near-sandbox init --fast` in a fresh temp home, then `run` on free local ports. */
export async function startSandbox(binary: string, logFile: string): Promise<SandboxNode> {
  const home = mkdtempSync(join(tmpdir(), 'commonkit-sandbox-'));
  const init = spawnSync(binary, ['--home', home, 'init', '--fast'], { encoding: 'utf8' });
  if (init.status !== 0) throw new Error(`near-sandbox init failed: ${init.stderr}`);
  // Big enough for the asset WASM in one RPC request (near-sandbox-rs sets the same limit).
  const cfgPath = join(home, 'config.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as { rpc?: { limits_config?: Record<string, unknown> }; store?: Record<string, unknown> };
  cfg.rpc = { ...(cfg.rpc ?? {}), limits_config: { ...(cfg.rpc?.limits_config ?? {}), json_payload_max_size: 1024 * 1024 * 1024 } };
  cfg.store = { ...(cfg.store ?? {}), max_open_files: 3000 };
  writeFileSync(cfgPath, JSON.stringify(cfg));
  const key = keyFileSchema.parse(JSON.parse(readFileSync(join(home, 'validator_key.json'), 'utf8')));
  const rpcPort = await freePort();
  const netPort = await freePort();
  const log = createWriteStream(logFile, { flags: 'a' });
  const child: ChildProcess = spawn(binary, ['--home', home, 'run', '--rpc-addr', `127.0.0.1:${rpcPort}`, '--network-addr', `127.0.0.1:${netPort}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NEAR_ENABLE_SANDBOX_LOG: '0' },
  });
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);
  const exited = new Promise<void>((r) => child.once('exit', () => r()));
  const rpcUrl = `http://127.0.0.1:${rpcPort}`;
  const stop = async (): Promise<void> => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      const t = setTimeout(() => child.kill('SIGKILL'), 5000);
      await exited;
      clearTimeout(t);
    }
    rmSync(home, { recursive: true, force: true });
  };
  const until = Date.now() + 30_000;
  for (;;) {
    if (child.exitCode !== null) {
      await stop();
      throw new Error(`near-sandbox exited (${child.exitCode}); see ${logFile}`);
    }
    try {
      const r = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'block', params: { finality: 'final' } }),
        signal: AbortSignal.timeout(1000),
      });
      const body = (await r.json()) as { result?: { header?: { height?: number } } };
      if ((body.result?.header?.height ?? 0) > 2) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > until) {
      await stop();
      throw new Error(`near-sandbox did not answer on ${rpcUrl} within 30 s; see ${logFile}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { rpcUrl, home, rootAccount: key.account_id, rootKey: key.secret_key, binary, stop };
}
