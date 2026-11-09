import { describe, expect, it } from "vitest";
import { MAX_METRICS, MAX_METRIC_NAME, type Adapter, type Metrics, type SessionContext } from "../src/adapters/types.js";

/**
 * Shared adapter contract (BRIDGE §4). Every adapter (simulator now; moonraker, octoprint,
 * smart_plug, manual_qr in Wave 3) runs this suite against its fake device.
 */
export interface ContractHarness {
  adapter: Adapter;
  /** Drives the fake device until the given session's use is complete. */
  completeSession(session: SessionContext): Promise<void>;
  /** Makes a fresh adapter instance over the same persisted state (restart). */
  restart?(): Promise<Adapter>;
}

const session = (n: number): SessionContext => ({
  sessionId: `contract-session-${n}`,
  assetId: "contract-asset.testnet",
  reservationId: BigInt(n),
  accountId: "alice.testnet",
  grantedAtChainNs: 1_800_000_000_000_000_000n,
});

function expectMonotonic(before: Metrics, after: Metrics): void {
  for (const [k, v] of Object.entries(before)) {
    expect(after[k], `metric ${k} disappeared`).toBeDefined();
    expect(after[k]! >= v, `metric ${k} decreased ${v} -> ${after[k]}`).toBe(true);
  }
}

export function describeAdapterContract(name: string, make: () => Promise<ContractHarness>): void {
  describe(`adapter contract: ${name}`, () => {
    it("starts locked and online after init (fail closed)", async () => {
      const { adapter } = await make();
      await adapter.init();
      const s = await adapter.status();
      expect(s.online).toBe(true);
      expect(s.locked).toBe(true);
      expect(s.busy).toBe(false);
      expect(typeof adapter.kind).toBe("string");
      expect(typeof adapter.simulated).toBe("boolean");
    });

    it("reports cumulative bigint metrics within contract limits", async () => {
      const { adapter } = await make();
      await adapter.init();
      const m = await adapter.readMetrics();
      const names = Object.keys(m);
      expect(names.length).toBeGreaterThan(0);
      expect(names.length).toBeLessThanOrEqual(MAX_METRICS);
      for (const [k, v] of Object.entries(m)) {
        expect(k.length).toBeLessThanOrEqual(MAX_METRIC_NAME);
        expect(k).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(typeof v).toBe("bigint");
        expect(v >= 0n).toBe(true);
      }
      if (adapter.simulated) expect(m.simulated).toBe(1n);
    });

    it("unlock -> busy and unlocked; sessionDone false until the use completes; lock -> locked", async () => {
      const h = await make();
      await h.adapter.init();
      const s = session(1);
      await h.adapter.unlock(s);
      const st = await h.adapter.status();
      expect(st.locked).toBe(false);
      expect(st.busy).toBe(true);
      expect(await h.adapter.sessionDone(s)).toBe(false);
      await h.completeSession(s);
      expect(await h.adapter.sessionDone(s)).toBe(true);
      await h.adapter.lock();
      expect((await h.adapter.status()).locked).toBe(true);
    });

    it("metrics never decrease across a full session, and the session adds usage", async () => {
      const h = await make();
      await h.adapter.init();
      const before = await h.adapter.readMetrics();
      const s = session(2);
      await h.adapter.unlock(s);
      const during = await h.adapter.readMetrics();
      expectMonotonic(before, during);
      await h.completeSession(s);
      await h.adapter.lock();
      const after = await h.adapter.readMetrics();
      expectMonotonic(during, after);
      const grew = Object.keys(before).some((k) => k !== "simulated" && after[k]! > before[k]!);
      expect(grew).toBe(true);
    });

    it("lock is idempotent and unlock for the same session is idempotent", async () => {
      const h = await make();
      await h.adapter.init();
      await h.adapter.lock();
      await h.adapter.lock();
      const s = session(3);
      await h.adapter.unlock(s);
      await h.adapter.unlock(s);
      await h.adapter.lock();
      await h.adapter.lock();
      expect((await h.adapter.status()).locked).toBe(true);
    });

    it("refuses a second concurrent session", async () => {
      const h = await make();
      await h.adapter.init();
      await h.adapter.unlock(session(4));
      await expect(h.adapter.unlock(session(5))).rejects.toThrow();
      await h.adapter.lock();
    });

    it("runVerification returns passed + a sha256 hex detailsHash", async () => {
      const h = await make();
      await h.adapter.init();
      const out = await h.adapter.runVerification({ type: "simulated" });
      expect(typeof out.passed).toBe("boolean");
      expect(out.detailsHash).toMatch(/^[0-9a-f]{64}$/);
      expect(typeof out.details).toBe("object");
    });

    it("after a restart the device is locked and counters did not go back", async () => {
      const h = await make();
      if (!h.restart) return;
      await h.adapter.init();
      const s = session(6);
      await h.adapter.unlock(s);
      await h.completeSession(s);
      await h.adapter.lock();
      const before = await h.adapter.readMetrics();
      const again = await h.restart();
      await again.init();
      expect((await again.status()).locked).toBe(true);
      expectMonotonic(before, await again.readMetrics());
    });
  });
}
