import { describe, expect, it } from "vitest";
import type { RuleStatus, Trigger, UpkeepKind, UpkeepRule } from "../src/chain/types.js";
import { withSource } from "../src/agent.js";
import { ago, buildFacts, scaled, templateRationale } from "../src/rationale/templates.js";

const NEAR = 10n ** 24n;

function render(
  kind: UpkeepKind,
  trigger: Trigger,
  dueValue: bigint,
  title: string,
  rights: number,
  extra: { reimbursable?: bigint; cash?: bigint; completedBefore?: number; outOfService?: boolean } = {},
): string {
  const status: RuleStatus = {
    ruleId: "r",
    kind,
    trigger,
    current: dueValue,
    baseline: 0n,
    dueValue,
    due: true,
    nextDueEstimate: null,
    openTask: null,
    rewardRights: rights,
    rewardCash: extra.cash ?? 0n,
    reimbursableMax: extra.reimbursable ?? 0n,
  };
  const rule: UpkeepRule = {
    ruleId: "r",
    kind,
    trigger,
    title,
    rewardRights: rights,
    rewardCash: extra.cash ?? 0n,
    reimbursableMax: extra.reimbursable ?? 0n,
    requiresVerificationTest: false,
    claimTimeoutHours: 72,
  };
  const ctx = { assetName: "Test asset", completedBefore: extra.completedBefore ?? 1, outOfService: extra.outOfService ?? false };
  return templateRationale(buildFacts(status, rule, ctx), status, ctx.completedBefore);
}

describe("template per UpkeepKind (exact numbers from the facts)", () => {
  it("Maintenance (Metric, seconds shown as hours, truncated)", () => {
    expect(render("Maintenance", { type: "Metric", metric: "nozzle_seconds", threshold: 720_000n }, 764_640n, "Clean the nozzle and run a calibration print", 2)).toBe(
      "Nozzle time since last maintenance: 212.4 h (threshold 200 h). Opening 'Clean the nozzle and run a calibration print' with reward: 2 usage rights.",
    );
  });

  it("Restock (Metric, mm shown as m, reimbursement sentence)", () => {
    expect(
      render("Restock", { type: "Metric", metric: "filament_used_mm", threshold: 330_000n }, 334_000n, "Load a new filament spool", 1, { reimbursable: NEAR / 2n }),
    ).toBe(
      "Filament used since last restock: 334 m (threshold 330 m). Opening 'Load a new filament spool' with reward: 1 usage right; a receipt of up to 0.5 NEAR can be reimbursed.",
    );
  });

  it("Cleaning (Schedule, days)", () => {
    expect(render("Cleaning", { type: "Schedule", everyHours: 168 }, 168n, "Empty, clean and sanitize the fridge", 2)).toBe(
      "Last cleaning 7 days ago (every 168 h). Opening 'Empty, clean and sanitize the fridge' with reward: 2 usage rights.",
    );
  });

  it("Inspection (Metric, km)", () => {
    expect(render("Inspection", { type: "Metric", metric: "km", threshold: 300n }, 312n, "Check and adjust the brakes", 2)).toBe(
      "Distance since last check: 312 km (threshold 300 km). Opening 'Check and adjust the brakes' with reward: 2 usage rights.",
    );
  });

  it("Repair (Report, parts reimbursement, out of service)", () => {
    expect(
      render("Repair", { type: "Report", minReports: 2 }, 2n, "Diagnose and repair the reported fault", 3, { reimbursable: NEAR / 2n, outOfService: true }),
    ).toBe(
      "2 members reported a fault (needed: 2). Opening 'Diagnose and repair the reported fault' with reward: 3 usage rights; parts up to 0.5 NEAR can be reimbursed with a receipt. The asset stays out of service until the repair is approved and rewarded.",
    );
  });

  it("Rebalance (Report, singular)", () => {
    expect(render("Rebalance", { type: "Report", minReports: 1 }, 1n, "Bring the bike back to its home spot", 1)).toBe(
      "1 member reported the asset away from its home spot (needed: 1). Opening 'Bring the bike back to its home spot' with reward: 1 usage right.",
    );
  });

  it("Supervision (Schedule, first time: no invented 'last' date)", () => {
    expect(render("Supervision", { type: "Schedule", everyHours: 168 }, 170n, "Host the weekly open-room evening", 2, { completedBefore: 0 })).toBe(
      "No supervised session recorded in the last 170 h (every 168 h). Opening 'Host the weekly open-room evening' with reward: 2 usage rights.",
    );
  });

  it("cash reward is mentioned only when > 0; reimbursement only when reimbursable_max > 0", () => {
    const withCash = render("Cleaning", { type: "Metric", metric: "uses", threshold: 20n }, 20n, "Clean", 1, { cash: NEAR / 10n });
    expect(withCash).toContain("with reward: 1 usage right and 0.1 NEAR.");
    expect(withCash).not.toContain("reimbursed");
  });

  it("formatting helpers never round up", () => {
    expect(scaled(719_999n, 3600n)).toBe("199.9");
    expect(scaled(720_000n, 3600n)).toBe("200");
    expect(ago(47n)).toBe("47 h");
    expect(ago(50n)).toBe("2 days 2 h");
  });

  it("rationale with source suffix stays within 1000 chars", () => {
    const long = render("Cleaning", { type: "Metric", metric: "uses", threshold: 20n }, 21n, "x".repeat(200), 1);
    expect(long.length).toBeLessThan(1000);
    const clipped = withSource("y".repeat(1200), "llm");
    expect(clipped.length).toBe(1000);
    expect(clipped.endsWith(" [rationale: llm]")).toBe(true);
  });
});
