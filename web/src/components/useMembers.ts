import { useMemo } from 'react';
import { CAST, displayName } from '@commonkit/sdk';
import { useDeployment } from '../data/hooks';

/** account id → display name (D-036: `displayName()` from @commonkit/sdk) for the members in deployments. */
export function useMembers(): Map<string, string> {
  const dep = useDeployment();
  return useMemo(() => new Map((dep.data?.members ?? []).map((m) => [m.account_id, displayName(m.account_id)])), [dep.data]);
}

/** Team-controlled demo account (one of the cast in @commonkit/sdk). */
export function isDemoAccount(accountId: string): boolean {
  return (accountId.split('.')[0] ?? '') in CAST;
}
