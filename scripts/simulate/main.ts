/**
 * ./scripts/simulate.sh [<asset_type> | all] [--fake] [--summary <file>]
 *
 * SIMULATION ONLY (D-420). Default mode "sandbox": a private local NEAR sandbox node with the real
 * asset/commons WASMs and the real Sputnik DAO, the real bridge (simulator, or real adapters
 * against device emulators) and the real agent. `--fake`: the bridge's and the agent's in-memory
 * fake chains; no contract code runs. No keys, no testnet, no hardware either way.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { SandboxChain } from './chain.js';
import { runSandboxLoop, setupWorld, type LoopResult, type StepResult } from './loop.js';
import { listProfiles, loadPlan, type Plan } from './plan.js';
import { downloadSandboxBinary, locateSandboxBinary, startSandbox, SANDBOX_VERSION } from './sandbox.js';
import { formatProfileSummary, formatSetup, formatTable } from './report.js';
import { runFakeLoop } from './fake.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LABEL = '[SIMULATED]';
const log = (m: string): void => console.log(`${LABEL} ${m}`);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    fake: { type: 'boolean', default: false },
    summary: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

function usage(): void {
  const rows = listProfiles(REPO_ROOT).map((t) => {
    try {
      const p = loadPlan(REPO_ROOT, t);
      return `  ${t.padEnd(20)} ${p.rule.kind.padEnd(11)} ${p.rule.rule_id.padEnd(18)} ${p.sim.device.padEnd(18)} ${p.status}`;
    } catch (e) {
      return `  ${t.padEnd(20)} (scenario problem: ${(e as Error).message})`;
    }
  });
  console.log(`COMMONKIT simulation: run the whole upkeep loop yourself — no keys, no testnet, no hardware.

  ./scripts/simulate.sh <asset_type>     one profile on a local NEAR sandbox (real contracts + DAO)
  ./scripts/simulate.sh all              all 12 profiles, one after another, then a table
  ./scripts/simulate.sh <…> --fake       no sandbox binary: in-memory fake chains (contracts not exercised)
  ./scripts/simulate.sh <…> --summary f  also write the summary to file f

  asset_type           loop kind   rule               device             profile status
${rows.join('\n')}

Everything is SIMULATED: a private sandbox chain on 127.0.0.1 (near-sandbox ${SANDBOX_VERSION}), simulated or
emulated devices. Scenario files: scenarios/<asset_type>.yaml. Decision: docs/DECISIONS.md D-420.`);
}

function ensureWasm(): void {
  const need = ['contracts/target/near/commonkit_asset/commonkit_asset.wasm', 'contracts/target/near/commonkit_commons/commonkit_commons.wasm'];
  if (need.every((p) => existsSync(join(REPO_ROOT, p)))) return;
  log('contract WASMs missing → bash scripts/build-contracts.sh');
  const r = spawnSync('bash', [join(REPO_ROOT, 'scripts/build-contracts.sh')], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('scripts/build-contracts.sh failed');
}

async function runSandbox(plans: Plan[], runDir: string): Promise<{ results: LoopResult[]; setup: StepResult[] }> {
  ensureWasm();
  let bin = locateSandboxBinary(REPO_ROOT);
  if (!bin) {
    if (process.env.SIMULATE_NO_DOWNLOAD === '1') throw new Error(`near-sandbox ${SANDBOX_VERSION} not found and SIMULATE_NO_DOWNLOAD=1; use --fake`);
    bin = { path: await downloadSandboxBinary(log), source: 'downloaded (sha256 pinned)' };
  }
  log(`near-sandbox ${SANDBOX_VERSION}: ${bin.path} (${bin.source})`);
  const node = await startSandbox(bin.path, join(runDir, 'sandbox.log'));
  log(`local sandbox chain up at ${node.rpcUrl} (root ${node.rootAccount}; private, throw-away keys)`);
  try {
    const chain = new SandboxChain(node.rpcUrl, node.rootAccount, node.rootKey);
    const t = Date.now();
    const { world, steps } = await setupWorld({ chain, repoRoot: REPO_ROOT, runDir, plans, log });
    for (const s of steps) log(`  ${s.ok ? '✅' : '❌'} ${s.label}${s.tx ? `  tx ${s.tx}` : ''}`);
    log(`community set up in ${((Date.now() - t) / 1000).toFixed(1)} s; asset code_hash will be ${world.assetCodeHash}`);
    const results: LoopResult[] = [];
    for (const plan of plans) {
      log(`── ${plan.assetType}: ${plan.sim.note}`);
      results.push(await runSandboxLoop(world, plan));
    }
    return { results, setup: steps };
  } finally {
    await node.stop();
  }
}

async function main(): Promise<number> {
  const target = positionals[0];
  if (values.help || !target) {
    usage();
    return 0;
  }
  const all = listProfiles(REPO_ROOT);
  const types = target === 'all' ? all : [target];
  for (const t of types) if (!all.includes(t)) {
    console.error(`unknown asset_type ${t}; run ./scripts/simulate.sh for the list`);
    return 2;
  }
  const plans = types.map((t) => loadPlan(REPO_ROOT, t));
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = join(REPO_ROOT, 'bridge', 'state', 'simulate', runId);
  mkdirSync(runDir, { recursive: true });
  const mode = values.fake ? 'fake' : 'sandbox';
  log(
    mode === 'sandbox'
      ? 'SIMULATION on a private local NEAR sandbox: real asset/commons WASMs, real Sputnik DAO, real bridge + agent; simulated/emulated devices. Not testnet.'
      : 'SIMULATION on the in-memory FAKE chains of the bridge and the agent — contracts not exercised. Not testnet.',
  );
  const t0 = Date.now();
  let results: LoopResult[];
  let setup: StepResult[] = [];
  try {
    if (mode === 'sandbox') ({ results, setup } = await runSandbox(plans, runDir));
    else {
      results = [];
      for (const plan of plans) {
        log(`── ${plan.assetType}: ${plan.sim.note}`);
        results.push(await runFakeLoop(REPO_ROOT, plan, runDir, log));
      }
    }
  } catch (e) {
    console.error(`${LABEL} setup failed: ${(e as Error).message}`);
    if (mode === 'sandbox') console.error(`${LABEL} no sandbox? try: ./scripts/simulate.sh ${target} --fake`);
    return 2;
  }
  const text = [
    `COMMONKIT simulate.sh ${target} — ${mode === 'sandbox' ? `SIMULATED (local NEAR sandbox ${SANDBOX_VERSION}, real contracts + Sputnik DAO; simulated/emulated devices; not testnet)` : 'SIMULATED (fake chain — contracts not exercised)'}`,
    `run ${runId} on ${process.platform}-${process.arch}, node ${process.version}; total ${((Date.now() - t0) / 1000).toFixed(1)} s`,
    '',
    ...formatSetup(setup),
    ...(results.length === 1 ? formatProfileSummary(results[0]!) : formatTable(results)),
  ].join('\n');
  console.log(`\n${text}`);
  writeFileSync(join(runDir, 'summary.json'), JSON.stringify({ target, mode, results }, null, 2));
  writeFileSync(join(runDir, 'summary.txt'), `${text}\n`);
  if (values.summary) {
    mkdirSync(dirname(resolve(values.summary)), { recursive: true });
    writeFileSync(resolve(values.summary), `${text}\n`);
  }
  console.log(`\n${LABEL} logs: ${runDir}`);
  return results.every((r) => r.ok) ? 0 : 1;
}

process.exitCode = await main();
