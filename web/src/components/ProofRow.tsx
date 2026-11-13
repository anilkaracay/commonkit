import type { ProofCheck } from '../proof/checks';
import { Account, TxLink } from './TxLink';
import { NearText } from './Near';

const mark = {
  pass: { label: 'pass', cls: 'bg-accent text-on-accent' },
  fail: { label: 'fail', cls: 'bg-danger text-white' },
  warn: { label: 'warning', cls: 'bg-due-fill text-white' },
} as const;

function Mark({ status }: { status: ProofCheck['status'] }) {
  const m = mark[status];
  return (
    <span className={`grid size-6 shrink-0 place-items-center rounded-full ${m.cls}`} role="img" aria-label={m.label} title={m.label}>
      {status === 'pass' ? (
        <svg aria-hidden width="12" height="12" viewBox="0 0 14 14">
          <path d="M2.5 7.5 5.5 10.5 11.5 3.5" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : status === 'fail' ? (
        <svg aria-hidden width="12" height="12" viewBox="0 0 14 14">
          <path d="M3.5 3.5l7 7m0-7-7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      ) : (
        <span aria-hidden className="text-xs font-bold">
          !
        </span>
      )}
    </span>
  );
}

/** One verify.sh check: mark, title, summary, and the evidence behind it one tap away. */
export function ProofRow({ check, defaultOpen = false }: { check: ProofCheck; defaultOpen?: boolean }) {
  return (
    <li data-status={check.status}>
      <details open={defaultOpen} className="group">
        <summary className="flex cursor-pointer list-none items-start gap-4 px-5 py-4 hover:bg-bg-alt [&::-webkit-details-marker]:hidden">
          <Mark status={check.status} />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              <span className="num mr-2 text-text-3">{check.id}</span>
              {check.title}
            </p>
            <p className="mt-1 text-sm break-words text-text-3">{check.summary}</p>
          </div>
          <span aria-hidden className="mt-0.5 text-text-3 transition-transform group-open:rotate-90">
            ›
          </span>
        </summary>
        <ul className="mx-5 mb-4 divide-y divide-line rounded-md bg-bg-alt px-4 sm:ml-15">
          {check.items.map((item, i) => (
            <li key={i} className="flex items-start gap-3 py-2.5 text-sm">
              <span aria-label={item.info ? 'information' : item.ok ? 'ok' : 'not ok'} className={item.info ? 'text-text-3' : item.ok ? 'text-accent' : 'text-danger'}>
                {item.info ? 'ℹ' : item.ok ? '✓' : '✗'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="mono-id text-text-2">{item.account && item.label === item.account ? <Account id={item.account} full link /> : item.label}</p>
                <p className="num mt-0.5 text-xs break-all text-text-3">
                  <NearText text={item.value} />
                </p>
              </div>
              <TxLink hash={item.tx} />
            </li>
          ))}
          {check.items.length === 0 && <li className="py-2.5 text-sm text-text-3">Nothing to check yet.</li>}
        </ul>
      </details>
    </li>
  );
}
