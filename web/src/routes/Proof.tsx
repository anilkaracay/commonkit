import { useQuery } from '@tanstack/react-query';
import { useDataSource } from '../data/source';
import { runProofChecks } from '../proof/checks';
import { ProofRow } from '../components/ProofRow';
import { LoadError, Loading } from '../components/Section';

/** `/proof` — exactly the checks of scripts/verify.sh, computed live. */
export function ProofPage() {
  const ds = useDataSource();
  const q = useQuery({ queryKey: ['proof', ds.kind], queryFn: () => runProofChecks(ds) });
  const counts = q.data?.reduce((m, c) => ({ ...m, [c.status]: (m[c.status] ?? 0) + 1 }), {} as Record<string, number>);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="eyebrow">proof</p>
        <h1 className="text-3xl font-extrabold">Don't trust this page. Check it.</h1>
        <p className="mt-2 text-sm text-ink-2">
          These are the same nine checks <span className="num">scripts/verify.sh</span> runs, in the same order, read live without a wallet. Run
          it yourself from a clean clone:
        </p>
        <code className="mt-2 block rounded-md bg-ink px-3 py-2 font-mono text-xs text-paper">./scripts/verify.sh</code>
      </div>
      {q.error && <LoadError error={q.error} />}
      {!q.data && !q.error && <Loading what="every check" />}
      {q.data && counts && (
        <>
          <p className="num text-sm" aria-live="polite">
            <span className="font-semibold text-alive">{counts.pass ?? 0} pass</span> · <span className="text-danger">{counts.fail ?? 0} fail</span> ·{' '}
            <span className="text-due">{counts.warn ?? 0} warning</span>
          </p>
          <ol className="space-y-3">
            {q.data.map((c) => (
              <ProofRow key={c.id} check={c} defaultOpen={c.status !== 'pass'} />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
