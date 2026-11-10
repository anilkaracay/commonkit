import { runAgentUntil } from '../lib/agent.js';
import type { DemoContext } from '../lib/context.js';
import type { DemoStep } from '../lib/runner.js';

export const step07: DemoStep = {
  n: 7,
  title: 'Telemetry crossed nozzle_clean; the agent opens the upkeep task with a rationale',
  core: true,
  simulated: true,
  negative: false,
  async run(ctx: DemoContext) {
    const { cast, rec } = ctx;
    const a = ctx.asset(cast.printer);
    let status = await a.rule('nozzle_clean');
    let taskId = status.open_task;
    if (taskId) rec.note(`nozzle_clean task #${taskId} was already open (earlier attempt)`);
    else {
      rec.check('nozzle_clean is due from on-chain telemetry (emulated Moonraker counters)', status.due, status);
      if (!status.due) return;
      const { result } = await runAgentUntil(cast.printer, cast.agent, 'step7', async (events) => {
        const e = events.find((x) => x.type === 'task_opened' && x.data.rule_id === 'nozzle_clean');
        return e ?? null;
      });
      rec.externalTx('agent open_upkeep_task("nozzle_clean") with its function-call key', String(result.data.tx_hash), cast.agent);
      taskId = String(result.data.task_id);
      status = await a.rule('nozzle_clean');
    }
    rec.out('task_id', taskId);
    const t = await a.task(taskId);
    rec.eq('task_opened: kind Maintenance, trigger Metric, opened by the agent, not manual', { kind: t?.kind, trigger: Object.keys(t?.trigger ?? {})[0], by: t?.opened_by, manual: t?.manual }, { kind: 'Maintenance', trigger: 'Metric', by: cast.agent, manual: false });
    rec.check('rationale stored on chain', (t?.rationale.length ?? 0) > 20, t?.rationale);
    rec.eq('reward: 2 usage rights', t?.reward_rights, 2);
    rec.check('due value at open ≥ threshold', (t?.due_value_at_open ?? 0) >= 1800, `due_value_at_open ${t?.due_value_at_open}`);
    rec.eq('rule now blocked by this open task', status.open_task, taskId);
  },
};
