import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useDeployment } from '../data/hooks';
import { useDataSource } from '../data/source';
import { SimulatedBadge } from '../components/Badges';
import { useToast } from '../components/Toast';
import { formatNear, parseNear, toYocto } from '../lib/near';
import { useLang } from '../pilot/lang';
import { useWallet } from '../wallet/wallet';

/** Only same-app paths are allowed as `next`, so a QR can never redirect off-site. */
export function safeNext(next: string | null): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

function Step({ title, done, children }: { title: string; done: boolean; children: ReactNode }) {
  return (
    <li className="tag p-4">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <span aria-hidden className={`grid size-6 place-items-center rounded-full text-xs ${done ? 'bg-alive text-paper' : 'border border-line-strong text-ink-3'}`}>
          {done ? '✓' : ''}
        </span>
        {title}
      </h2>
      <div className="mt-2 space-y-3 text-sm text-ink-2">{children}</div>
    </li>
  );
}

/** `/app/pilot` — three-step onboarding for real pilot members (D-024). */
export function PilotPage() {
  const { t, lang, switchHref } = useLang();
  const wallet = useWallet();
  const ds = useDataSource();
  const dep = useDeployment();
  const toast = useToast();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [copied, setCopied] = useState(false);
  const account = wallet.accountId;
  const balance = useQuery({
    queryKey: ['balance', ds.kind, account],
    enabled: !!account,
    queryFn: () => ds.viewAccount(account as string),
  });
  const funded = !!balance.data && toYocto(balance.data.amount) >= parseNear('0.1');

  const copy = async () => {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account);
      setCopied(true);
    } catch {
      /* clipboard blocked: the id is shown in full above */
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6" lang={lang}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{t.pilotEyebrow}</p>
          <h1 className="text-3xl font-extrabold">{t.pilotTitle}</h1>
        </div>
        <Link to={switchHref('/pilot')} className="text-sm underline decoration-dotted">
          {t.langSwitch}
        </Link>
      </div>
      <p className="text-sm text-ink-2">{t.pilotIntro}</p>

      {next && account && (
        <Link to={next} className="block rounded-tag bg-ink px-4 py-3 text-center font-medium text-paper">
          {t.backToAction} →
        </Link>
      )}

      <ol className="space-y-4">
        <Step title={t.step1Title} done={!!account}>
          <p>{t.step1Body}</p>
          {account ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-3">{t.connectedAs}</span>
              <span className="mono-id">{account}</span>
              <button type="button" className="text-xs underline" onClick={() => void wallet.disconnect().catch((e: unknown) => toast.showError(e))}>
                {t.disconnect}
              </button>
            </div>
          ) : wallet.status === 'unavailable' ? (
            <p className="text-due">{t.noConnector}</p>
          ) : (
            <button type="button" className="rounded-full bg-ink px-5 py-2 font-medium text-paper" onClick={() => void wallet.connect().catch((e: unknown) => toast.showError(e))}>
              {t.connect}
            </button>
          )}
        </Step>

        <Step title={t.step2Title} done={funded}>
          <p>{t.step2Body}</p>
          <p className="font-medium text-ink">{t.askOrganiser}</p>
          {account && (
            <>
              <button type="button" onClick={() => void copy()} className="rounded-full border border-line-strong px-4 py-1.5 text-sm font-medium">
                {copied ? t.copied : t.copyId}
              </button>
              <p className="num text-xs">
                {t.balance}: {balance.data ? `${formatNear(balance.data.amount)} NEAR` : '…'} · {funded ? t.funded : t.notFunded}
              </p>
            </>
          )}
        </Step>

        <Step title={t.step3Title} done={false}>
          <p>{t.step3Body}</p>
          <p className="text-xs text-ink-3">{t.orPick}</p>
          <ul className="space-y-2">
            {(dep.data?.assets ?? []).map((a) => (
              <li key={a.asset_id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="num font-medium text-ink">{a.alias}</span>
                {a.simulated && <SimulatedBadge />}
                {(['reserve', 'return', 'fault'] as const).map((action) => (
                  <Link key={action} to={`/a/${a.asset_id}?action=${action}`} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs hover:underline">
                    {action === 'reserve' ? t.actionReserve : action === 'return' ? t.actionReturn : t.actionFault}
                  </Link>
                ))}
              </li>
            ))}
          </ul>
        </Step>
      </ol>
    </div>
  );
}
