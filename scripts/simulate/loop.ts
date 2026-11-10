/**
 * The SIMULATED upkeep loop on a local NEAR sandbox (D-420), with the real contracts, the real
 * Sputnik DAO, the real bridge (child process) and the real agent (child process):
 *
 *   deploy keyless asset → DAO wires it (register, operators, demo profile) → operator keys →
 *   [credential training] → reserve → NEP-413 access → session → rule due → agent opens task →
 *   claim → submit (+ capped expense) → bridge verification → independent approval → rights →
 *   reserve with the right → sweep to the DAO → clean return → ledger / keyless / code_hash.
 *
 * Every device here is a simulator or an emulator, and the chain is a private sandbox.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { baseEncode, type KeyPairString } from 'near-api-js';
import { BridgeClient } from '../demo/lib/bridge.js';
import { signNep413 } from '../demo/lib/nep413.js';
import { sleep, startProc, waitFor, type Proc } from '../demo/lib/procs.js';
import { NS_PER_MIN, reservationCost } from '../demo/lib/slots.js';
import type { Card, Ledger, Op, Reservation, RuleStatus, Task } from '../demo/lib/views.js';
import { AGENT_METHODS, BRIDGE_METHODS } from '../lib/topology.js';
import { NEAR, SandboxChain, SandboxDao, TGAS, type Tx } from './chain.js';
import { bridgeAssetConfig, fmtNear, type Plan } from './plan.js';
import { track } from './cleanup.js';
import { freePort } from './sandbox.js';

export interface StepResult {
  label: string;
  ok: boolean;
  tx: string | null;
  detail: string;
}

export interface LoopResult {
  assetType: string;
  assetId: string;
  mode: 'sandbox' | 'fake';
  /** "<rule_id> (<kind>)" the loop drove. */
  rule?: string;
  ok: boolean;
  ms: number;
  steps: StepResult[];
  codeHash: string | null;
  invariantOk: boolean | null;
  error: string | null;
}

export interface World {
  chain: SandboxChain;
  dao: SandboxDao;
  commons: string;
  council: string[];
  steward: string;
  verifier: string;
  trainer: string;
  /** Uses the asset. */
  ali: string;
  /** Does the upkeep. */
  ayse: string;
  bridge: string;
  agent: string;
  assetWasm: Uint8Array;
  /** base58(sha256(asset wasm)): what every asset account's code_hash must be. */
  assetCodeHash: string;
  repoRoot: string;
  runDir: string;
  log: (m: string) => void;
}

const sha256Hex = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
export const codeHashOf = (wasm: Uint8Array): string => baseEncode(createHash('sha256').update(wasm).digest());

const sub = (name: string, root: string) => `${name}.${root}`;

