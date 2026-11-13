/**
 * Locate and load Trezu's custom-proposal-template engine (NEAR-DevHub/trezu, pinned commit in
 * integrations/trezu/engine.lock.json). The engine lives in a temp dir outside the repo, written by
 * scripts/trezu/fetch-engine.sh, because Trezu publishes no license. Its `@/` imports resolve
 * through the vitest alias (scripts/vitest.config.ts) or `tsx --tsconfig <dir>/tsconfig.json`.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from '../lib/config.js';

export const TREZU_DIR = join(REPO_ROOT, 'integrations', 'trezu');
export const TEMPLATES_DIR = join(TREZU_DIR, 'templates');

export interface EngineLock {
  repo: string;
  commit: string;
  files: Record<string, string>;
  dependencies: Record<string, string>;
}

export const ENGINE_LOCK = JSON.parse(
  readFileSync(join(TREZU_DIR, 'engine.lock.json'), 'utf8'),
) as EngineLock;

export const engineDir = (): string =>
  process.env.TREZU_ENGINE_DIR ??
  join(tmpdir(), `commonkit-trezu-engine-${ENGINE_LOCK.commit.slice(0, 7)}`);

/** True when every pinned file is present with its sha256 and the dependencies are installed. */
export function engineReady(dir = engineDir()): boolean {
  if (!existsSync(join(dir, 'node_modules', 'zod'))) return false;
  return Object.entries(ENGINE_LOCK.files).every(([f, sha]) => {
    const p = join(dir, f);
    return existsSync(p) && createHash('sha256').update(readFileSync(p)).digest('hex') === sha;
  });
}

/** The manifest JSON files in integrations/trezu/templates, keyed by template id. */
export function loadTemplates(): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  for (const f of readdirSync(TEMPLATES_DIR)
    .filter((x) => x.endsWith('.json'))
    .sort()) {
    const m = JSON.parse(readFileSync(join(TEMPLATES_DIR, f), 'utf8')) as { id: string };
    out.set(m.id, m);
  }
  return out;
}

/** Trezu's FunctionCall kind as `buildTemplateProposal` returns it. */
export interface TrezuFunctionCallKind {
  FunctionCall: {
    receiver_id: string;
    actions: { method_name: string; args: string; deposit: string; gas: string }[];
  };
}

export interface TrezuEngine {
  parseManifest(input: unknown): {
    success: boolean;
    data?: unknown;
    error?: { issues: unknown[] };
  };
  buildTemplateProposal(
    manifest: unknown,
    values: Record<string, unknown>,
  ): { kind: TrezuFunctionCallKind; description: string };
  buildFormSchema(
    manifest: unknown,
    messages: Record<string, (label: string, bound?: string) => string>,
  ): { safeParse(v: unknown): { success: boolean; error?: { issues: unknown[] } } };
}

const msg = (what: string) => (label: string, bound?: string) =>
  `${label}: ${what}${bound ? ` ${bound}` : ''}`;

/** Messages for Trezu's form schema (the UI passes translated strings; any text works). */
export const FORM_MESSAGES = Object.fromEntries(
  [
    'required',
    'account',
    'wholeNumber',
    'number',
    'select',
    'json',
    'invalid',
    'pattern',
    'min',
    'max',
  ].map((k) => [k, msg(k)]),
);

export async function loadEngine(dir = engineDir()): Promise<TrezuEngine> {
  if (!engineReady(dir))
    throw new Error(`Trezu engine not ready in ${dir}: run bash scripts/trezu/fetch-engine.sh`);
  const mod = (f: string) =>
    import(pathToFileURL(join(dir, 'nt-fe/features/proposal-templates', f)).href);
  const [manifest, build, form] = await Promise.all([
    mod('manifest.ts'),
    mod('build-proposal.ts'),
    mod('form-schema.ts'),
  ]);
  return {
    parseManifest: manifest.parseManifest,
    buildTemplateProposal: build.buildTemplateProposal,
    buildFormSchema: form.buildFormSchema,
  };
}

/**
 * Validate a member's values with Trezu's form schema, then build the proposal with Trezu's engine.
 * Throws on an invalid manifest or invalid values, exactly where the Trezu UI would refuse.
 */
export function fillTemplate(
  engine: TrezuEngine,
  manifestJson: unknown,
  values: Record<string, unknown>,
): { kind: TrezuFunctionCallKind; description: string } {
  const parsed = engine.parseManifest(manifestJson);
  if (!parsed.success)
    throw new Error(`manifest rejected: ${JSON.stringify(parsed.error?.issues)}`);
  const form = engine.buildFormSchema(parsed.data, FORM_MESSAGES).safeParse(values);
  if (!form.success) throw new Error(`values rejected: ${JSON.stringify(form.error?.issues)}`);
  return engine.buildTemplateProposal(parsed.data, values);
}
