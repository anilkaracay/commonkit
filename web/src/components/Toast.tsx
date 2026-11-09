import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { humanizeError, type HumanError } from '../lib/errors';

interface ToastApi {
  showError(err: unknown): HumanError;
}

const ToastContext = createContext<ToastApi>({ showError: humanizeError });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

interface Item extends HumanError {
  id: number;
}

let seq = 0;

/** Errors from contracts/bridge become one plain sentence; the raw panic stays one tap away. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const showError = useCallback((err: unknown) => {
    const h = humanizeError(err);
    setItems((xs) => [...xs.slice(-2), { ...h, id: ++seq }]);
    return h;
  }, []);
  const api = useMemo(() => ({ showError }), [showError]);
  return (
    <ToastContext value={api}>
      {children}
      <div className="fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="assertive">
        {items.map((t) => (
          <ErrorToast key={t.id} error={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext>
  );
}

export function ErrorToast({ error, onClose }: { error: HumanError; onClose?: () => void }) {
  return (
    <div role="alert" className="tag w-full max-w-md border-danger/40 p-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-danger text-[11px] font-bold text-surface">
          !
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{error.message}</p>
          <details className="mt-1">
            <summary className="cursor-pointer font-mono text-[11px] text-ink-3">{error.code ?? 'details'}</summary>
            <p className="mt-1 font-mono text-[11px] break-all text-ink-3">{error.raw}</p>
          </details>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="text-ink-3 hover:text-ink" aria-label="Dismiss">
            ×
          </button>
        )}
      </div>
    </div>
  );
}
