/**
 * One poll cycle per page (FRONTEND_SPEC §3): every 30 s, while the tab is visible, mark the
 * page's active queries stale and refetch them together. Hidden tabs never poll; coming back
 * after a pause refreshes once. Components never set their own intervals.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useDataSource } from './source';

export const PAGE_POLL_MS = 30_000;

export function usePagePoll(intervalMs = PAGE_POLL_MS) {
  const qc = useQueryClient();
  const ds = useDataSource();
  useEffect(() => {
    if (ds.kind !== 'rpc' || typeof document === 'undefined') return;
    let last = Date.now();
    const cycle = () => {
      if (document.hidden) return;
      last = Date.now();
      void qc.invalidateQueries({ type: 'active' });
    };
    const timer = window.setInterval(cycle, intervalMs);
    const onVisible = () => {
      if (!document.hidden && Date.now() - last >= intervalMs) cycle();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [qc, ds.kind, intervalMs]);
}
