/** Child processes (bridge, agent, verify.sh) started by demo steps: output to a log file, clean stop. */
import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface Proc {
  child: ChildProcess;
  logFile: string;
  stop(): Promise<void>;
  exited: Promise<number | null>;
}

export function startProc(cmd: string, args: string[], opts: { cwd: string; env?: NodeJS.ProcessEnv; logFile: string }): Proc {
  mkdirSync(dirname(opts.logFile), { recursive: true });
  const log = createWriteStream(opts.logFile, { flags: 'a' });
  const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);
  const exited = new Promise<number | null>((res) => child.on('exit', (code) => res(code)));
  return {
    child,
    logFile: opts.logFile,
    exited,
    async stop() {
      if (child.exitCode !== null) return;
      child.kill('SIGTERM');
      const t = setTimeout(() => child.kill('SIGKILL'), 8000);
      await exited;
      clearTimeout(t);
    },
  };
}

/** Run to completion, capturing output. */
export function runProc(cmd: string, args: string[], opts: { cwd: string; env?: NodeJS.ProcessEnv }): Promise<{ code: number | null; out: string }> {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (out += d.toString()));
    child.on('error', rej);
    child.on('exit', (code) => res({ code, out }));
  });
}

/** Poll `probe` until it returns a value (not null/undefined) or the timeout passes. */
export async function waitFor<T>(what: string, probe: () => Promise<T | null | undefined>, timeoutMs: number, everyMs = 2000): Promise<T> {
  const until = Date.now() + timeoutMs;
  let lastErr: unknown;
  for (;;) {
    try {
      const v = await probe();
      if (v !== null && v !== undefined) return v;
    } catch (e) {
      lastErr = e;
    }
    if (Date.now() > until)
      throw new Error(`timed out after ${Math.round(timeoutMs / 1000)} s waiting for ${what}${lastErr ? ` (last error: ${(lastErr as Error).message})` : ''}`);
    await sleep(everyMs);
  }
}
