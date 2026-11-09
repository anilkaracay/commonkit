/**
 * `GET /events` — Server-Sent Events in the bridge's format (`id`, `event: <type>`, `data: <json>`,
 * history replay on connect, 15 s keep-alive), and `GET /health`.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { toJson, type AgentEvent, type EventBus } from "./events.js";

export interface HttpOptions {
  bus: EventBus;
  corsOrigins: readonly string[];
  health: () => Record<string, unknown>;
}

export function createAgentServer(o: HttpOptions): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://agent.local");
    const cors = corsHeaders(req, o.corsOrigins);
    if (req.method === "GET" && url.pathname === "/events") return sse(req, res, o.bus, cors);
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json", ...cors });
      res.end(toJson(o.health()));
      return;
    }
    res.writeHead(404, { "content-type": "application/json", ...cors });
    res.end(JSON.stringify({ error: "NOT_FOUND" }));
  });
}

function sse(req: IncomingMessage, res: ServerResponse, bus: EventBus, cors: Record<string, string>): void {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", ...cors });
  const send = (e: AgentEvent) => res.write(`id: ${e.seq}\nevent: ${e.type}\ndata: ${toJson(e)}\n\n`);
  for (const e of bus.history()) send(e);
  const unsubscribe = bus.subscribe(send);
  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 15_000);
  heartbeat.unref();
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

function corsHeaders(req: IncomingMessage, allowed: readonly string[]): Record<string, string> {
  const origin = req.headers.origin;
  if (allowed.includes("*")) return { "access-control-allow-origin": "*" };
  return origin && allowed.includes(origin) ? { "access-control-allow-origin": origin, vary: "origin" } : {};
}
