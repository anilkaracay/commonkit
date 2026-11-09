import type { ProofCheck } from '../proof/checks';
import { Account, TxLink } from './TxLink';

const mark = {
  pass: { label: 'pass', cls: 'bg-alive-soft text-alive' },
  fail: { label: 'fail', cls: 'bg-danger-soft text-danger' },
  warn: { label: 'warning', cls: 'bg-due-soft text-due' },
} as const;

function Mark({ status }: { status: ProofCheck['status'] }) {
  const m = mark[status];
  return (
    <span className={`grid size-7 shrink-0 place-items-center rounded-full ${m.cls}`} role="img" aria-label={m.label} title={m.label}>
      {status === 'pass' ? (
        <svg aria-hidden width="14" height="14" viewBox="0 0 14 14"><path d="M2.5 7.5 5.5 10.5 11.5 3.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ) : status === 'fail' ? (
        <svg aria-hidden width="14" height="14" viewBox="0 0 14 14"><path d="M3.5 3.5l7 7m0-7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      ) : (
        <span aria-hidden className="text-sm font-bold">!</span>
      )}
    </span>
  );
}

/** One verify.sh check: ✅/❌ mark (as an icon), summary, and the evidence behind it. */
export function ProofRow({ check, defaultOpen = false }: { check: ProofCheck; defaultOpen?: boolean }) {
  return (
    <li className="tag p-0" data-status={check.status}>
      <details open={defaultOpen} className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden">
          <Mark status={check.status} />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              <span className="num mr-2 text-xs text-ink-3">{check.id}.</span>
              {check.title}
            </p>
            <p className="mt-0.5 text-xs break-words text-ink-2">{check.summary}</p>
          </div>
          <span aria-hidden className="mt-1 text-ink-3 transition-transform group-open:rotate-90">›</span>
        </summary>
        <ul className="divide-y divide-line border-t border-line px-4">
          {check.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 py-2 text-xs">
              <span aria-label={item.ok ? 'ok' : 'not ok'} className={item.ok ? 'text-alive' : 'text-danger'}>
                {item.ok ? '✓' : '✗'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="mono-id">{item.account && item.label === item.account ? <Account id={item.account} full link /> : item.label}</p>
                <p className="num break-all text-ink-2">{item.value}</p>
              </div>
              <TxLink hash={item.tx} />
            </li>
          ))}
          {check.items.length === 0 && <li className="py-2 text-xs text-ink-3">Nothing to check yet.</li>}
        </ul>
      </details>
    </li>
  );
}
