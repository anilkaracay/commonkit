import { randomBytes } from "node:crypto";
import { base32nopad } from "@scure/base";
import { z } from "zod";
import { AdapterState } from "../state.js";
import type { Adapter, AdapterContext, DeviceStatus, Metrics, SessionContext, VerificationOutcome } from "../types.js";

export const manualQrConfigSchema = z.object({
  /** Length of the one-time handover code shown to the holder as a QR. */
  code_length: z.number().int().min(6).max(16).default(8),
  /** Web app base for QR deep links, e.g. https://commonkit.example/app (no trailing slash). */
  app_base_url: z.url().default("http://localhost:5173/app"),
});

export type DeepLinkAction = "reserve" | "return" | "fault";

/** Deep links into the web app (`/app/a/<assetId>?action=...`). The sticker on the item carries these. */
export function itemLinks(appBase: string, assetId: string): Record<DeepLinkAction, string> {
  const base = `${appBase.replace(/\/+$/, "")}/a/${encodeURIComponent(assetId)}`;
  return { reserve: `${base}?action=reserve`, return: `${base}?action=return`, fault: `${base}?action=fault` };
}
export type ManualQrConfig = z.infer<typeof manualQrConfigSchema>;

const loanSchema = z.object({
  session_id: z.string(),
  holder: z.string(),
  handover_code: z.string(),
  handed_over_by: z.string().nullable(),
  returned_by: z.string().nullable(),
});
type Loan = z.infer<typeof loanSchema>;

const stateSchema = z.object({
  locked: z.boolean(),
  uses: z.number().int().nonnegative(),
  current: loanSchema.nullable(),
  /** Handed over, session already over (deadline), not yet returned: the steward can still confirm the return. */
  outstanding: z.array(loanSchema).default([]),
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
    this.state = new AdapterState(ctx.stateDir, ctx.assetId, "manual_qr", stateSchema, { locked: true, uses: 0, current: null, outstanding: [] });
    this.assetId = ctx.assetId;
  }

  private readonly assetId: string;

  /** Sticker links for this item. */
  links(): Record<DeepLinkAction, string> {
    return itemLinks(this.config.app_base_url, this.assetId);
  }

  /** Public view of the current loan for the steward's app (never the handover code). */
  currentLoan(): { session_id: string; holder: string; handed_over: boolean; returned: boolean } | null {
    const c = this.state.value.current;
    return c ? { session_id: c.session_id, holder: c.holder, handed_over: c.handed_over_by !== null, returned: c.returned_by !== null } : null;
  }

  outstandingLoans(): Array<{ session_id: string; holder: string; handed_over_by: string | null }> {
    return this.state.value.outstanding.map((l) => ({ session_id: l.session_id, holder: l.holder, handed_over_by: l.handed_over_by }));
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
      details: { handed_over: Boolean(c?.handed_over_by), returned: Boolean(c?.returned_by), outstanding: this.state.value.outstanding.length },
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
    const base = itemLinks(this.config.app_base_url, this.assetId).reserve.replace("?action=reserve", "");
    const handoverLink = `${base}?action=confirm&step=handover&session=${encodeURIComponent(c.session_id)}&code=${c.handover_code}`;
    return {
      manual_qr: {
        handover_code: c.handover_code,
        /** Shown as a QR on the holder's phone; the steward scans it, signs, and the bridge confirms the handover. */
        handover_link: handoverLink,
        show_to: "steward",
        handed_over: c.handed_over_by !== null,
        /** Return: the steward scans the item sticker (action=return) and confirms. */
        return_link: this.links().return,
      },
    };
  }

  /** Steward confirmation; the bridge has already verified the signature and the steward role. */
  async confirm(sessionId: string, step: ConfirmStep, steward: string, code: string | null): Promise<void> {
    const out = this.state.value.outstanding.find((l) => l.session_id === sessionId);
    if (out && step === "return") return this.confirmOutstandingReturn(out, steward);
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

  private async confirmOutstandingReturn(l: Loan, steward: string): Promise<void> {
    if (steward === l.holder) throw new Error("the holder cannot confirm their own handover or return");
    l.returned_by = steward;
    this.state.value.uses += 1;
    this.state.value.outstanding = this.state.value.outstanding.filter((x) => x !== l);
    await this.state.save();
  }

  /** Session over. An item that was handed over and not returned stays "outstanding" for a later return. */
  async lock(): Promise<void> {
    const c = this.state.value.current;
    if (c?.handed_over_by && !c.returned_by) this.state.value.outstanding.push(c);
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
