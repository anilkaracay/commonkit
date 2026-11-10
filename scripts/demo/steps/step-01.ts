import { nearToYocto } from '@commonkit/sdk';
import { TGAS } from '../../lib/config.js';
import { fileProfile, metricThreshold, withRule } from '../lib/actions.js';
import { near, type DemoContext } from '../lib/context.js';
import type { DemoStep } from '../lib/runner.js';

const FLOAT = nearToYocto('2'); // D-021: printer demo float 2 NEAR (cap 3)
/** profiles/printer_3d.json meta.pilot_overrides.nozzle_clean (demo override; real value 720 000 s). */
const NOZZLE_DEMO_THRESHOLD = 1800;

/** printer-01 profile for the demo: the file profile with the nozzle_clean demo override. */
export function printerDemoProfile() {
  return withRule(fileProfile('printer-01'), 'nozzle_clean', {
    trigger: { Metric: { metric: 'nozzle_seconds', threshold: NOZZLE_DEMO_THRESHOLD } },
  });
}

export const step01: DemoStep = {
  n: 1,
  title: 'DAO proposal registers printer-01, sets its profile and funds its float',
  core: false,
  simulated: false,
  negative: false,
  async run(ctx: DemoContext) {
    const { cast, gov } = ctx;
    const c = cast.makerlab;
    const printer = cast.printer;
    const a = ctx.asset(printer);
    const commons = ctx.commons(c);
    const group = fileProfile('printer-01').group_id as string;

    const reg = await commons.asset(printer);
    if (reg?.active) ctx.rec.note('printer-01 was already registered (earlier attempt); not proposed again');
    else
      await gov.call(c, `register_asset printer-01 in ${group}`, c.commons, [
        { method_name: 'register_asset', args: { asset_id: printer, group_id: group }, gas: 100n * TGAS },
      ]);

    const [profile, ledger] = await Promise.all([a.profile(), a.ledger()]);
    const actions = [];
    if (metricThreshold(profile, 'nozzle_clean') !== NOZZLE_DEMO_THRESHOLD)
      actions.push({ method_name: 'set_profile', args: { profile: printerDemoProfile() }, gas: 30n * TGAS });
    if (BigInt(ledger.float_free) === 0n) actions.push({ method_name: 'fund_float', args: {}, deposit: FLOAT, gas: 60n * TGAS });
    let daoBefore: bigint | null = null;
    if (actions.length) {
      if (actions.some((x) => x.method_name === 'fund_float')) await gov.ensureTreasury(c, FLOAT);
      daoBefore = await ctx.balance(c.dao);
      await gov.call(
        c,
        `printer-01 profile (demo override nozzle_clean ${NOZZLE_DEMO_THRESHOLD} s, from the profile's pilot_overrides) + fund_float ${near(FLOAT)}`,
        printer,
        actions,
      );
    } else ctx.rec.note('profile and float were already set (earlier attempt); not proposed again');

    const [reg2, p2, l2, wiring] = await Promise.all([commons.asset(printer), a.profile(), a.ledger(), a.wiring()]);
    ctx.rec.eq('printer-01 registered and active in its group', { active: reg2?.active, group: reg2?.group_id }, { active: true, group });
    ctx.rec.eq('nozzle_clean threshold (demo override, labelled)', metricThreshold(p2, 'nozzle_clean'), NOZZLE_DEMO_THRESHOLD);
    const float = BigInt(l2.float_free);
    ctx.rec.check('float funded with 2 NEAR (plus reconciled account slack, D-204) and ≤ cap 3 NEAR', float >= FLOAT && float <= BigInt(l2.float_cap), `float_free ${near(float)}, cap ${near(l2.float_cap)}`);
    ctx.rec.check('ledger invariant holds', l2.invariant_ok);
    ctx.rec.check('profile_version advanced by the DAO', wiring.profile_version >= 2, `profile_version ${wiring.profile_version}`);
    const stewardRoles = await a.roles(c.steward);
    ctx.rec.check('commons pushed the community roles to printer-01 (steward present)', stewardRoles.includes('steward'), stewardRoles);
    if (daoBefore !== null) {
      const daoAfter = await ctx.balance(c.dao);
      ctx.rec.check('DAO treasury decreased by the float', daoBefore - daoAfter >= FLOAT - nearToYocto('0.05'), `${near(daoBefore)} → ${near(daoAfter)}`);
    }
    ctx.rec.out('float_after_step1', float);
  },
};
