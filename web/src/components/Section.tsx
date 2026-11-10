import type { ReactNode } from 'react';

/** A page section: one heading, an optional one-line note, an optional action on the right. */
export function Section({ title, note, action, children, id }: { title: string; note?: ReactNode; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="min-w-0 space-y-4" aria-labelledby={id}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id={id} className="text-xl">
            {title}
          </h2>
          {note && <p className="mt-1 text-sm text-text-3">{note}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** Page title block: small context line, display heading, optional lede. */
export function PageHead({ context, title, children, aside }: { context?: ReactNode; title: ReactNode; children?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0 max-w-3xl">
        {context && <div className="mb-3 text-sm text-text-3">{context}</div>}
        <h1 className="display text-[34px] sm:text-[44px]">{title}</h1>
        {children && <div className="mt-3 text-[17px] leading-relaxed text-text-2">{children}</div>}
      </div>
      {aside}
    </header>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md bg-bg-alt px-4 py-5 text-sm text-text-3">{children}</p>;
}

export function Loading({ what }: { what: string }) {
  return (
    <p className="animate-pulse py-6 text-sm text-text-3" role="status">
      Reading {what}…
    </p>
  );
}

export function LoadError({ error }: { error: unknown }) {
  return (
    <p role="alert" className="rounded-md bg-danger-soft p-4 text-sm text-danger">
      Could not read from the chain: {error instanceof Error ? error.message : String(error)}
    </p>
  );
}
