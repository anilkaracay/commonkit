import { randomBytes } from "node:crypto";
import { base32nopad } from "@scure/base";
import { z } from "zod";
import { AdapterState } from "../state.js";
import type { Adapter, AdapterContext, DeviceStatus, Metrics, SessionContext, VerificationOutcome } from "../types.js";

export const manualQrConfigSchema = z.object({
  /** Length of the one-time handover code shown to the holder as a QR. */
  code_length: z.number().int().min(6).max(16).default(8),
});
export type ManualQrConfig = z.infer<typeof manualQrConfigSchema>;

const stateSchema = z.object({
  locked: z.boolean(),
  uses: z.number().int().nonnegative(),
  current: z
    .object({
      session_id: z.string(),
      holder: z.string(),
      handover_code: z.string(),
      handed_over_by: z.string().nullable(),
      returned_by: z.string().nullable(),
    })
    .nullable(),
});
type State = z.infer<typeof stateSchema>;

export type ConfirmStep = "handover" | "return";

/**
 * No electronics (BRIDGE §4.4): a steward hands the item over and takes it back.
 * unlock creates a one-time handover code the holder shows as a QR; the steward confirms the
 * handover (with that code) and later the return, each with a NEP-413 signed request that the bridge
 * checks against the steward role on chain (never the holder). Metric: `uses` (counted on return).
 */
export class ManualQrAdapter implements Adapter {
  readonly kind = "manual_qr";
  readonly simulated = false;
  private readonly state: AdapterState<State>;

  constructor(
    private readonly config: ManualQrConfig,
    ctx: AdapterContext,
  ) {
    this.state = new AdapterState(ctx.stateDir, ctx.assetId, "manual_qr", stateSchema, { locked: true, uses: 0, current: null });
  }

  async init(): Promise<void> {
    await this.state.load();
    if (!this.state.value.current) this.state.value.locked = true;
    await this.state.save();
  }

  async status(): Promise<DeviceStatus> {
    const c = this.state.value.current;
    return {
      online: true,
      locked: this.state.value.locked,
      busy: c !== null,
      details: { handed_over: Boolean(c?.handed_over_by), returned: Boolean(c?.returned_by) },
    };
  }

  async unlock(session: SessionContext): Promise<void> {
    const c = this.state.value.current;
    if (c?.session_id === session.sessionId) return;
    if (c) throw new Error(`item is out with session ${c.session_id}`);
    const code = base32nopad.encode(new Uint8Array(randomBytes(16))).slice(0, this.config.code_length);
    this.state.value = {
      ...this.state.value,
      locked: false,
      current: { session_id: session.sessionId, holder: session.accountId, handover_code: code, handed_over_by: null, returned_by: null },
    };
    await this.state.save();
  }

  async sessionInfo(session: SessionContext): Promise<Record<string, unknown>> {
    const c = this.state.value.current;
    if (!c || c.session_id !== session.sessionId) return {};
    return { manual_qr: { handover_code: c.handover_code, show_to: "steward", handed_over: c.handed_over_by !== null } };
  }

  /** Steward confirmation; the bridge has already verified the signature and the steward role. */
  async confirm(sessionId: string, step: ConfirmStep, steward: string, code: string | null): Promise<void> {
    const c = this.state.value.current;
    if (!c || c.session_id !== sessionId) throw new Error("no such active handover");
    if (steward === c.holder) throw new Error("the holder cannot confirm their own handover or return");
    if (step === "handover") {
      if (code !== c.handover_code) throw new Error("handover code does not match");
      c.handed_over_by = steward;
    } else {
      if (!c.handed_over_by) throw new Error("item was never handed over");
      if (!c.returned_by) {
        c.returned_by = steward;
        this.state.value.uses += 1;
      }
    }
    await this.state.save();
  }

  async lock(): Promise<void> {
    this.state.value.current = null;
    this.state.value.locked = true;
    await this.state.save();
  }

  async readMetrics(): Promise<Metrics> {
    return { uses: BigInt(this.state.value.uses) };
  }

  async sessionDone(session: SessionContext): Promise<boolean> {
    const c = this.state.value.current;
    if (!c || c.session_id !== session.sessionId) return true;
    return c.returned_by !== null;
  }

  async runVerification(): Promise<VerificationOutcome> {
    throw new Error("manual_qr has no automated verification test; the verifier inspects the item in person");
  }
}
