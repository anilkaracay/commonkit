/**
 * Demo mode (FRONTEND_SPEC §5): `?demo=1` hides wallet chrome, enlarges key numbers and shows a
 * "step n/21" overlay driven by the evidence file. `?step=n` picks the step; `[` and `]` move it.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useEvidence } from '../data/hooks';

import { JUDGE_FLOW_STEPS as TOTAL_STEPS } from './flow';
import { castText } from '../lib/cast';

export { TOTAL_STEPS };

interface DemoState {
  enabled: boolean;
  step: number | null;
  setStep(step: number): void;
}

const DemoContext = createContext<DemoState>({ enabled: false, step: null, setStep: () => {} });

export function useDemo(): DemoState {
  return useContext(DemoContext);
}

/** Keeps `?demo=1` on internal links so a recording never drops out of demo mode. */
export function useDemoLink(): (path: string) => string {
  const { enabled } = useDemo();
  return useCallback((path: string) => (enabled ? `${path}${path.includes('?') ? '&' : '?'}demo=1` : path), [enabled]);
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const { search } = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const enabled = params.get('demo') === '1';
  const stepParam = Number(params.get('step'));
  const [manualStep, setManualStep] = useState<number | null>(null);
  const evidence = useEvidence();
  const latest = evidence.data?.reduce<number | null>((m, s) => (m === null || s.step > m ? s.step : m), null) ?? null;
  const step = manualStep ?? (Number.isInteger(stepParam) && stepParam >= 1 ? stepParam : latest);

  useEffect(() => {
    const root = document.documentElement;
    if (enabled) root.dataset.demo = 'true';
    else delete root.dataset.demo;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ']') setManualStep((s) => Math.min(TOTAL_STEPS, (s ?? step ?? 0) + 1));
      if (e.key === '[') setManualStep((s) => Math.max(1, (s ?? step ?? 2) - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, step]);

  const value = useMemo(() => ({ enabled, step, setStep: setManualStep }), [enabled, step]);
  return <DemoContext value={value}>{children}</DemoContext>;
}

export function DemoOverlay() {
  const { enabled, step } = useDemo();
  const evidence = useEvidence();
  if (!enabled || step === null) return null;
  const entry = evidence.data?.find((s) => s.step === step);
  return (
    <div
      className="pointer-events-none fixed bottom-4 left-4 z-50 max-w-[min(26rem,calc(100vw-2rem))] rounded-md bg-inverse px-4 py-3 text-inverse-text shadow-lg"
      aria-live="polite"
    >
      <p className="num text-xs font-semibold tracking-[0.1em] text-sky-300">
        STEP {step}/{TOTAL_STEPS}
      </p>
      {entry && <p className="text-sm leading-snug">{castText(entry.title)}</p>}
    </div>
  );
}
