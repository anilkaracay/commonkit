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

export function bundledAgentLimits(): AgentLimitAttempt[] {
  return file<AgentLimitAttempt[]>('agent-limits.json') ?? [];
}

/** Every recorded setup / seeding / funding transaction, oldest first. */
export function bundledTxLog(): EvidenceTx[] {
  const lists = ['setup.json', 'seed.json', 'funding.json'].map((name) =>
    (file<EvidenceTx[]>(name) ?? []).map((tx) => ({ ...tx, source: name.replace('.json', '') })),
  );
  return lists.flat().sort((a, b) => a.at.localeCompare(b.at));
}
