import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDataSource, type DataSource } from '../data/source';
import { PROOF_CHECKS, runProofChecks, type ProofCheck } from '../proof/checks';
import { ProofRow, ProofRowPending } from '../components/ProofRow';
import { LoadError, PageHead } from '../components/Section';

/** `/proof` — exactly the checks of scripts/verify.sh, computed live. */
export function ProofPage() {
  const ds = useDataSource();
  const run = useRef(0);
  const [progress, setProgress] = useState<{ source: DataSource; checks: ProofCheck[] }>({ source: ds, checks: [] });
  const q = useQuery({
    queryKey: ['proof', ds.kind],
    queryFn: ({ signal }) => {
      const current = ++run.current;
      setProgress({ source: ds, checks: [] });
      return runProofChecks(ds, (check) => {
        if (signal.aborted || current !== run.current) return;
        setProgress((p) => ({ source: ds, checks: [...p.checks.filter((c) => c.id !== check.id), check] }));
      });
    },
  });
  // A refresh starts with pending rows, never old passes. Only this run's completed reads count.
  const partial = progress.source === ds ? progress.checks : [];
  const checks = q.isFetching || q.isError ? partial : q.data ?? partial;
  const counts = checks.reduce((m, c) => ({ ...m, [c.status]: (m[c.status] ?? 0) + 1 }), {} as Record<string, number>);
  const total = PROOF_CHECKS.length;
  const pass = counts.pass ?? 0;
  const pending = total - checks.length;
  return (
    <div className="max-w-4xl space-y-10">
      <PageHead title="Proof">
        <span className="text-[15px]">
          The checks of <span className="font-mono text-sm">scripts/verify.sh</span>, read live.
        </span>
      </PageHead>
      <code className="code">./scripts/verify.sh</code>
      {q.error && <LoadError error={q.error} />}
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
            {pending > 0 && <span> · {pending} {q.error ? 'unavailable' : 'checking…'}</span>}
          </p>
        </div>
        <div className="ck-gauge" style={{ ['--v' as string]: `${(pass / total) * 100}%` }}>
          <span />
        </div>
        <ol className="panel divide-y divide-line overflow-hidden">
          {PROOF_CHECKS.map((definition) => {
            const check = checks.find((c) => c.id === definition.id);
            return check ? <ProofRow key={check.id} check={check} defaultOpen={check.status !== 'pass'} /> : <ProofRowPending key={definition.id} {...definition} unavailable={!!q.error} />;
          })}
        </ol>
      </div>
    </div>
  );
}
