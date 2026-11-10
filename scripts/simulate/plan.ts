/**
 * What one simulated loop needs, from `profiles/<asset_type>.json` and `scenarios/<asset_type>.yaml`
 * (D-420). Pure apart from reading those two files; everything external is zod-validated.
 *
 * The scenario's top-level `simulate:` block (ignored by the bridge's simulator, whose zod schema
 * strips unknown keys) names the rule the loop drives and how the bridge runs the device.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

export const near = (s: string): bigint => {
  const [i, f = ''] = s.split('.');
  return BigInt(i!) * 10n ** 24n + BigInt((f + '0'.repeat(24)).slice(0, 24));
};
export const fmtNear = (y: bigint | string, digits = 3): string => {
  const v = BigInt(y);
  const neg = v < 0n;
  const a = neg ? -v : v;
  const s = `${a / 10n ** 24n}.${(a % 10n ** 24n).toString().padStart(24, '0').slice(0, digits)}`;
  return `${neg ? '-' : ''}${s} NEAR`;
};

const ruleSchema = z
  .object({
    rule_id: z.string(),
    kind: z.string(),
    trigger: z.object({
      Metric: z.object({ metric: z.string(), threshold: z.number() }).optional(),
      Schedule: z.object({ every_hours: z.number() }).optional(),
      Report: z.object({ min_reports: z.number() }).optional(),
    }),
    reward_rights: z.number(),
    reimbursable_max: z.string(),
    requires_verification_test: z.boolean(),
  })
  .passthrough();

export const contractProfileSchema = z
  .object({
    asset_type: z.string(),
    display_name: z.string(),
    group_id: z.string(),
    adapter: z.string(),
    slot_minutes: z.number().int().positive(),
    start_window_minutes: z.number().int().positive(),
    max_slots_per_reservation: z.number().int().positive(),
    price_per_slot: z.string(),
    deposit: z.string(),
    deposit_trusted: z.string(),
    trusted_after: z.number(),
    required_credential: z.string().nullable(),
    float_cap: z.string(),
    storage_reserve: z.string(),
    right_max_slots: z.number(),
    rules: z.array(ruleSchema),
  })
  .passthrough();
export type ContractProfile = z.infer<typeof contractProfileSchema>;

const profileFileSchema = z.object({
  profile: contractProfileSchema,
  meta: z
    .object({
      status: z.string(),
      pilot_overrides: z.record(z.string(), z.number()).default({}),
    })
    .passthrough(),
});

/** The `simulate:` block of a scenario file. */
export const simulateBlockSchema = z.object({
  /** The Metric rule this loop drives to "due" in one session. */
  rule: z.string(),
  /** simulator (default), or a real adapter against its device emulator. */
  device: z.enum(['simulator', 'moonraker_emulator', 'shelly_emulator']).default('simulator'),
  /** Emulator speed (device seconds per real second) for emulated devices. */
  emulator_speed: z.number().positive().max(10_000).default(120),
  /** Seconds the holder keeps a manual-end session (smart plug) before finishing it. */
  hold_seconds: z.number().positive().max(120).optional(),
  telemetry_interval_sec: z.number().int().positive().max(60).default(3),
  /** Bridge asset config `gauges` (D-410): gauge -> derived monotonic counters. */
  gauges: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))).optional(),
  /** Restock/Repair rules: the receipt amount claimed at submit (NEAR, <= reimbursable_max). */
  expense_near: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  /** Why this scenario crosses the rule in one session (printed). */
  note: z.string().max(300),
});
export type SimulateBlock = z.infer<typeof simulateBlockSchema>;

const scenarioHeadSchema = z
  .object({
    scenario: z.string(),
    simulated: z.literal(true),
    simulate: simulateBlockSchema,
  })
  .passthrough();

export interface Override {
  field: string;
  from: string | number;
  to: string | number;
  why: string;
}

export interface Plan {
  assetType: string;
  profileFile: string;
  scenarioFile: string;
  status: string;
  /** Profile as in the file (meta stripped): what `new` gets. */
  profile: ContractProfile;
  /** Profile after the demo overrides: what the DAO's `set_profile` proposal sets. */
  demoProfile: ContractProfile;
  overrides: Override[];
  sim: SimulateBlock;
  rule: z.infer<typeof ruleSchema>;
  expense: bigint;
}

