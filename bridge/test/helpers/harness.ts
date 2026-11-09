import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { pino, type Logger } from "pino";
import { Bridge } from "../../src/bridge.js";
import { FakeChainClient } from "../../src/chain/fake.js";
import { parseConfig, type BridgeConfig } from "../../src/config.js";
import { ManualClock } from "../../src/util/clock.js";

export const FIXTURES = fileURLToPath(new URL("../fixtures/", import.meta.url));
export const WASHER = "washer-01.dorm-b.testnet";
export const BRIDGE_ACCOUNT = "bridge-01.makerlab.testnet";

export async function tempDir(prefix = "ck-bridge-"): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

/** pino logger that keeps every line (parsed JSON) for assertions. */
export function captureLogger(): { logger: Logger; lines: Array<Record<string, unknown>> } {
  const lines: Array<Record<string, unknown>> = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      for (const l of chunk.toString("utf8").split("\n")) if (l.trim()) lines.push(JSON.parse(l) as Record<string, unknown>);
      cb();
    },
  });
  return { logger: pino({ level: "debug" }, stream), lines };
}

export function washerConfig(stateDir: string, evidenceDir: string, extra = ""): BridgeConfig {
  const yaml = `
network: testnet
bridge_account: ${BRIDGE_ACCOUNT}
chain: fake
state_dir: ${stateDir}
evidence_dir: ${evidenceDir}
cors_origins: ["*"]
assets:
  - asset_id: ${WASHER}
    adapter: simulator
    adapter_config: { scenario: scenarios/washer.yaml }
    telemetry_interval_sec: 5
    session_timeout_min: 120
${extra}`;
  return parseConfig(yaml, FIXTURES, {});
}

export interface Harness {
  bridge: Bridge;
  chain: FakeChainClient;
  clock: ManualClock;
  lines: Array<Record<string, unknown>>;
  stateDir: string;
  evidenceDir: string;
  nonces: Uint8Array[];
  /** Advances local and chain time together. */
  advance(ms: number): void;
}

export async function makeHarness(opts: { stateDir?: string; chain?: FakeChainClient; clock?: ManualClock } = {}): Promise<Harness> {
  const stateDir = opts.stateDir ?? (await tempDir());
  const evidenceDir = await tempDir("ck-evidence-");
  const clock = opts.clock ?? new ManualClock();
  const chain = opts.chain ?? new FakeChainClient();
  const { logger, lines } = captureLogger();
  const nonces: Uint8Array[] = [];
  let counter = 0;
  const bridge = new Bridge({
    config: washerConfig(stateDir, evidenceDir),
    chain,
    logger,
    clock,
    wallNow: () => clock.now(),
    random: (n) => {
      const next = nonces.shift();
      if (next) return next;
      const b = new Uint8Array(n);
      b[0] = ++counter;
      return b;
    },
    retry: { attempts: 2, baseDelayMs: 10 },
    chainClockMaxAgeMs: 0,
  });
  await bridge.init();
  return {
    bridge,
    chain,
    clock,
    lines,
    stateDir,
    evidenceDir,
    nonces,
    advance(ms: number) {
      clock.advance(ms);
      chain.advanceMs(ms);
    },
  };
}
