import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Bridge } from "../src/bridge.js";
import { ChainError } from "../src/chain/types.js";
import { buildServer } from "../src/http/server.js";
import { MEMBER_SEED, STRANGER_SEED } from "./nep413-cases.js";
import { captureLogger, makeHarness, washerConfig, WASHER, type Harness } from "./helpers/harness.js";
import { publicKeyOf, signedPost } from "./helpers/sign.js";

const ALICE = "alice.testnet";
const BOB = "bob.testnet";
const MIN = 60_000;

describe("simulated washer: full session against the fake chain", () => {
  let h: Harness;
  let app: FastifyInstance;
  const t0 = () => h.chain.getChainTime();

  beforeEach(async () => {
    h = await makeHarness();
    const now = await t0();
    h.chain.addAccessKey(ALICE, publicKeyOf(MEMBER_SEED));
    h.chain.addAccessKey(BOB, publicKeyOf(STRANGER_SEED));
    h.chain.addReservation(WASHER, { id: 7n, holder: ALICE, status: "Confirmed", windowStart: now - 60_000_000_000n, windowEnd: now + 900_000_000_000n });
    h.chain.addReservation(WASHER, { id: 8n, holder: BOB, status: "Confirmed", windowStart: now - 60_000_000_000n, windowEnd: now + 900_000_000_000n });
    h.chain.addTask(WASHER, { id: 3n, ruleId: "filter_clean", status: "Submitted", claimer: ALICE });
    app = await buildServer(h.bridge);
  });
  afterEach(async () => {
    await app.close();
    await h.bridge.stop();
  });

  const access = (account = ALICE, reservation = "7", seed = MEMBER_SEED) =>
    signedPost(app, "/access", { asset_id: WASHER, reservation_id: reservation, account_id: account }, seed);

  it("access -> unlock -> telemetry -> cycle ends -> lock -> finish -> verification -> reported, all labelled simulated", async () => {
    const res = await access();
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    const sessionId = res.body.session_id as string;
    expect(h.chain.reservation(WASHER, 7n)?.status).toBe("InSession");
    const assets = (await app.inject({ method: "GET", url: "/assets" })).json<Array<Record<string, unknown>>>();
    expect(assets[0]).toMatchObject({ asset_id: WASHER, simulated: true, status: { locked: false, busy: true } });

    // Mid-cycle telemetry.
    h.advance(20_000);
    expect(await h.bridge.telemetry.tickOnce(WASHER)).toBe("reported");
    expect(await h.bridge.telemetry.tickOnce(WASHER)).toBe("unchanged");

    // A 45 min (+/-10%) cycle at speed 60 is done after 50 real seconds.
    h.advance(30_000);
    await h.bridge.sessions.pollOnce();
    const session = h.bridge.sessions.get(sessionId)!;
    expect(session.status).toBe("finished");
    expect(session.finishReason).toBe("device_done");
    expect(h.chain.reservation(WASHER, 7n)?.status).toBe("Finished");
    const tel = await h.chain.getTelemetry(WASHER);
    expect(tel.metrics.cycles).toBe(28n);
    expect(tel.metrics.simulated).toBe(1n);
    expect((await app.inject({ method: "GET", url: "/assets" })).json()[0].status.locked).toBe(true);

    // Maintenance verification, requested by the task claimer.
    const run = await signedPost(app, `/verification/${WASHER}/3/run`, { asset_id: WASHER, task_id: "3", account_id: ALICE, action: "verify" }, MEMBER_SEED);
    expect(run.statusCode, JSON.stringify(run.body)).toBe(202);
    const done = await h.bridge.verification.wait(run.body.run_id as string);
    expect(done.status).toBe("reported");
    expect(h.chain.task(WASHER, 3n)?.verification).toMatchObject({ passed: true, detailsHash: done.outcome!.detailsHash });
    const runView = (await app.inject({ method: "GET", url: `/verification/runs/${done.id}` })).json();
    expect(runView).toMatchObject({ status: "reported", task_id: "3", passed: true, simulated: true });

    // Chain writes, in order, each labelled simulated.
    expect(h.chain.calls.map((c) => c.method)).toEqual([
      "mark_session_started",
      "report_telemetry",
      "mark_session_finished",
      "submit_verification_result",
    ]);
    expect(h.chain.calls.every((c) => c.simulated)).toBe(true);

    // Every event, evidence line and asset log line is labelled simulated.
    const events = h.bridge.bus.history();
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(["bridge_started", "session_started", "device_unlocked", "access_granted", "telemetry_reported", "device_locked", "session_finished", "verification_started", "verification_finished", "verification_reported"]),
    );
    expect(events.every((e) => e.simulated)).toBe(true);
    await h.bridge.bus.flush();
    const files = await readdir(h.evidenceDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^bridge-\d{4}-\d{2}-\d{2}\.jsonl$/);
    const lines = (await readFile(join(h.evidenceDir, files[0]!), "utf8")).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(events.length);
    expect(lines.every((l) => l.simulated === true)).toBe(true);
    const assetLines = h.lines.filter((l) => l.asset_id === WASHER);
    expect(assetLines.length).toBeGreaterThan(5);
    expect(assetLines.every((l) => l.simulated === true)).toBe(true);
    const finished = events.find((e) => e.type === "session_finished")!;
    expect(finished.data).toMatchObject({ reason: "device_done", delta: { cycles: "1" } });
  });

  it("session deadline is enforced in chain time (local clock frozen)", async () => {
    const res = await access();
    h.chain.advanceMs(121 * MIN);
    await h.bridge.sessions.pollOnce();
    const s = h.bridge.sessions.get(res.body.session_id as string)!;
    expect(s.finishReason).toBe("timeout");
    expect(s.status).toBe("finished");
  });

  it("holder can end early with a signed request; another account cannot", async () => {
    const res = await access();
    const id = res.body.session_id as string;
    const bad = await signedPost(app, `/sessions/${id}/finish`, { asset_id: WASHER, reservation_id: "7", account_id: BOB, action: "finish" }, STRANGER_SEED);
    expect(bad.body).toMatchObject({ reason: "NOT_SESSION_HOLDER" });
    const ok = await signedPost(app, `/sessions/${id}/finish`, { asset_id: WASHER, reservation_id: "7", account_id: ALICE, action: "finish" }, MEMBER_SEED);
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toMatchObject({ ok: true, status: "finished" });
    expect(h.bridge.sessions.get(id)?.finishReason).toBe("holder");
  });

  it("one use at a time: a second reservation gets DEVICE_BUSY; the same reservation resumes", async () => {
    await access();
    const bob = await access(BOB, "8", STRANGER_SEED);
    expect(bob.statusCode).toBe(409);
    expect(bob.body).toMatchObject({ reason: "DEVICE_BUSY" });
    const again = await access();
    expect(again.body).toMatchObject({ ok: true, resumed: true });
    expect(h.chain.calls.filter((c) => c.method === "mark_session_started")).toHaveLength(1);
  });

  it("mark_session_started failure: device stays locked, nothing is held, error is precise", async () => {
    h.chain.failNext("markSessionStarted", new ChainError("E_WINDOW_CLOSED: x", "E_WINDOW_CLOSED"));
    const res = await access();
    expect(res.statusCode).toBe(502);
    expect(res.body).toMatchObject({ reason: "CHAIN_WRITE_FAILED" });
    const st = (await app.inject({ method: "GET", url: "/assets" })).json()[0];
    expect(st.status.locked).toBe(true);
    expect(st.occupancy).toBeNull();
  });

  it("out of service (D-017): can_access reason out_of_service -> 403 OUT_OF_SERVICE, nothing unlocked", async () => {
    h.chain.setInService(WASHER, false);
    const res = await access();
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ ok: false, reason: "OUT_OF_SERVICE" });
    expect(h.chain.calls).toHaveLength(0);
    const rejected = h.bridge.bus.history().find((e) => e.type === "access_rejected");
    expect(rejected?.data).toMatchObject({ reason: "OUT_OF_SERVICE" });
    h.chain.setInService(WASHER, true);
    expect((await access()).statusCode).toBe(200);
  });

  it("out of service between can_access and mark_session_started: E_OUT_OF_SERVICE -> 403, device stays locked, no retry", async () => {
    // Steward flips the asset out of service after the view check (race).
    const original = h.chain.canAccess.bind(h.chain);
    h.chain.canAccess = async (...args) => {
      const r = await original(...args);
      h.chain.setInService(WASHER, false);
      return r;
    };
    const res = await access();
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ reason: "OUT_OF_SERVICE" });
    const st = (await app.inject({ method: "GET", url: "/assets" })).json()[0];
    expect(st.status.locked).toBe(true);
    expect(st.occupancy).toBeNull();
    expect(h.chain.reservation(WASHER, 7n)?.status).toBe("Confirmed");
    const failed = h.bridge.bus.history().filter((e) => e.type === "session_start_failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]?.data).toMatchObject({ code: "E_OUT_OF_SERVICE" });
    expect(h.bridge.bus.history().some((e) => e.type === "device_unlocked")).toBe(false);
  });

  it("mark_session_finished failure is retried by the watcher and sent exactly once", async () => {
    const res = await access();
    h.chain.failNext("markSessionFinished");
    h.chain.failNext("markSessionFinished");
    h.advance(50_000);
    await h.bridge.sessions.pollOnce();
    const s = h.bridge.sessions.get(res.body.session_id as string)!;
    expect(s.status).toBe("finishing");
    expect(h.bridge.bus.history().some((e) => e.type === "session_finish_failed")).toBe(true);
    await h.bridge.sessions.pollOnce();
    expect(s.status).toBe("finished");
    await h.bridge.sessions.pollOnce();
    expect(h.chain.calls.filter((c) => c.method === "mark_session_finished")).toHaveLength(1);
  });

  it("restart mid-session: the new bridge resumes watching and finishes the session", async () => {
    const res = await access();
    h.advance(10_000);
    await app.close();
    await h.bridge.stop();
    const { logger } = captureLogger();
    const bridge2 = new Bridge({
      config: washerConfig(h.stateDir, h.evidenceDir),
      chain: h.chain,
      logger,
      clock: h.clock,
      retry: { attempts: 2, baseDelayMs: 10 },
      chainClockMaxAgeMs: 0,
    });
    await bridge2.init();
    expect(bridge2.assets.get(WASHER)?.occupancy).toMatchObject({ kind: "session" });
    h.advance(40_000);
    await bridge2.sessions.pollOnce();
    expect(bridge2.sessions.get(res.body.session_id as string)?.status).toBe("finished");
    expect((await h.chain.getTelemetry(WASHER)).metrics.cycles).toBe(28n);
    h.bridge = bridge2;
    app = await buildServer(bridge2);
  });

  it("telemetry: offline is skipped once, and lost local state never reports below the chain", async () => {
    h.advance(600_000); // simulated 10:00 -> offline window
    expect(await h.bridge.telemetry.tickOnce(WASHER)).toBe("offline");
    expect(await h.bridge.telemetry.tickOnce(WASHER)).toBe("offline");
    expect(h.bridge.bus.history().filter((e) => e.type === "telemetry_skipped")).toHaveLength(1);
    h.advance(20_000);
    expect(await h.bridge.telemetry.tickOnce(WASHER)).toBe("reported");
    // Someone (previous bridge install) reported higher counters: the next reports stay >= chain.
    await h.chain.reportTelemetry(WASHER, { cycles: 100n }, { simulated: true });
    h.advance(60_000);
    expect(await h.bridge.telemetry.tickOnce(WASHER)).toBe("failed");
    h.advance(60_000);
    expect(await h.bridge.telemetry.tickOnce(WASHER)).toBe("reported");
    expect((await h.chain.getTelemetry(WASHER)).metrics.cycles).toBe(100n);
  });

  it("verification guards: only the claimer, only Submitted tasks, never twice", async () => {
    const notClaimer = await signedPost(app, `/verification/${WASHER}/3/run`, { asset_id: WASHER, task_id: "3", account_id: BOB, action: "verify" }, STRANGER_SEED);
    expect(notClaimer.body).toMatchObject({ reason: "NOT_TASK_CLAIMER" });
    h.chain.addTask(WASHER, { id: 4n, ruleId: "filter_clean", status: "Claimed", claimer: ALICE });
    const notSubmitted = await signedPost(app, `/verification/${WASHER}/4/run`, { asset_id: WASHER, task_id: "4", account_id: ALICE, action: "verify" }, MEMBER_SEED);
    expect(notSubmitted.body).toMatchObject({ reason: "TASK_NOT_SUBMITTED" });
    const ok = await signedPost(app, `/verification/${WASHER}/3/run`, { asset_id: WASHER, task_id: "3", account_id: ALICE, action: "verify" }, MEMBER_SEED);
    await h.bridge.verification.wait(ok.body.run_id as string);
    const twice = await signedPost(app, `/verification/${WASHER}/3/run`, { asset_id: WASHER, task_id: "3", account_id: ALICE, action: "verify" }, MEMBER_SEED);
    expect(twice.body).toMatchObject({ reason: "ALREADY_VERIFIED" });
  });

  it("a challenge for one action cannot be used for another", async () => {
    const ch = await app.inject({ method: "POST", url: "/access/challenge", payload: { asset_id: WASHER, task_id: "3", account_id: ALICE, action: "verify" } });
    const c = ch.json();
    const { nep413SignWithSeed } = await import("../src/nep413/payload.js");
    const { base64 } = await import("@scure/base");
    const sig = nep413SignWithSeed({ message: c.message, nonce: base64.decode(c.nonce), recipient: c.recipient, callbackUrl: null }, MEMBER_SEED);
    const res = await app.inject({
      method: "POST",
      url: "/access",
      payload: { asset_id: WASHER, task_id: "3", account_id: ALICE, public_key: sig.publicKey, signature: sig.signature, nonce: c.nonce, message: c.message },
    });
    expect(res.json()).toMatchObject({ reason: "ACTION_MISMATCH" });
  });

  it("rejects malformed input with 400 and unknown assets with 404", async () => {
    const bad = await app.inject({ method: "POST", url: "/access/challenge", payload: { asset_id: "UPPER", account_id: ALICE } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ reason: "BAD_REQUEST" });
    const unknown = await app.inject({ method: "POST", url: "/access/challenge", payload: { asset_id: "nope.testnet", account_id: ALICE, reservation_id: "1" } });
    expect(unknown.statusCode).toBe(404);
    const health = (await app.inject({ method: "GET", url: "/health" })).json();
    expect(health).toMatchObject({ ok: true, chain: "fake", assets: [{ asset_id: WASHER, simulated: true, online: true }] });
  });

  it("SSE /events streams history and live events", async () => {
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    const ctrl = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/events`, { signal: ctrl.signal });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const reader = res.body!.getReader();
    let text = "";
    const readUntil = async (needle: string) => {
      while (!text.includes(needle)) text += new TextDecoder().decode((await reader.read()).value);
    };
    await readUntil("event: bridge_started");
    h.bridge.bus.emit({ type: "demo_ping", assetId: WASHER, simulated: true });
    await readUntil("event: demo_ping");
    expect(text).toContain('"simulated":true');
    ctrl.abort();
  });
});
