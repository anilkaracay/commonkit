import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentServer } from "../src/http.js";
import { PRINTER, world } from "./helpers.js";

/** Field list of the bridge's BridgeEvent (bridge/src/events/bus.ts). */
const BRIDGE_EVENT_KEYS = ["seq", "at", "chain_time_ns", "type", "asset_id", "simulated", "data"];

let close: (() => void) | null = null;
afterEach(() => close?.());

async function readSse(url: string, wantEvents: number): Promise<string> {
  const ctrl = new AbortController();
  const res = await fetch(url, { signal: ctrl.signal });
  expect(res.headers.get("content-type")).toBe("text/event-stream");
  const reader = res.body!.getReader();
  let text = "";
  while ((text.match(/\n\n/g) ?? []).length < wantEvents) text += new TextDecoder().decode((await reader.read()).value);
  ctrl.abort();
  return text;
}

describe("SSE feed (bridge event shape)", () => {
  it("replays history and streams new events with the bridge's fields, labelled simulated", async () => {
    const w = world([PRINTER], { simulated: true });
    w.chain.setMetric(PRINTER, "jobs_total", 50n);
    await w.agent.tick();
    const server = createAgentServer({ bus: w.bus, corsOrigins: ["http://localhost:5173"], health: () => ({ ok: true }) });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    close = () => server.close();
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const pending = readSse(`${base}/events`, 2);
    await new Promise((r) => setTimeout(r, 50));
    w.bus.emit({ type: "agent_waiting", assetId: PRINTER, simulated: true, data: { reason: "test" } });
    const text = await pending;

    const blocks = text.trim().split("\n\n");
    expect(blocks[0]).toMatch(/^id: 1\nevent: task_opened\ndata: /);
    const first = JSON.parse(blocks[0]!.split("\ndata: ")[1]!) as Record<string, unknown>;
    expect(Object.keys(first)).toEqual(BRIDGE_EVENT_KEYS);
    expect(first).toMatchObject({ type: "task_opened", asset_id: PRINTER, simulated: true });
    expect(typeof first["chain_time_ns"]).toBe("string");
    expect(blocks[1]).toMatch(/^id: 2\nevent: agent_waiting\n/);

    const health = await fetch(`${base}/health`, { headers: { origin: "http://localhost:5173" } });
    expect(health.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(await health.json()).toEqual({ ok: true });
  });

  it("every event against the fake chain is simulated, even for a real-hardware asset", async () => {
    const w = world([PRINTER], { simulated: false });
    w.chain.setMetric(PRINTER, "jobs_total", 50n);
    await w.agent.tick();
    expect(w.events.length).toBeGreaterThan(0);
    expect(w.events.every((e) => e.simulated)).toBe(true);
  });
});