export function listProfiles(repoRoot: string): string[] {
  return readdirSync(join(repoRoot, 'profiles'))
    .filter((f) => f.endsWith('.json') && f !== 'profile.schema.json')
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

/**
 * Demo overrides, applied on chain by a DAO `set_profile` proposal and printed (never silent):
 *  - `meta.pilot_overrides` (the profile's own demo thresholds: Metric threshold / Schedule hours);
 *  - slot length = start window, so the current slot can always start a session now (the Rust
 *    sandbox suite does the same, D-215). Fees per slot, deposits and caps are unchanged.
 */
export function demoProfileOf(profile: ContractProfile, pilot: Record<string, number>): { profile: ContractProfile; overrides: Override[] } {
  const overrides: Override[] = [];
  const rules = profile.rules.map((r) => {
    const v = pilot[r.rule_id];
    if (v === undefined) return r;
    if (r.trigger.Metric) {
      overrides.push({ field: `rules.${r.rule_id}.threshold (${r.trigger.Metric.metric})`, from: r.trigger.Metric.threshold, to: v, why: 'demo threshold (meta.pilot_overrides)' });
      return { ...r, trigger: { Metric: { ...r.trigger.Metric, threshold: v } } };
    }
    if (r.trigger.Schedule) {
      overrides.push({ field: `rules.${r.rule_id}.every_hours`, from: r.trigger.Schedule.every_hours, to: v, why: 'demo threshold (meta.pilot_overrides)' });
      return { ...r, trigger: { Schedule: { every_hours: v } } };
    }
    return r;
  });
  for (const k of Object.keys(pilot)) if (!profile.rules.some((r) => r.rule_id === k)) throw new Error(`pilot_overrides names unknown rule ${k}`);
  let slot = profile.slot_minutes;
  if (slot > profile.start_window_minutes) {
    overrides.push({ field: 'slot_minutes', from: slot, to: profile.start_window_minutes, why: 'sandbox shortcut: slot = start window, so a session can start now (D-215)' });
    slot = profile.start_window_minutes;
  }
  return { profile: { ...profile, slot_minutes: slot, rules }, overrides };
}

export function loadPlan(repoRoot: string, assetType: string): Plan {
  const profileFile = join(repoRoot, 'profiles', `${assetType}.json`);
  const scenarioFile = join(repoRoot, 'scenarios', `${assetType}.yaml`);
  const pf = profileFileSchema.parse(JSON.parse(readFileSync(profileFile, 'utf8')));
  const head = scenarioHeadSchema.safeParse(parseYaml(readFileSync(scenarioFile, 'utf8')));
  if (!head.success) throw new Error(`invalid ${scenarioFile}: ${head.error.message}`);
  if (pf.profile.asset_type !== assetType || head.data.scenario !== assetType) throw new Error(`${assetType}: asset_type / scenario id mismatch`);
  const sim = head.data.simulate;
  const { profile: demoProfile, overrides } = demoProfileOf(pf.profile, pf.meta.pilot_overrides);
  const rule = demoProfile.rules.find((r) => r.rule_id === sim.rule);
  if (!rule) throw new Error(`${assetType}: simulate.rule ${sim.rule} is not in the profile`);
  if (!rule.trigger.Metric) throw new Error(`${assetType}: simulate.rule ${sim.rule} must be a Metric rule`);
  const expense = sim.expense_near ? near(sim.expense_near) : 0n;
  if (expense > 0n) {
    if (rule.kind !== 'Restock' && rule.kind !== 'Repair') throw new Error(`${assetType}: expense only for Restock/Repair rules`);
    if (expense > BigInt(rule.reimbursable_max)) throw new Error(`${assetType}: expense above reimbursable_max`);
  }
  return { assetType, profileFile, scenarioFile, status: pf.meta.status, profile: pf.profile, demoProfile, overrides, sim, rule, expense };
}

/** Bridge asset config for this plan (JSON is valid YAML; `${EMU_*}` filled in by the emulated stack). */
export function bridgeAssetConfig(plan: Plan, assetId: string, bridgeDir: string): Record<string, unknown> {
  const g = (p: string) => join(bridgeDir, p);
  const common = {
    asset_id: assetId,
    telemetry_interval_sec: plan.sim.telemetry_interval_sec,
    session_poll_sec: 1,
    signer_env: 'SIM_BRIDGE_KEY',
    ...(plan.sim.gauges ? { gauges: plan.sim.gauges } : {}),
  };
  if (plan.sim.device === 'moonraker_emulator')
    return {
      ...common,
      adapter: 'moonraker',
      emulated_device: true,
      adapter_config: { base_url: '${EMU_MOONRAKER_URL}', api_key_env: 'EMU_MOONRAKER_API_KEY', default_job: g('gcode/demo_cube.gcode'), time_scale: plan.sim.emulator_speed, poll_ms: 500 },
      session_timeout_min: 60,
      verification_tests: { [plan.sim.rule]: { type: 'calibration_print', file: g('gcode/calibration_cube.gcode'), max_minutes: 15 } },
    };
  if (plan.sim.device === 'shelly_emulator')
    return {
      ...common,
      adapter: 'smart_plug',
      emulated_device: true,
      // poll_ms 100: the 60-device-second power test lasts 0.5 s at x120 and needs >= 3 samples.
      adapter_config: { vendor: 'shelly_gen2', base_url: '${EMU_SHELLY_URL}', session_end: 'manual', active_watts_threshold: 20, time_scale: plan.sim.emulator_speed, poll_ms: 100, report_temperature: true },
      safety: { dangerous: true, stand_in: 'emulated 60 W lamp-class load (stand-in for the laser cutter; nothing is energised)' },
      session_timeout_min: 60,
      verification_tests: { [plan.sim.rule]: { type: 'power_profile', expect: { min_watts: 40, max_watts: 80, seconds: 60 } } },
    };
  return { ...common, adapter: 'simulator', adapter_config: { scenario: plan.scenarioFile }, session_timeout_min: 60 };
}
