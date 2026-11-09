import { describe, expect, it } from "vitest";
import { NearAiRephraser, canonicalNumber, llmConfigFromEnv, validateNumbers, type Fetch } from "../src/rationale/llm.js";
import type { RationaleFacts } from "../src/rationale/templates.js";
import { PRINTER, world } from "./helpers.js";

const facts: RationaleFacts = {
  asset: "Makerlab 3D printer",
  rule_id: "filament_spool",
  kind: "Restock",
  trigger: "Metric",
  title: "Load a new filament spool",
  observed: { metric: "filament_used_mm", since_last: "334 m", threshold: "330 m" },
  reward_rights: 1,
  reward_cash_near: null,
  reimbursable_max_near: "0.5 NEAR",
  out_of_service: false,
};
const template =
  "Filament used since last restock: 334 m (threshold 330 m). Opening 'Load a new filament spool' with reward: 1 usage right; a receipt of up to 0.5 NEAR can be reimbursed.";

const CFG = { apiKey: "test-key", baseUrl: "https://llm.test/v1", model: "z-ai/glm-5.3-flash", timeoutMs: 200 };

function mockFetch(reply: (url: string, init?: RequestInit) => Response | Promise<Response>): Fetch & { urls: string[]; bodies: unknown[] } {
  const urls: string[] = [];
  const bodies: unknown[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    urls.push(url);
    if (init?.body) bodies.push(JSON.parse(String(init.body)));
    return reply(url, init);
  }) as Fetch & { urls: string[]; bodies: unknown[] };
  f.urls = urls;
  f.bodies = bodies;
  return f;
}

const completion = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }), { status: 200 });
const models = () => new Response(JSON.stringify({ data: [{ id: "z-ai/glm-5.3-flash" }, { id: "openai/gpt-5-nano" }] }), { status: 200 });

function llm(content: string | (() => Response | Promise<Response>)) {
  const f = mockFetch((url) => (url.endsWith("/models") ? models() : typeof content === "string" ? completion(content) : content()));
  return { r: new NearAiRephraser(CFG, f), f };
}

describe("numeric validation", () => {
  it("accepts a rephrasing that only reuses the given numbers", () => {
    expect(validateNumbers("The printer used 334 m of filament, past the 330 m mark. Loading a spool earns 1 usage right; up to 0.5 NEAR is reimbursed.", template, facts)).toEqual({ ok: true });
  });

  it("rejects an invented or recomputed number", () => {
    expect(validateNumbers("Filament used: 334 m, 4 m over the threshold.", template, facts)).toEqual({ ok: false, reason: 'number "4" not in the facts' });
    expect(validateNumbers("Filament used: 334000 mm.", template, facts).ok).toBe(false);
    expect(validateNumbers("Reward: 2 usage rights.", template, facts).ok).toBe(false);
  });

  it("rejects spelled-out numbers (they cannot be checked)", () => {
    expect(validateNumbers("Loading a spool earns one usage right.", template, facts).ok).toBe(false);
  });

  it("canonicalises formatting differences only", () => {
    expect(canonicalNumber("1,000")).toBe("1000");
    expect(canonicalNumber("0.50")).toBe("0.5");
    expect(canonicalNumber("1,5")).toBeNull();
  });
});

