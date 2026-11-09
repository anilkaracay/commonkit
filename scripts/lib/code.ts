/** WASM artifacts: size, sha256 and the base58 code_hash NEAR reports in view_account. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { baseEncode } from 'near-api-js';
import { REPO_ROOT, WASM_PATHS } from './config.js';
import type { CodeEntry } from './deployments.js';

export interface Wasm {
  bytes: Uint8Array;
  entry: CodeEntry;
}

/** Pure: NEAR code_hash = base58(sha256(wasm)). */
export function codeHash(wasm: Uint8Array): string {
  return baseEncode(createHash('sha256').update(wasm).digest());
}

export function sha256Hex(wasm: Uint8Array): string {
  return createHash('sha256').update(wasm).digest('hex');
}

function gitHead(): string | undefined {
  try {
    return execFileSync('git', ['-C', REPO_ROOT, 'rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return undefined;
  }
}

export function loadWasm(which: keyof typeof WASM_PATHS): Wasm {
  const path = WASM_PATHS[which];
  if (!existsSync(path))
    throw new Error(`${which} wasm missing at ${path} — run pnpm build:contracts`);
  const bytes = new Uint8Array(readFileSync(path));
  const commit = gitHead();
  return {
    bytes,
    entry: {
      path: relative(REPO_ROOT, path),
      bytes: bytes.length,
      sha256: sha256Hex(bytes),
      code_hash: codeHash(bytes),
      build: process.env.BUILD_MODE === 'reproducible-wasm' ? 'reproducible' : 'non-reproducible',
      ...(commit ? { git_commit: commit } : {}),
    },
  };
}

/** Method names exported by a cargo-near build, from the ABI JSON next to the wasm. */
export function abiMethods(which: keyof typeof WASM_PATHS): string[] {
  const abiPath = WASM_PATHS[which].replace(/\.wasm$/, '_abi.json');
  if (!existsSync(abiPath)) return [];
  const abi = JSON.parse(readFileSync(abiPath, 'utf8')) as {
    body: { functions: { name: string }[] };
  };
  return abi.body.functions.map((f) => f.name);
}
