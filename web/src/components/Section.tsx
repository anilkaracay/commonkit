import type { ReactNode } from 'react';

export function Section({ title, eyebrow, action, children, id }: { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="space-y-3" aria-labelledby={id}>
      <div className="flex items-end justify-between gap-3">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2 id={id} className="text-xl font-bold">
            {title}
          </h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-tag border border-dashed border-line-strong p-4 text-sm text-ink-3">{children}</p>;
}

export function Loading({ what }: { what: string }) {
  return (
    <p className="animate-pulse p-4 text-sm text-ink-3" role="status">
      Reading {what}…
    </p>
  );
}

export function LoadError({ error }: { error: unknown }) {
  return (
    <p role="alert" className="rounded-tag bg-danger-soft p-4 text-sm text-danger">
      Could not read from the chain: {error instanceof Error ? error.message : String(error)}
    </p>
  );
}
