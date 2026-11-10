/**
 * Files bundled into the app at build time: deployments/testnet.json and evidence/*.json.
 * Missing evidence files (e.g. steps.json before the judge flow runs) simply come back empty.
 */
import rawDeployment from '../../../deployments/testnet.json';
import { parseDeployment, type RawDeployment } from './deployment';
import type { AgentLimitAttempt, EvidenceStep, EvidenceTx } from './offchain';

const evidence = import.meta.glob<unknown>('../../../evidence/*.json', { eager: true, import: 'default' });

function file<T>(name: string): T | null {
  const hit = Object.entries(evidence).find(([path]) => path.endsWith(`/evidence/${name}`));
  return hit ? (hit[1] as T) : null;
}

export const bundledDeployment = parseDeployment(rawDeployment as unknown as RawDeployment);

/** evidence/steps.json (judge flow). Empty until `pnpm demo:all` has run. */
export function bundledSteps(): EvidenceStep[] {
  return file<EvidenceStep[]>('steps.json') ?? [];
}

/** One attempt as `scripts` writes it to evidence/agent-limits.json (`{ attempts: [...] }`). */
interface RawLimitAttempt {
  spec?: string;
  id?: string;
  expected?: string[] | string;
  code?: string | null;
  status?: string;
  pass?: boolean;
  tx_hash?: string | null;
}

/** Accepts the flat list (AGENT_SPEC §5) or the `{ attempts }` file the limits demo writes. */
export function normalizeAgentLimits(raw: unknown): AgentLimitAttempt[] {
  if (Array.isArray(raw)) return raw as AgentLimitAttempt[];
  const attempts = (raw as { attempts?: RawLimitAttempt[] } | null)?.attempts;
  if (!Array.isArray(attempts)) return [];
  return attempts.map((a) => ({
    attempt: a.spec ?? a.id ?? 'attempt',
    expected: Array.isArray(a.expected) ? a.expected.join(' or ') : (a.expected ?? ''),
    observed: a.code ?? a.status ?? '',
    ok: a.pass === true,
    tx_hash: a.tx_hash ?? null,
  }));
}

export function bundledAgentLimits(): AgentLimitAttempt[] {
  return normalizeAgentLimits(file<unknown>('agent-limits.json'));
}

/** Every recorded setup / seeding / funding transaction, oldest first. */
export function bundledTxLog(): EvidenceTx[] {
  const lists = ['setup.json', 'seed.json', 'funding.json'].map((name) =>
    (file<EvidenceTx[]>(name) ?? []).map((tx) => ({ ...tx, source: name.replace('.json', '') })),
  );
  return lists.flat().sort((a, b) => a.at.localeCompare(b.at));
}
