import { useQuery } from '@tanstack/react-query';
import { useDataSource } from '../data/source';
import { runProofChecks } from '../proof/checks';
import { ProofRow } from '../components/ProofRow';
import { LoadError, Loading, PageHead } from '../components/Section';

/** `/proof` — exactly the checks of scripts/verify.sh, computed live. */
export function ProofPage() {
  const ds = useDataSource();
  const q = useQuery({ queryKey: ['proof', ds.kind], queryFn: () => runProofChecks(ds) });
  const counts = q.data?.reduce((m, c) => ({ ...m, [c.status]: (m[c.status] ?? 0) + 1 }), {} as Record<string, number>);
  const total = q.data?.length ?? 0;
  const pass = counts?.pass ?? 0;
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <PageHead title="Proof">
        <span className="text-[15px]">
          The checks of <span className="font-mono text-sm">scripts/verify.sh</span>, read live.
        </span>
      </PageHead>
      <code className="code">./scripts/verify.sh</code>
      {q.error && <LoadError error={q.error} />}
      {!q.data && !q.error && <Loading what="every check" />}
      {q.data && counts && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2" aria-live="polite">
            <p className="flex items-baseline gap-3">
              <span className="key-num display leading-none" style={{ ['--key-base' as string]: '3rem' }}>
                {pass}/{total}
              </span>
              <span className="text-text-2">checks pass</span>
            </p>
            <p className="num text-sm text-text-3">
              <span className="font-medium text-text">{pass} pass</span> · <span className={counts.fail ? 'font-medium text-danger' : ''}>{counts.fail ?? 0} fail</span>
              {counts.warn ? <span className="font-medium text-due"> · {counts.warn} warning</span> : null}
            </p>
          </div>
          <div className="ck-gauge" style={{ ['--v' as string]: `${total ? (pass / total) * 100 : 0}%` }}>
            <span />
          </div>
          <ol className="panel divide-y divide-line overflow-hidden">
            {q.data.map((c) => (
              <ProofRow key={c.id} check={c} defaultOpen={c.status !== 'pass'} />
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
