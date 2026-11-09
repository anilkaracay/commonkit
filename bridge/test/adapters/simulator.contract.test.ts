import { pino } from "pino";
import { SimulatorAdapter } from "../../src/adapters/simulator/simulator.js";
import { ManualClock } from "../../src/util/clock.js";
import { describeAdapterContract } from "../adapter.contract.js";
import { FIXTURES, tempDir } from "../helpers/harness.js";

for (const scenario of ["washer", "printer_3d", "laser_cutter", "community_fridge", "tractor"]) {
  describeAdapterContract(`simulator (${scenario})`, async () => {
    const stateDir = await tempDir();
    const clock = new ManualClock();
    const make = () =>
      new SimulatorAdapter(
        { scenario: `scenarios/${scenario}.yaml` },
        { assetId: `${scenario}-01.testnet`, stateDir, clock, logger: pino({ level: "silent" }), configDir: FIXTURES },
      );
    const adapter = make();
    return {
      adapter,
      completeSession: async (s) => {
        // Advance in small steps until done; bounded so a broken adapter fails instead of hanging.
        for (let i = 0; i < 10_000 && !(await adapter.sessionDone(s)); i++) clock.advance(1_000);
      },
      restart: async () => make(),
    };
  });
}
