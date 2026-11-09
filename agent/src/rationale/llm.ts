/**
 * Optional rephrasing through NEAR AI Cloud (OpenAI-compatible, RESEARCH F1, D-107).
 * The LLM never decides anything: it gets the template and its facts and may only reword them.
 * Every number in its output must appear in the input, the response is zod-validated, and any
 * failure (no key, unknown model, HTTP error, timeout, bad JSON, invented number) falls back to
 * the template.
 */
import { z } from "zod";
import type { RationaleFacts } from "./templates.js";

export const NEARAI_DEFAULT_BASE_URL = "https://cloud-api.near.ai/v1";
export const LLM_TIMEOUT_MS = 3000;
export const LLM_MAX_CHARS = 600;

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
}

/** From env per .env.example; null (LLM off) when the key or model is missing. */
export function llmConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LlmConfig | null {
  const apiKey = env["NEARAI_API_KEY"]?.trim();
  const model = env["NEARAI_MODEL"]?.trim();
  if (!apiKey || !model) return null;
  return { apiKey, model, baseUrl: env["NEARAI_BASE_URL"]?.trim() || NEARAI_DEFAULT_BASE_URL };
}

const modelsSchema = z.object({ data: z.array(z.object({ id: z.string() })) });
const completionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});
export const llmOutputSchema = z.object({ rationale: z.string().trim().min(1).max(LLM_MAX_CHARS) });

const NUMBER_WORDS =
  /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|dozen|half|twice|double|triple|single)\b/i;

/** Canonical decimal form: "1,000" → "1000", "0.50" → "0.5", "007" → "7". null if malformed. */
export function canonicalNumber(token: string): string | null {
  let t = token;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  const w = whole!.replace(/^0+(?=\d)/, "");
  const f = frac.replace(/0+$/, "");
  return f ? `${w}.${f}` : w;
}

export function numbersIn(text: string): string[] {
  return [...text.matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => m[0]);
}

/**
 * The validation rule (AGENT_SPEC §3.2): every number in `output` must appear in the input
 * (template text or facts). Spelled-out numbers are rejected outright because they cannot be
 * checked.
 */
export function validateNumbers(output: string, template: string, facts: RationaleFacts): { ok: true } | { ok: false; reason: string } {
  const word = NUMBER_WORDS.exec(output);
  if (word) return { ok: false, reason: `spelled-out number "${word[0]}"` };
  const allowed = new Set<string>();
  for (const tok of numbersIn(`${template}\n${JSON.stringify(facts)}`)) {
    const c = canonicalNumber(tok);
    if (c !== null) allowed.add(c);
  }
  for (const tok of numbersIn(output)) {
    const c = canonicalNumber(tok);
    if (c === null || !allowed.has(c)) return { ok: false, reason: `number "${tok}" not in the facts` };
  }
  return { ok: true };
}

export type RephraseResult =
  | { source: "llm"; text: string }
  | { source: "template"; text: string; fallbackReason: string };

export interface Rephraser {
  readonly enabled: boolean;
  rephrase(facts: RationaleFacts, template: string): Promise<RephraseResult>;
}

/** Used when no key is configured: always the template. */
export const templateOnly: Rephraser = {
  enabled: false,
  rephrase: async (_facts, template) => ({ source: "template", text: template, fallbackReason: "llm disabled" }),
};

const SYSTEM_PROMPT = [
  "You reword upkeep notices for members of a community that shares a machine.",
  'Reply with JSON only: {"rationale": "<text>"}. At most 600 characters, plain English, friendly and factual.',
  "Use only the facts given. Copy every number exactly as it is written in the input, digits only;",
  "never add, compute, round, convert or spell out a number. Keep the task title, the reward and any reimbursement limit.",
  "Do not mention people, accounts or anything not in the input.",
].join(" ");

export class NearAiRephraser implements Rephraser {
  private modelOk: boolean | null = null;

  constructor(
    private readonly cfg: LlmConfig,
    private readonly fetchImpl: Fetch = (i, o) => fetch(i, o),
  ) {}

  get enabled(): boolean {
    return this.modelOk !== false;
  }

  /** D-107: the model id must be live in `GET /v1/models`; otherwise the LLM stays off. */
  async checkModel(): Promise<{ ok: boolean; reason?: string }> {
    try {
      const res = await this.http(`${this.cfg.baseUrl}/models`, { method: "GET" });
      if (!res.ok) throw new Error(`models HTTP ${res.status}`);
      const ids = modelsSchema.parse(res.body).data.map((m) => m.id);
      this.modelOk = ids.includes(this.cfg.model);
      return this.modelOk ? { ok: true } : { ok: false, reason: `model ${this.cfg.model} not in /v1/models` };
    } catch (err) {
      this.modelOk = false;
      return { ok: false, reason: errText(err) };
    }
  }

  async rephrase(facts: RationaleFacts, template: string): Promise<RephraseResult> {
    const fallback = (fallbackReason: string): RephraseResult => ({ source: "template", text: template, fallbackReason });
    if (this.modelOk === false) return fallback("llm model unavailable");
    let content: string;
    try {
      const res = await this.http(`${this.cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.cfg.apiKey}` },
        body: JSON.stringify({
          model: this.cfg.model,
          temperature: 0,
          max_tokens: 400,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify({ facts, template }) },
          ],
        }),
      });
      if (!res.ok) return fallback(`llm HTTP ${res.status}`);
      const parsed = completionSchema.safeParse(res.body);
      if (!parsed.success) return fallback("llm response shape");
      content = parsed.data.choices[0]!.message.content;
    } catch (err) {
      return fallback(`llm call failed: ${errText(err)}`);
    }
    let json: unknown;
    try {
      json = JSON.parse(stripFences(content));
    } catch {
      return fallback("llm output is not JSON");
    }
    const out = llmOutputSchema.safeParse(json);
    if (!out.success) return fallback("llm output failed schema");
    const check = validateNumbers(out.data.rationale, template, facts);
    if (!check.ok) return fallback(`llm output rejected: ${check.reason}`);
    return { source: "llm", text: out.data.rationale };
  }

  /** One request including the body read, bounded by the timeout (3 s by default). */
  private async http(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; body: unknown }> {
    const ctrl = new AbortController();
    const timeout = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        ctrl.abort();
        reject(new Error("timeout"));
      }, this.cfg.timeoutMs ?? LLM_TIMEOUT_MS);
      ctrl.signal.addEventListener("abort", () => clearTimeout(timer));
    });
    const run = (async () => {
      const res = await this.fetchImpl(url, { ...init, signal: ctrl.signal });
      const body: unknown = res.ok ? await res.json() : null;
      return { ok: res.ok, status: res.status, body };
    })();
    run.catch(() => undefined); // the race reports it; avoid an unhandled rejection after a timeout
    try {
      return await Promise.race([run, timeout]);
    } finally {
      ctrl.abort();
    }
  }
}

function stripFences(s: string): string {
  const m = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/.exec(s);
  return (m ? m[1]! : s).trim();
}

function errText(err: unknown): string {
  return err instanceof Error ? (err.name === "AbortError" ? "timeout" : err.message) : String(err);
}
