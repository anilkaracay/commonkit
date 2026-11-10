import { TGAS } from '../../lib/config.js';
import { fileProfile, withRule } from '../lib/actions.js';
import { runAgentUntil } from '../lib/agent.js';
import type { DemoContext } from '../lib/context.js';
import type { DemoStep } from '../lib/runner.js';

const DEMO_INTERVAL_H = 1; // D-018: testnet time cannot be fast-forwarded

export const step20: DemoStep = {
  n: 20,
  title: 'Fridge Schedule cleaning (simulation): refused before the interval, opened by the agent after it',
  core: false,
  simulated: true,
  negative: true,
  async run(ctx: DemoContext) {
    const { cast, rec, gov } = ctx;
    const f = cast.fridge;
    const a = ctx.asset(f);
    const every = async () => (await a.profile()).rules.find((r) => r.rule_id === 'weekly_clean')?.trigger.Schedule?.every_hours;

    if (!ctx.own('before_refused') && (await every()) !== DEMO_INTERVAL_H) {
      const st = await a.rule('weekly_clean');
      rec.check('before: get_rule_status weekly_clean due=false with next_due_estimate (168 h interval)', !st.due && st.next_due_estimate !== null && st.open_task === null, st);
      const key = ctx.dep.function_call_keys.find((k) => k.account === cast.agent && k.receiver_id === f);
      if (!key) throw new Error('agent function-call key for fridge-01 missing in deployments');
      await ctx.refused('agent key: open_upkeep_task("weekly_clean") before the interval', 'E_RULE_NOT_DUE', cast.agent, f, 'open_upkeep_task', {
        rule_id: 'weekly_clean',
        rationale: 'Limits demo: the agent tries to open this task although the contract must refuse it.',
      }, { publicKey: key.public_key });
      rec.out('before_refused', '1');
    }
    if ((await every()) !== DEMO_INTERVAL_H) {
      const p = await a.profile();
      await gov.override(cast.dormB, f, [
        { method_name: 'set_profile', args: { profile: withRule(p, 'weekly_clean', { trigger: { Schedule: { every_hours: DEMO_INTERVAL_H } } }) }, gas: 30n * TGAS },
      ], [{ kind: 'override', rule_id: 'weekly_clean', value: `${DEMO_INTERVAL_H}h`, production: `${fileProfile('fridge-01').rules.find((r) => r.rule_id === 'weekly_clean')?.trigger.Schedule?.every_hours}h` }], 'D-018: testnet time cannot be fast-forwarded; 168 h covered by sandbox test inv_schedule_rule_due_only_after_interval');
    }
    let taskId = ctx.own('task_id') ?? (await a.rule('weekly_clean')).open_task;
    if (!taskId) {
      let st = await a.rule('weekly_clean');
      // The baseline is the asset's creation (or the last reward); wait for the demo interval to pass.
      if (!st.due && st.next_due_estimate) {
        await ctx.waitChain(BigInt(st.next_due_estimate) + 5_000_000_000n, 'for the 1 h demo interval to pass');
        st = await a.rule('weekly_clean');
      }
      rec.check(`after: ${DEMO_INTERVAL_H} h since the baseline → due`, st.due, st);
      const { result } = await runAgentUntil(f, cast.agent, 'step20', async (ev) => ev.find((e) => e.type === 'task_opened' && e.data.rule_id === 'weekly_clean') ?? null);
      rec.externalTx('agent open_upkeep_task("weekly_clean")', String(result.data.tx_hash), cast.agent);
      taskId = String(result.data.task_id);
    }
    rec.out('task_id', taskId);
    const t = await a.task(taskId);
    rec.eq('task_opened kind Cleaning, trigger Schedule, opened by the agent', { kind: t?.kind, trigger: Object.keys(t?.trigger ?? {})[0], by: t?.opened_by }, { kind: 'Cleaning', trigger: 'Schedule', by: cast.agent });
    rec.check(`due_value ≥ ${DEMO_INTERVAL_H} h`, (t?.due_value_at_open ?? 0) >= DEMO_INTERVAL_H, `due_value_at_open ${t?.due_value_at_open} h`);
    rec.check('rationale stored on chain', (t?.rationale.length ?? 0) > 20, t?.rationale);
  },
};