describe("NearAiRephraser (mocked HTTP)", () => {
  it("is off without NEARAI_API_KEY / NEARAI_MODEL", () => {
    expect(llmConfigFromEnv({})).toBeNull();
    expect(llmConfigFromEnv({ NEARAI_API_KEY: "k", NEARAI_MODEL: "m" })).toEqual({ apiKey: "k", model: "m", baseUrl: "https://cloud-api.near.ai/v1" });
  });

  it("uses a valid rephrasing and sends the facts with temperature 0", async () => {
    const { r, f } = llm(JSON.stringify({ rationale: "334 m of filament used (limit 330 m): load a new spool for 1 usage right; receipts up to 0.5 NEAR are reimbursed." }));
    expect(await r.checkModel()).toEqual({ ok: true });
    const out = await r.rephrase(facts, template);
    expect(out.source).toBe("llm");
    expect(f.urls).toEqual(["https://llm.test/v1/models", "https://llm.test/v1/chat/completions"]);
    const body = f.bodies[0] as { model: string; temperature: number; messages: { content: string }[] };
    expect(body.model).toBe("z-ai/glm-5.3-flash");
    expect(body.temperature).toBe(0);
    expect(JSON.parse(body.messages[1]!.content)).toEqual({ facts, template });
  });

  it("accepts JSON inside a code fence", async () => {
    const { r } = llm('```json\n{"rationale": "Load a new spool: 334 m used, threshold 330 m, 1 usage right, up to 0.5 NEAR back."}\n```');
    expect((await r.rephrase(facts, template)).source).toBe("llm");
  });

  it.each([
    ["an invented number", JSON.stringify({ rationale: "About 340 m used. Reward 1 usage right." }), /not in the facts/],
    ["a spelled-out number", JSON.stringify({ rationale: "Reward: one usage right for 334 m." }), /spelled-out/],
    ["non-JSON text", "Sure! Here is the rationale.", /not JSON/],
    ["a schema violation (> 600 chars)", JSON.stringify({ rationale: "a".repeat(601) }), /schema/],
    ["a wrong field", JSON.stringify({ text: "334 m" }), /schema/],
  ])("falls back to the template on %s", async (_name, content, reason) => {
    const { r } = llm(content);
    const out = await r.rephrase(facts, template);
    expect(out).toMatchObject({ source: "template", text: template });
    expect(out.source === "template" && out.fallbackReason).toMatch(reason);
  });

  it("falls back on HTTP errors, bad response shapes and timeouts", async () => {
    expect(await llm(() => new Response("no", { status: 401 })).r.rephrase(facts, template)).toMatchObject({ source: "template", fallbackReason: "llm HTTP 401" });
    expect(await llm(() => new Response(JSON.stringify({ choices: [] }), { status: 200 })).r.rephrase(facts, template)).toMatchObject({ source: "template", fallbackReason: "llm response shape" });
    const slow = llm(() => new Promise<Response>(() => undefined));
    const started = Date.now();
    expect(await slow.r.rephrase(facts, template)).toMatchObject({ source: "template", fallbackReason: "llm call failed: timeout" });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("stays off when the configured model is not live (D-107)", async () => {
    const f = mockFetch(() => new Response(JSON.stringify({ data: [{ id: "other/model" }] }), { status: 200 }));
    const r = new NearAiRephraser(CFG, f);
    expect(await r.checkModel()).toEqual({ ok: false, reason: "model z-ai/glm-5.3-flash not in /v1/models" });
    expect(r.enabled).toBe(false);
    expect(await r.rephrase(facts, template)).toMatchObject({ source: "template" });
    expect(f.urls).toHaveLength(1);
  });

  it("the loop records rationale_source and the fallback reason on chain and in the feed", async () => {
    const ok = llm(JSON.stringify({ rationale: "Jobs since last levelling: 50 (threshold 50). Level the bed for 1 usage right." }));
    await ok.r.checkModel();
    const w = world([PRINTER], { rephraser: ok.r });
    w.chain.setMetric(PRINTER, "jobs_total", 50n);
    await w.agent.tick();
    expect(w.chain.tasksRaw(PRINTER)[0]!.rationale).toBe("Jobs since last levelling: 50 (threshold 50). Level the bed for 1 usage right. [rationale: llm]");
    expect(w.of("task_opened")[0]!.data["rationale_source"]).toBe("llm");

    const bad = llm(JSON.stringify({ rationale: "Jobs: 51. Level the bed." }));
    await bad.r.checkModel();
    const w2 = world([PRINTER], { rephraser: bad.r });
    w2.chain.setMetric(PRINTER, "jobs_total", 50n);
    await w2.agent.tick();
    const e = w2.of("task_opened")[0]!;
    expect(e.data["rationale_source"]).toBe("template");
    expect(e.data["llm_fallback"]).toMatch(/number "51" not in the facts/);
    expect(w2.chain.tasksRaw(PRINTER)[0]!.rationale).toMatch(/^Jobs since last maintenance: 50 jobs \(threshold 50 jobs\)\. .* \[rationale: template\]$/);
  });
});
