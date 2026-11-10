import cors from "@fastify/cors";
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import { z } from "zod";
import { signedRequestSchema, type SignedRequest } from "../access/verifier.js";
import type { Bridge } from "../bridge.js";
import { BridgeError } from "../errors.js";
import { toJson, type BridgeEvent } from "../events/bus.js";
import { standIn, type Session } from "../sessions/manager.js";
import { labelled } from "../util/log.js";
import { accountIdSchema, nsToIso, u64Schema } from "../util/near.js";
import type { ManualQrAdapter } from "../adapters/manual_qr/manual_qr.js";
import type { VerificationRun } from "../verification/runner.js";

const challengeBodySchema = z
  .object({
    asset_id: accountIdSchema,
    account_id: accountIdSchema,
    action: z.enum(["access", "finish", "verify", "confirm"]).default("access"),
    reservation_id: u64Schema.optional(),
    task_id: u64Schema.optional(),
  })
  .superRefine((b, ctx) => {
    if (b.action !== "verify" && b.reservation_id === undefined) {
      ctx.addIssue({ code: "custom", path: ["reservation_id"], message: "required for access, finish and confirm" });
    }
    if (b.action === "verify" && b.task_id === undefined) {
      ctx.addIssue({ code: "custom", path: ["task_id"], message: "required for verify" });
    }
  });

const idParam = z.object({ id: z.string().min(1).max(64) });
const verifyParams = z.object({ asset: accountIdSchema, task_id: u64Schema });

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new BridgeError(400, "BAD_REQUEST", z.prettifyError(r.error));
  return r.data;
}

/** JSON-safe view of a session (bigint -> string). */
function sessionView(s: Session, simulated: boolean): unknown {
  return JSON.parse(
    toJson({
      session_id: s.id,
      asset_id: s.assetId,
      reservation_id: s.reservationId,
      account_id: s.accountId,
      public_key: s.publicKey,
      key_permission: s.keyPermission,
      status: s.status,
      finish_reason: s.finishReason,
      started_at_chain_ns: s.startedAtChainNs,
      started_at_iso: nsToIso(s.startedAtChainNs),
      deadline_chain_ns: s.deadlineChainNs,
      deadline_iso: nsToIso(s.deadlineChainNs),
      start_tx: s.startTx,
      finish_tx: s.finishTx,
      metrics_at_start: s.metricsAtStart,
      metrics_at_end: s.metricsAtEnd,
      simulated,
    }),
  );
}

function runView(r: VerificationRun): unknown {
  return JSON.parse(
    toJson({
      run_id: r.id,
      asset_id: r.assetId,
      task_id: r.taskId,
      rule_id: r.ruleId,
      account_id: r.accountId,
      test: r.test,
      status: r.status,
      passed: r.outcome?.passed ?? null,
      details_hash: r.outcome?.detailsHash ?? null,
      details: r.outcome?.details ?? null,
      tx: r.tx,
      error: r.error,
      simulated: r.simulated,
    }),
  );
}

