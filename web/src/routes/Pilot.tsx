import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useDeployment } from '../data/hooks';
import { useDataSource } from '../data/source';
import { SimulatedBadge } from '../components/Badges';
import { PageHead } from '../components/Section';
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
    <li className="flex gap-4 px-5 py-6 sm:px-6">
      <span aria-hidden className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold ${done ? 'bg-accent text-on-accent' : 'bg-bg-alt text-text-3'}`}>
        {done ? '✓' : ''}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg">{title}</h2>
        <div className="mt-2 space-y-3 text-text-2">{children}</div>
      </div>
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
    <div className="mx-auto max-w-xl space-y-10" lang={lang}>
      <PageHead
        context={
          <span className="flex justify-between gap-4">
            <span>{t.pilotEyebrow}</span>
            <Link to={switchHref('/pilot')} className="text-link">
              {t.langSwitch}
            </Link>
          </span>
        }
        title={t.pilotTitle}
      >
        {t.pilotIntro}
      </PageHead>

      {next && account && (
        <Link to={next} className="ck-btn ck-btn--lg w-full">
          {t.backToAction} →
        </Link>
      )}

      <ol className="ck-card divide-y divide-line">
        <Step title={t.step1Title} done={!!account}>
          <p>{t.step1Body}</p>
          {account ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-text-3">{t.connectedAs}</span>
              <span className="mono-id text-text">{account}</span>
              <button type="button" className="text-xs text-accent hover:underline" onClick={() => void wallet.disconnect().catch((e: unknown) => toast.showError(e))}>
                {t.disconnect}
              </button>
            </div>
          ) : wallet.status === 'unavailable' ? (
            <p className="text-text-3">{t.noConnector}</p>
          ) : (
            <button type="button" className="ck-btn" onClick={() => void wallet.connect().catch((e: unknown) => toast.showError(e))}>
              {t.connect}
            </button>
          )}
        </Step>

        <Step title={t.step2Title} done={funded}>
          <p>{t.step2Body}</p>
          <p className="font-medium text-text">{t.askOrganiser}</p>
          {account && (
            <>
              <button type="button" onClick={() => void copy()} className="ck-btn ck-btn--sm ck-btn--ghost">
                {copied ? t.copied : t.copyId}
              </button>
              <p className="num text-sm text-text-3">
                {t.balance}: {balance.data ? `${formatNear(balance.data.amount)} NEAR` : '…'} · {funded ? t.funded : t.notFunded}
              </p>
            </>
          )}
        </Step>

        <Step title={t.step3Title} done={false}>
          <p>{t.step3Body}</p>
          <p className="text-sm text-text-3">{t.orPick}</p>
          <ul className="divide-y divide-line border-y border-line">
            {(dep.data?.assets ?? []).map((a) => (
              <li key={a.asset_id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3 text-sm">
                <span className="font-medium text-text">{a.alias}</span>
                {a.simulated && <SimulatedBadge />}
                <span className="basis-full" />
                {(['reserve', 'return', 'fault'] as const).map((action) => (
                  <Link key={action} to={`/a/${a.asset_id}?action=${action}`} className="text-link">
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
