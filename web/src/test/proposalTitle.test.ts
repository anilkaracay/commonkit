import { describe, expect, it } from 'vitest';
import { proposalTitle } from '../lib/proposalTitle';

describe('proposal titles derived from on-chain descriptions', () => {
  it.each([
    ['COMMONKIT demo step 20 (dorm-b): demo override weekly_clean 1h (production 168h) on fridge-01 — D-018: testnet time cannot be fast-forwarded', 'Demo override · fridge-01 weekly_clean 1 h (production 168 h)'],
    ['COMMONKIT demo step 18 (makerlab): demo override filament_spool 5000 (production 330000) on printer-01 — demo-lowered', 'Demo override · printer-01 filament_spool 5,000 (production 330,000)'],
    ['COMMONKIT demo step 16 (makerlab): DEMO OVERRIDE printer-01: bed_level threshold 1 job so one rule is due (restored below)', 'Demo override · printer-01 bed_level threshold 1 job'],
    ['COMMONKIT demo step 16 (makerlab): restore printer-01 profile (bed_level threshold) after the duplicate-task demo', 'Restore · printer-01 bed_level'],
    ['COMMONKIT demo step 16 (dorm-b): restore washer-01 profile after the quota demo', 'Restore · washer-01 profile'],
    [
      "COMMONKIT escalation printer-01.makerlab.commonkit-sxflo.testnet#0: Nozzle kit for 'nozzle_clean': 1 rewarded tasks so far. Amount 4 NEAR. Receiver supplier.commonkit-sxflo.testnet is a team account.",
      'Nozzle kit purchase · 4 NEAR to supplier',
    ],
    ["COMMONKIT demo step 1 (makerlab): printer-01 profile (demo override nozzle_clean 1800 s, from the profile's pilot_overrides) + fund_float 2 NEAR", 'Profile · printer-01 with demo override nozzle_clean 1,800 s · 2 NEAR float'],
    ['COMMONKIT demo step 16 (makerlab): set_operators laser-01: agent revoked (agent_id = null); restored below', 'Operators · laser-01 agent revoked'],
    ['COMMONKIT demo step 16 (makerlab): set_operators laser-01: restore bridge + agent after the revocation demo', 'Operators · laser-01 bridge + agent restored'],
    ['COMMONKIT seed (makerlab): set roles for elif, mehmet, ayse, burak', 'Roles · Ellie, Mark, Ava, Ben'],
    ['COMMONKIT demo step 14 (makerlab): set_roles elif: steward, council, trainer (precondition for step 14)', 'Roles · Ellie: steward, council, trainer'],
    ['COMMONKIT seed (makerlab): fund_storage commons.makerlab.commonkit-sxflo.testnet 0.5 NEAR', 'Storage · 0.5 NEAR to commons'],
    ['COMMONKIT seed (dorm-b): restore washer-01 ledger invariant after key deletion gas (0.001 NEAR)', 'Top-up · 0.001 NEAR to washer-01 (key deletion gas)'],
    ['COMMONKIT seed (makerlab): register_asset laser-01 in makerlab-fab', 'Register · laser-01 in makerlab-fab'],
    ['COMMONKIT seed (dorm-b): fund_float fridge-01 0.5 NEAR', 'Float · 0.5 NEAR to fridge-01'],
    ['COMMONKIT seed (makerlab): credential kind laser_safety', 'Credential kind · laser_safety'],
  ])('%s', (description, title) => {
    expect(proposalTitle(description)).toBe(title);
  });

  it('falls back to a clean, short line without decision ids', () => {
    expect(proposalTitle('Buy a new drum belt — D-123: note')).toBe('Buy a new drum belt');
  });
});
