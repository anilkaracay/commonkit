import { useMemo } from 'react';
import { useDeployment } from '../data/hooks';

/** account id → display name from deployments/testnet.json members. */
export function useMembers(): Map<string, string> {
  const dep = useDeployment();
  return useMemo(() => new Map((dep.data?.members ?? []).map((m) => [m.account_id, m.display_name])), [dep.data]);
}