/** Accounts, DAO (council 2 of 3), commons, roles and credential kinds (one DAO proposal). */
export async function setupWorld(o: {
  chain: SandboxChain;
  repoRoot: string;
  runDir: string;
  plans: Plan[];
  log: (m: string) => void;
}): Promise<{ world: World; steps: StepResult[] }> {
  const { chain, repoRoot, log } = o;
  const root = chain.root;
  const steps: StepResult[] = [];
  const read = (p: string): Uint8Array => {
    const f = join(repoRoot, p);
    if (!existsSync(f)) throw new Error(`${p} missing (run scripts/build-contracts.sh)`);
    return new Uint8Array(readFileSync(f));
  };
  const assetWasm = read('contracts/target/near/commonkit_asset/commonkit_asset.wasm');
  const commonsWasm = read('contracts/target/near/commonkit_commons/commonkit_commons.wasm');
  const daoWasm = read('contracts/tests/res/sputnikdao2.wasm');
  const names = { c1: 50n, c2: 50n, c3: 50n, steward: 20n, verifier: 20n, trainer: 20n, ali: 300n, ayse: 100n, bridge: 10n, agent: 10n };
  const created: Tx[] = [];
  for (const [n, amt] of Object.entries(names)) created.push(await chain.createAccount(sub(n, root), amt * NEAR));
  steps.push({ label: `accounts: council c1..c3, steward, verifier, trainer, members ali + ayse, bridge, agent`, ok: true, tx: created[0]!.hash, detail: `${created.length} sandbox accounts` });
  const council = ['c1', 'c2', 'c3'].map((n) => sub(n, root));
  const daoId = sub('simlab-dao', root);
  const daoTx = await chain.createAndDeploy(daoId, 30n * NEAR, daoWasm, {
    method: 'new',
    args: { config: { name: 'simlab', purpose: 'COMMONKIT simulation (sandbox)', metadata: '' }, policy: council },
  });
  steps.push({ label: 'Sputnik DAO v2 (real sputnikdao2.wasm), council c1..c3, 2 of 3 votes', ok: daoTx.ok, tx: daoTx.hash, detail: daoId });
  const commons = sub('commons', root);
  const commonsTx = await chain.createKeyless(commons, 10n * NEAR, commonsWasm, {
    method: 'new',
    args: {
      dao_id: daoId,
      name: 'Simlab (simulation)',
      metadata: { spec: 'nft-1.0.0', name: 'Simlab cards (simulation)', symbol: 'SIM', icon: null, base_uri: null, reference: null, reference_hash: null },
    },
  });
  steps.push({ label: 'commons deployed keyless (real WASM)', ok: commonsTx.ok, tx: commonsTx.hash, detail: commons });
  const dao = new SandboxDao(chain, daoId, council);
  const roleActions = (
    [
      ['steward', ['steward']],
      ['verifier', ['verifier']],
      ['trainer', ['trainer']],
      ['c1', ['council']],
      ['c2', ['council']],
    ] as const
  ).map(([n, roles]) => ({ method_name: 'set_roles', args: { account: sub(n, root), roles }, gas: 15n * TGAS }));
  const kinds = new Map<string, string>();
  for (const p of o.plans) if (p.profile.required_credential) kinds.set(p.profile.required_credential, p.profile.group_id);
  const kindActions = [...kinds].map(([kind, group]) => ({
    method_name: 'set_credential_kind',
    args: {
      config: {
        kind,
        title: kind.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
        validity_days: 365,
        reward_group: group,
        trainer_reward_rights: 1,
        right_max_slots: 1,
        right_validity_days: 60,
      },
    },
    gas: 10n * TGAS,
  }));
  const actions = [...roleActions, ...kindActions];
  let lastProposal = '';
  for (let i = 0; i < actions.length; i += 8) {
    const r = await dao.pass('COMMONKIT simulation: roles and credential kinds', commons, actions.slice(i, i + 8));
    lastProposal = r.txs.at(-1)!.hash;
  }
  steps.push({ label: `DAO proposal: roles (steward, verifier, trainer, council)${kinds.size ? ` + credential kinds ${[...kinds.keys()].join(', ')}` : ''}`, ok: true, tx: lastProposal, detail: 'passed 2 of 3' });
  const world: World = {
    chain,
    dao,
    commons,
    council,
    steward: sub('steward', root),
    verifier: sub('verifier', root),
    trainer: sub('trainer', root),
    ali: sub('ali', root),
    ayse: sub('ayse', root),
    bridge: sub('bridge', root),
    agent: sub('agent', root),
    assetWasm,
    assetCodeHash: codeHashOf(assetWasm),
    repoRoot,
    runDir: o.runDir,
    log,
  };
  return { world, steps };
}

interface AgentEvent {
  type: string;
  simulated: boolean;
  data: Record<string, unknown>;
}

function agentEvents(dir: string): AgentEvent[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort()
    .flatMap((f) => readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean))
    .map((l) => JSON.parse(l) as AgentEvent);
}

const eventData = (tx: Tx, name: string): Record<string, unknown> | null => {
  const e = tx.events.find((x) => x.event === name);
  if (!e) return null;
  return (Array.isArray(e.data) ? e.data[0] : e.data) as Record<string, unknown>;
};
const mintedIds = (tx: Tx): string[] =>
  tx.events
    .filter((e) => e.event === 'nft_mint')
    .flatMap((e) => (Array.isArray(e.data) ? e.data : [e.data]) as { token_ids?: string[] }[])
    .flatMap((d) => d?.token_ids ?? []);