/** BRIDGE_AND_ADAPTERS §3. Every body and param is zod-validated; every rejection has a precise reason. */
export async function buildServer(bridge: Bridge): Promise<FastifyInstance> {
  const app = Fastify({ loggerInstance: labelled(bridge.logger, bridge.chain.kind === "fake", { component: "http" }) as FastifyBaseLogger });
  await app.register(cors, { origin: bridge.config.cors_origins.length > 0 ? bridge.config.cors_origins : false });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof BridgeError) {
      return reply.status(err.status).send({ ok: false, reason: err.reason, detail: err.detail });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send({ ok: false, reason: "BAD_REQUEST", detail: (err as Error).message });
    }
    bridge.logger.error({ err: (err as Error).message }, "unhandled error");
    return reply.status(500).send({ ok: false, reason: "INTERNAL", detail: "internal error" });
  });

  const asset = (id: string) => {
    const rt = bridge.assets.get(id);
    if (!rt) throw new BridgeError(404, "UNKNOWN_ASSET", id);
    return rt;
  };

  app.get("/health", async () => {
    const assets = await Promise.all(
      [...bridge.assets.values()].map(async (rt) => {
        const status = await rt.adapter.status().catch(() => null);
        return { asset_id: rt.config.asset_id, adapter: rt.adapter.kind, online: status?.online ?? false, simulated: rt.simulated };
      }),
    );
    return { ok: true, network: bridge.config.network, bridge_account: bridge.config.bridge_account, chain: bridge.chain.kind, assets };
  });

  app.get("/assets", async () => {
    return Promise.all(
      [...bridge.assets.values()].map(async (rt) => {
        const status = await rt.adapter.status().catch((err: unknown) => ({ error: (err as Error).message }));
        const session = bridge.sessions.activeFor(rt.config.asset_id);
        return JSON.parse(
          toJson({
            asset_id: rt.config.asset_id,
            adapter: rt.adapter.kind,
            simulated: rt.simulated,
            ...standIn(rt),
            status,
            occupancy: rt.occupancy,
            session: session ? { id: session.id, reservation_id: session.reservationId, account_id: session.accountId } : null,
            counters: rt.counters.snapshot(),
            // Live levels (not on chain raw; derived counters are). Labelled like everything else.
            gauges: rt.adapter.readGauges ? await rt.adapter.readGauges().catch(() => rt.gauges.liveValues()) : null,
          }),
        ) as unknown;
      }),
    );
  });

  app.post("/access/challenge", async (req) => {
    const body = parse(challengeBodySchema, req.body);
    asset(body.asset_id);
    let now: bigint;
    try {
      now = await bridge.chainClock.now();
    } catch (err) {
      throw new BridgeError(503, "CHAIN_UNAVAILABLE", (err as Error).message);
    }
    let c;
    try {
      c = bridge.challenges.issue(
        {
          action: body.action,
          assetId: body.asset_id,
          accountId: body.account_id,
          ...(body.reservation_id !== undefined ? { reservationId: body.reservation_id } : {}),
          ...(body.task_id !== undefined ? { taskId: body.task_id } : {}),
        },
        now,
      );
    } catch (err) {
      throw new BridgeError(429, "TOO_MANY_CHALLENGES", (err as Error).message);
    }
    return {
      nonce: c.nonce,
      message: c.message,
      recipient: c.recipient,
      action: c.action,
      expires_at: c.expiresAtNs.toString(),
      expires_at_iso: nsToIso(c.expiresAtNs),
    };
  });

  const signed = (body: unknown): SignedRequest => {
    const b = parse(signedRequestSchema, body);
    asset(b.asset_id);
    return b;
  };

  app.post("/access", async (req) => {
    const body = signed(req.body);
    const { challenge, keyPermission } = await bridge.verifier.verify(body, "access");
    const { session, resumed } = await bridge.sessions.start({
      assetId: challenge.assetId,
      reservationId: challenge.reservationId as bigint,
      accountId: challenge.accountId,
      publicKey: body.public_key,
      keyPermission,
    });
    bridge.bus.emit({
      type: "access_granted",
      assetId: challenge.assetId,
      simulated: bridge.isSimulated(challenge.assetId),
      data: {
        session_id: session.id,
        reservation_id: session.reservationId,
        account_id: session.accountId,
        key_permission: keyPermission.kind,
        resumed,
      },
    });
    const rt = asset(challenge.assetId);
    const device = rt.adapter.sessionInfo ? await rt.adapter.sessionInfo(bridge.sessions.contextOf(session)) : {};
    return { ok: true, session_id: session.id, resumed, key_permission: keyPermission.kind, device, simulated: rt.simulated };
  });

  /**
   * manual_qr (BRIDGE §4.4): a steward confirms the handover (with the holder's one-time code) or the
   * return. NEP-413 signed by the steward (action "confirm"); the steward role is read from the asset
   * contract (`get_roles`), and the adapter refuses the holder. No electronics are involved.
   */
  app.post("/manual/:asset/:session_id/confirm", async (req) => {
    const params = parse(z.object({ asset: accountIdSchema, session_id: z.string().min(1).max(64) }), req.params);
    const extra = parse(z.object({ step: z.enum(["handover", "return"]), code: z.string().max(32).optional() }), req.body);
    const body = signed(req.body);
    const rt = asset(params.asset);
    const manual = rt.adapter as Partial<ManualQrAdapter>;
    if (typeof manual.confirm !== "function") throw new BridgeError(400, "NOT_MANUAL_ASSET", `${params.asset} is not a manual_qr asset`);
    const s = bridge.sessions.get(params.session_id);
    if (!s || s.assetId !== params.asset) throw new BridgeError(404, "SESSION_NOT_FOUND", params.session_id);
    if (body.asset_id !== s.assetId || body.reservation_id !== s.reservationId) {
      throw new BridgeError(400, "REQUEST_MISMATCH", "asset or reservation does not match the session");
    }
    const { challenge } = await bridge.verifier.verify(body, "confirm");
    let roles: string[];
    try {
      roles = await bridge.chain.getRoles(s.assetId, challenge.accountId);
    } catch (err) {
      throw new BridgeError(503, "CHAIN_UNAVAILABLE", (err as Error).message);
    }
    if (!roles.includes("steward")) throw new BridgeError(403, "NOT_STEWARD", `${challenge.accountId} has no steward role on ${s.assetId}`);
    try {
      await manual.confirm.call(rt.adapter, s.id, extra.step, challenge.accountId, extra.code ?? null);
    } catch (err) {
      throw new BridgeError(409, "CONFIRM_REFUSED", (err as Error).message);
    }
    bridge.bus.emit({
      type: "manual_confirmed",
      assetId: s.assetId,
      simulated: rt.simulated,
      data: { session_id: s.id, reservation_id: s.reservationId, step: extra.step, steward: challenge.accountId },
    });
    return { ok: true, step: extra.step };
  });

  app.get("/sessions/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    const s = bridge.sessions.get(id);
    if (!s) throw new BridgeError(404, "SESSION_NOT_FOUND", id);
    return sessionView(s, bridge.isSimulated(s.assetId));
  });

  app.post("/sessions/:id/finish", async (req) => {
    const { id } = parse(idParam, req.params);
    const body = signed(req.body);
    const s = bridge.sessions.get(id);
    if (!s) throw new BridgeError(404, "SESSION_NOT_FOUND", id);
    if (body.asset_id !== s.assetId || body.reservation_id !== s.reservationId) {
      throw new BridgeError(400, "REQUEST_MISMATCH", "asset or reservation does not match the session");
    }
    const { challenge } = await bridge.verifier.verify(body, "finish");
    const done = await bridge.sessions.finishByHolder(id, challenge.accountId);
    return { ok: true, status: done.status, finish_tx: done.finishTx };
  });

  app.post("/verification/:asset/:task_id/run", async (req, reply) => {
    const params = parse(verifyParams, req.params);
    const body = signed(req.body);
    if (body.asset_id !== params.asset || body.task_id !== params.task_id) {
      throw new BridgeError(400, "REQUEST_MISMATCH", "body asset/task must match the path");
    }
    const { challenge } = await bridge.verifier.verify(body, "verify");
    const run = await bridge.verification.start(params.asset, params.task_id, challenge.accountId);
    return reply.status(202).send({ ok: true, run_id: run.id });
  });

  app.get("/verification/runs/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    const run = bridge.verification.get(id);
    if (!run) throw new BridgeError(404, "RUN_NOT_FOUND", id);
    return runView(run);
  });

  app.get("/events", (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    const origin = req.headers.origin;
    const allowed = origin && (bridge.config.cors_origins.includes("*") || bridge.config.cors_origins.includes(origin));
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      ...(allowed ? { "access-control-allow-origin": bridge.config.cors_origins.includes("*") ? "*" : origin } : {}),
    });
    const send = (e: BridgeEvent) => res.write(`id: ${e.seq}\nevent: ${e.type}\ndata: ${toJson(e)}\n\n`);
    for (const e of bridge.bus.history()) send(e);
    const unsubscribe = bridge.bus.subscribe(send);
    const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 15_000);
    heartbeat.unref();
    req.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  return app;
}