/** One profile's loop on an already set up world. Never throws: failures become ❌ steps. */
export async function runSandboxLoop(world: World, plan: Plan): Promise<LoopResult> {
  const t0 = Date.now();
  const { chain, log } = world;
  const assetId = `${plan.assetType.replace(/_/g, '-')}.${chain.root}`;
  const steps: StepResult[] = [];
  const procs: Proc[] = [];
  const untrack: Array<() => void> = [];
  const step = (label: string, ok: boolean, tx: Tx | string | null, detail = ''): void => {
    const hash = tx === null ? null : typeof tx === 'string' ? tx : tx.hash;
    steps.push({ label, ok, tx: hash, detail });
    log(`  ${ok ? '✅' : '❌'} ${label}${hash ? `  tx ${hash}` : ''}${detail ? `  (${detail})` : ''}`);
    if (!ok) throw new Error(`${label}: ${detail}`);
  };
  const v = <T>(m: string, args: object = {}) => chain.view<T>(assetId, m, args);
  let codeHash: string | null = null;
  let invariantOk: boolean | null = null;
  try {
    const p = plan.demoProfile;
    // 1. Keyless asset with the profile as written (meta stripped).
    const dep = await chain.createKeyless(assetId, BigInt(plan.profile.storage_reserve) + NEAR / 20n, world.assetWasm, {
      method: 'new',
      args: { dao_id: world.dao.id, commons_id: world.commons, profile: plan.profile },
    });
    step(`asset ${assetId} deployed keyless with profiles/${plan.assetType}.json`, dep.ok, dep);
    // 2. DAO wires it.
    const reg = await world.dao.pass(`COMMONKIT simulation: register ${plan.assetType}`, world.commons, [
      { method_name: 'register_asset', args: { asset_id: assetId, group_id: p.group_id }, gas: 100n * TGAS },
    ]);
    step(`DAO proposal #${reg.proposalId}: commons.register_asset (group ${p.group_id})`, true, reg.txs.at(-1)!);
    for (const o of plan.overrides) log(`     DEMO OVERRIDE ${o.field}: ${o.from} → ${o.to}  [${o.why}]`);
    const wire = await world.dao.pass(`COMMONKIT simulation: ${plan.assetType} operators + demo profile`, assetId, [
      { method_name: 'set_operators', args: { bridge_id: world.bridge, agent_id: world.agent }, gas: 10n * TGAS },
      { method_name: 'set_profile', args: { profile: p }, gas: 50n * TGAS },
    ]);
    const thr = plan.rule.trigger.Metric!;
    step(
      `DAO proposal #${wire.proposalId}: set_operators + set_profile (${plan.overrides.length} demo override${plan.overrides.length === 1 ? '' : 's'})`,
      true,
      wire.txs.at(-1)!,
      `${plan.rule.rule_id}: ${thr.metric} >= ${thr.threshold}${plan.overrides.some((o) => o.field.startsWith(`rules.${plan.rule.rule_id}.`)) ? ' (demo threshold)' : ' (profile threshold)'}`,
    );
    // 3. Operator keys: one function-call key per (operator, asset).
    const bk = await chain.addFunctionCallKey(world.bridge, assetId, BRIDGE_METHODS);
    const ak = await chain.addFunctionCallKey(world.agent, assetId, AGENT_METHODS);
    step('bridge + agent function-call keys (0-deposit, method-limited)', bk.tx.ok && ak.tx.ok, ak.tx);
    // 4. Credential (risky assets): trainer proposes, an independent verifier approves.
    const cred = p.required_credential;
    if (cred) {
      for (const who of [world.ali, world.ayse]) {
        const pr = await chain.call(world.trainer, world.commons, 'propose_credential', { trainee: who, kind: cred, notes_hash: sha256Hex(`simulated training ${cred} ${who}`) });
        const ap = await chain.call(world.verifier, world.commons, 'approve_credential', { training_id: String(pr.returnValue) }, { gas: 100n * TGAS });
        const has = await chain.view<boolean>(world.commons, 'has_credential', { account: who, kind: cred });
        step(`credential ${cred} for ${who.split('.')[0]} (trainer proposes, verifier approves)`, has, ap, `${mintedIds(ap).length} cards minted`);
      }
    }
    // 5. The real bridge (child process) with this asset.
    const bridgeDir = join(world.repoRoot, 'bridge');
    const runDir = join(world.runDir, plan.assetType);
    mkdirSync(runDir, { recursive: true });
    const port = await freePort();
    const cfg = {
      network: 'sandbox',
      rpc_url: chain.rpcUrl,
      bridge_account: world.bridge,
      chain: 'near',
      listen: { host: '127.0.0.1', port },
      state_dir: join(runDir, 'bridge-state'),
      evidence_dir: join(runDir, 'bridge-evidence'),
      cors_origins: [],
      signer: { deployments: join(runDir, 'no-deployments.json') },
      assets: [bridgeAssetConfig(plan, assetId, bridgeDir)],
    };
    const cfgPath = join(runDir, 'bridge.yaml');
    writeFileSync(cfgPath, `# GENERATED by scripts/simulate (SIMULATION, local sandbox chain)\n${JSON.stringify(cfg, null, 2)}\n`);
    const bridgeProc = startProc(
      join(bridgeDir, 'node_modules', '.bin', 'tsx'),
      ['src/emulated-stack.ts', '--config', cfgPath, '--speed', String(plan.sim.emulator_speed), '--moonraker-port', '0', '--shelly-port', '0'],
      { cwd: bridgeDir, env: { SIM_BRIDGE_KEY: bk.secret }, logFile: join(runDir, 'bridge.log') },
    );
    procs.push(bridgeProc);
    untrack.push(track({ stop: () => bridgeProc.stop(), kill: () => bridgeProc.child.kill('SIGKILL') }));
    const client = new BridgeClient(`http://127.0.0.1:${port}`, (account) => (pl) => signNep413(pl, chain.secretOf(account) as KeyPairString));
    const health = await waitFor(
      'bridge /health',
      async () => {
        if (bridgeProc.child.exitCode !== null) throw new Error(`bridge exited; see ${bridgeProc.logFile}`);
        const h = await client.request<{ chain: string; network: string; assets: { simulated: boolean; adapter: string }[] }>('GET', '/health').catch(() => null);
        return h?.status === 200 ? h.body : null;
      },
      60_000,
      500,
    );
    step(`bridge up: adapter ${health.assets[0]?.adapter}${plan.sim.device === 'simulator' ? '' : ` → ${plan.sim.device.replace('_', ' ')}`}, simulated=${health.assets[0]?.simulated}`, health.chain === 'near' && health.assets[0]?.simulated === true, null, `network ${health.network}`);
    // 6. Reserve the current slot (a fee + deposit), chain time.
    const slotNs = BigInt(p.slot_minutes) * NS_PER_MIN;
    let now = await chain.chainNowNs();
    if ((now / slotNs) * slotNs + BigInt(p.start_window_minutes) * NS_PER_MIN - now < 45_000_000_000n) {
      const wait = Number(((now / slotNs + 1n) * slotNs - now) / 1_000_000n) + 1500;
      log(`     waiting ${Math.round(wait / 1000)} s for the next slot (chain time)`);
      await sleep(wait);
      now = await chain.chainNowNs();
    }
    const slot = now / slotNs;
    const cost = reservationCost(p, 0, 1, false);
    const res = await chain.call(world.ali, assetId, 'reserve', { start_slot: slot.toString(), slots: 1, right_id: null }, { gas: 200n * TGAS, deposit: cost.total });
    const rid = String(res.returnValue ?? eventData(res, 'reservation_pending')?.reservation_id);
    const r1 = await v<Reservation | null>('get_reservation', { id: rid });
    step(`ali reserves slot ${slot} (fee ${fmtNear(cost.fee)} + deposit ${fmtNear(cost.deposit)})`, r1?.status === 'Confirmed', res, `reservation #${rid} ${r1?.status}`);
    // 7. NEP-413 signed access → session on the simulated/emulated device.
    const acc = await client.access(assetId, world.ali, rid);
    const sessionId = String(acc.body.session_id ?? '');
    const started = acc.status === 200 ? (await client.session(sessionId)).body : null;
    step('NEP-413 signed access → bridge 200, mark_session_started on chain', acc.status === 200 && sessionId !== '', started?.start_tx ?? null, acc.status === 200 ? `session ${sessionId}` : JSON.stringify(acc.body));
    if (plan.sim.hold_seconds) {
      await sleep(plan.sim.hold_seconds * 1000);
      const fin = await client.finish(sessionId, assetId, world.ali, rid);
      if (fin.status !== 200) step('holder ends the session (signed)', false, null, JSON.stringify(fin.body));
    }
    const sess = await client.waitSessionEnd(sessionId, 120_000);
    step(`session finished (${sess.finish_reason}); mark_session_finished with telemetry`, sess.simulated === true, sess.finish_tx, `simulated=${sess.simulated}`);
    // 8. Telemetry makes the rule due (bridge ticks every telemetry_interval_sec).
    const due = await waitFor(
      `${plan.rule.rule_id} to be due`,
      async () => {
        const s = (await v<RuleStatus[]>('get_rule_status')).find((x) => x.rule_id === plan.rule.rule_id);
        return s?.due ? s : null;
      },
      90_000,
      1000,
    );
    step(`on-chain telemetry: ${plan.rule.rule_id} due (${thr.metric} delta ${due.due_value} >= ${thr.threshold})`, true, null);
    // 9. The real agent opens the task with its rationale.
    const agentDir = join(world.repoRoot, 'agent');
    const agentRun = join(world.repoRoot, 'agent', 'state', 'simulate', world.runDir.split('/').pop()!, plan.assetType);
    mkdirSync(agentRun, { recursive: true });
    const alias = plan.assetType.toUpperCase();
    const agentCfg = {
      network: 'sandbox',
      agent_account: world.agent,
      chain: 'near',
      rpc_url: chain.rpcUrl,
      poll_seconds: 2,
      sync_every_seconds: 30,
      listen: { host: '127.0.0.1', port: await freePort() },
      cors_origins: [],
      state_dir: agentRun,
      evidence_dir: join(agentRun, 'evidence'),
      llm: { enabled: false },
      deployments: join(agentRun, 'no-deployments.json'),
      assets: [{ asset_id: assetId, alias, profile: plan.profileFile, simulated: true, supplier_is_team_account: true, purchase_hints: [] }],
    };
    const agentCfgPath = join(agentRun, 'agent.yaml');
    writeFileSync(agentCfgPath, `# GENERATED by scripts/simulate (SIMULATION, local sandbox chain)\n${JSON.stringify(agentCfg, null, 2)}\n`);
    const agentProc = startProc(join(agentDir, 'node_modules', '.bin', 'tsx'), ['src/main.ts', '--config', agentCfgPath], {
      cwd: agentDir,
      env: { [`AGENT_KEY_${alias}`]: ak.secret },
      logFile: join(agentRun, 'agent.log'),
    });
    procs.push(agentProc);
    untrack.push(track({ stop: () => agentProc.stop(), kill: () => agentProc.child.kill('SIGKILL') }));
    const opened = await waitFor(
      'the agent to open the task',
      async () => {
        if (agentProc.child.exitCode !== null) throw new Error(`agent exited; see ${agentProc.logFile}`);
        return agentEvents(agentCfg.evidence_dir).find((e) => e.type === 'task_opened' && e.data.rule_id === plan.rule.rule_id) ?? null;
      },
      90_000,
      1000,
    );
    await agentProc.stop();
    const taskId = String(opened.data.task_id);
    let task = await v<Task | null>('get_task', { id: taskId });
    step(
      `agent opens upkeep task #${taskId} (${task?.kind}, trigger Metric) with its function-call key`,
      task?.opened_by === world.agent && task?.manual === false && opened.simulated === true,
      String(opened.data.tx_hash ?? ''),
      `rationale: "${(task?.rationale ?? '').slice(0, 110)}${(task?.rationale ?? '').length > 110 ? '…' : ''}"`,
    );
    // 10. Claim and submit (evidence hash; Restock/Repair: a receipt within the cap).
    const claim = await chain.call(world.ayse, assetId, 'claim_task', { task_id: taskId });
    step(`ayse claims task #${taskId}`, claim.ok, claim);
    const evidence = { task_id: taskId, evidence_hash: sha256Hex(`simulated upkeep evidence ${assetId} #${taskId}`), evidence_uri: null };
    if (plan.expense > 0n) {
      const over = BigInt(plan.rule.reimbursable_max) + 1n;
      const bad = await chain.call(world.ayse, assetId, 'submit_task', { ...evidence, expense: over.toString(), receipt_hash: sha256Hex('simulated receipt (over cap)') }, { allowFailure: true });
      step(`expense above reimbursable_max ${fmtNear(plan.rule.reimbursable_max)} refused`, !bad.ok && /E_EXPENSE_CAP/.test(bad.failure ?? ''), bad, 'E_EXPENSE_CAP');
    }
    const submit = await chain.call(world.ayse, assetId, 'submit_task', {
      ...evidence,
      expense: plan.expense > 0n ? plan.expense.toString() : null,
      receipt_hash: plan.expense > 0n ? sha256Hex(`simulated receipt ${assetId} #${taskId}`) : null,
    });
    step(`ayse submits evidence hash${plan.expense > 0n ? ` + receipt for ${fmtNear(plan.expense)} (cap ${fmtNear(plan.rule.reimbursable_max)})` : ''}`, submit.ok, submit);
    // 11. Bridge verification test (claimer-signed request), when the rule requires it.
    if (plan.rule.requires_verification_test) {
      const start = await client.verify(assetId, taskId, world.ayse);
      if (start.status !== 202) step('bridge verification run', false, null, JSON.stringify(start.body));
      const run = await client.waitRun(String(start.body.run_id), 120_000);
      step('bridge verification test passed → submit_verification_result', run.passed === true && run.simulated === true, run.tx, `simulated=${run.simulated}`);
    }
    // 12. Independent approval (verifier ≠ claimer ≠ agent ≠ bridge); council if the profile asks.
    const ledgerBefore = await v<Ledger>('get_ledger');
    const approve = await chain.call(world.verifier, assetId, 'approve_task', { task_id: taskId }, { gas: 300n * TGAS });
    task = await v<Task | null>('get_task', { id: taskId });
    let rewardTx: Tx = approve;
    if (task?.status !== 'Rewarded' && task?.verifier && !task.council_approver) {
      rewardTx = await chain.call(world.council[0]!, assetId, 'council_approve_task', { task_id: taskId }, { gas: 300n * TGAS });
      step('council approves (profile or amount needs the council)', rewardTx.ok, rewardTx);
      task = await v<Task | null>('get_task', { id: taskId });
    }
    const minted = task?.minted_right_ids ?? [];
    step(
      `verifier approves → task Rewarded, ${minted.length} usage right${minted.length === 1 ? '' : 's'} minted (NEP-171)`,
      task?.status === 'Rewarded' && minted.length === plan.rule.reward_rights,
      approve,
      `rights ${minted.join(', ')}`,
    );
    if (plan.expense > 0n) {
      const ops = await v<Op[]>('get_ops', { from_index: '0', limit: 200 });
      const reimb = ops.find((o) => o.kind === 'Reimbursement' && o.ref_id === taskId);
      const after = await v<Ledger>('get_ledger');
      step(
        `reimbursement ${fmtNear(plan.expense)} paid to ayse from the float, never from deposits`,
        reimb?.status === 'Succeeded' && BigInt(reimb.amount) === plan.expense && after.deposits_held === ledgerBefore.deposits_held,
        rewardTx,
        `op #${reimb?.id} ${reimb?.status}`,
      );
    }
    // 13. Reserve with the earned right (deposit only, no fee).
    const rightId = minted[0]!;
    const rslot = (await chain.chainNowNs()) / slotNs + 2n;
    const rcost = reservationCost(p, 0, 1, true);
    const rres = await chain.call(world.ayse, assetId, 'reserve', { start_slot: rslot.toString(), slots: 1, right_id: rightId }, { gas: 200n * TGAS, deposit: rcost.total });
    const rrid = String(rres.returnValue ?? eventData(rres, 'reservation_pending')?.reservation_id);
    const rr = await v<Reservation | null>('get_reservation', { id: rrid });
    const card = await chain.view<Card | null>(world.commons, 'get_card', { token_id: rightId });
    step(`ayse reserves slot ${rslot} with right ${rightId} (fee 0, deposit ${fmtNear(rcost.deposit)})`, rr?.status === 'Confirmed' && card?.kind.status?.state === 'Locked', rres, `right ${card?.kind.status?.state}`);
    // 14. Fees (or a member's top-up) push the float over its cap → excess swept to the DAO.
    const led = await v<Ledger>('get_ledger');
    const need = BigInt(led.float_cap) - BigInt(led.float_free) + 1n;
    const daoBefore = await chain.balance(world.dao.id);
    let sweepTx: Tx;
    const price = BigInt(p.price_per_slot);
    const n = price > 0n ? Number((need + price - 1n) / price) : Infinity;
    if (need <= 0n) {
      sweepTx = await chain.call(world.ali, assetId, 'sweep', {});
    } else if (n <= p.max_slots_per_reservation) {
      const s0 = (await chain.chainNowNs()) / slotNs + 4n;
      const c = reservationCost(p, 0, n, false);
      sweepTx = await chain.call(world.ali, assetId, 'reserve', { start_slot: s0.toString(), slots: n, right_id: null }, { gas: 200n * TGAS, deposit: c.total });
      log(`     ali books ${n} more slot${n > 1 ? 's' : ''} ahead (fees ${fmtNear(c.fee)}) — the float passes its cap ${fmtNear(led.float_cap)}`);
    } else {
      const top = need + NEAR / 10n;
      sweepTx = await chain.call(world.ali, assetId, 'fund_float', {}, { deposit: top, gas: 100n * TGAS });
      log(`     fees alone cannot pass the cap in one booking; ali tops up the float with fund_float ${fmtNear(top)}`);
    }
    const swept = eventData(sweepTx, 'swept');
    const daoAfter = await chain.balance(world.dao.id);
    const ops = await v<Op[]>('get_ops', { from_index: '0', limit: 200 });
    const sweepOp = ops.filter((o) => o.kind === 'Sweep').at(-1);
    step(
      `float over its cap ${fmtNear(led.float_cap)} → excess swept to the DAO treasury`,
      swept !== null && sweepOp?.status === 'Succeeded' && sweepOp.to === world.dao.id && daoAfter > daoBefore,
      sweepTx,
      `Sweep op #${sweepOp?.id} ${fmtNear(sweepOp?.amount ?? '0')} ${sweepOp?.status}`,
    );
    // 15. Steward confirms ali's clean return; the deposit (a liability) goes back.
    const r = await v<Reservation | null>('get_reservation', { id: rid });
    if (r?.status === 'Finished') {
      const ret = await chain.call(world.steward, assetId, 'confirm_return', { id: rid, result: 'Clean' });
      const after = await v<Reservation | null>('get_reservation', { id: rid });
      step(`steward confirms a clean return; deposit ${fmtNear(r.deposit_paid)} refunded`, after?.status === 'Closed', ret);
    }
    // 16. Ledger invariant, keyless, same code.
    const final = await v<Ledger>('get_ledger');
    invariantOk = final.invariant_ok;
    codeHash = await chain.codeHash(assetId);
    const keys = await chain.accessKeys(assetId);
    step('ledger invariant_ok', final.invariant_ok, null, `float ${fmtNear(final.float_free)} / cap ${fmtNear(final.float_cap)}, deposits ${fmtNear(final.deposits_held)}`);
    step('asset account keyless (0 access keys)', keys.length === 0, null, `${keys.length} keys`);
    step('code_hash = sha256 of the local asset WASM', codeHash === world.assetCodeHash, null, codeHash);
    return { assetType: plan.assetType, assetId, mode: 'sandbox', rule: `${plan.rule.rule_id} (${plan.rule.kind})`, ok: true, ms: Date.now() - t0, steps, codeHash, invariantOk, error: null };
  } catch (e) {
    const msg = (e as Error).message;
    if (!steps.some((s) => !s.ok)) {
      steps.push({ label: 'loop aborted', ok: false, tx: null, detail: msg });
      log(`  ❌ ${msg}`);
    }
    return { assetType: plan.assetType, assetId, mode: 'sandbox', rule: `${plan.rule.rule_id} (${plan.rule.kind})`, ok: false, ms: Date.now() - t0, steps, codeHash, invariantOk, error: msg };
  } finally {
    for (const pr of procs.reverse()) await pr.stop();
    for (const u of untrack) u();
  }
}
