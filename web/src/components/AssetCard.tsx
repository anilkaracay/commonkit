import { Link } from 'react-router';
import type { BoardSnapshot } from '../data/hooks';
import type { DeployedAsset } from '../data/offchain';
import { AssetIcon } from './AssetIcon';
import { DeviceBadge, Pill, SimulatedBadge } from './Badges';
import { KasaBar } from './KasaBar';
import { UpkeepGauge } from './UpkeepGauge';
import { assetStatus } from './assetStatus';
import { useDemoLink } from '../demo/demo';

/** Shown on the nameplate while get_service_status().in_service is false. */
export function OutOfServiceBand({ detail }: { detail?: string }) {
  return (
    <div role="status" className="rounded-tag-sm border-2 border-danger bg-danger-soft px-3 py-2 text-danger">
      <p className="font-mono text-xs font-bold tracking-[0.14em]">OUT OF SERVICE</p>
      <p className="text-xs text-ink-2">{detail ?? 'No new reservations or sessions until a Repair task is rewarded or the council restores it.'}</p>
    </div>
  );
}

/** The machine nameplate used on the board: name, account, status, dial, cash box. */
export function AssetCard({ deployed, snap }: { deployed: DeployedAsset; snap: BoardSnapshot }) {
  const status = assetStatus(snap);
  const sim = deployed.simulated || snap.profile.adapter === 'simulator';
  const link = useDemoLink();
  return (
    <article className={`tag relative flex min-w-0 flex-col gap-4 p-4 ${sim ? 'tag-sim' : ''}`} aria-label={snap.meta.display_name}>
      <header className="flex items-start gap-3">
        <div className={`grid size-12 shrink-0 place-items-center rounded-xl border ${sim ? 'border-sim text-sim' : 'border-line-strong text-ink'}`}>
          <AssetIcon type={snap.profile.asset_type} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold">
              <Link to={link(`/a/${deployed.asset_id}`)} className="after:absolute after:inset-0 hover:underline">
                {snap.meta.display_name}
              </Link>
            </h3>
            {sim && <SimulatedBadge />}
            <DeviceBadge adapter={snap.profile.adapter} />
          </div>
          <p className="mono-id truncate">{deployed.asset_id}</p>
        </div>
      </header>

      <div className="flex items-center gap-4">
        <UpkeepGauge rules={snap.rules} ruleDefs={snap.profile.rules} size={118} />
        <div className="min-w-0 flex-1 space-y-2 text-sm">
          <Pill tone={status.tone}>{status.label}</Pill>
          <p className="text-ink-2">
            <span className="num">{snap.profile.group_id}</span>
          </p>
          {snap.profile.required_credential && (
            <p className="text-xs">
              needs <span className="num font-semibold text-cred">{snap.profile.required_credential}</span>
            </p>
          )}
        </div>
      </div>

      {!snap.service.in_service && <OutOfServiceBand />}

      <KasaBar ledger={snap.ledger} floatCap={snap.profile.float_cap} compact />
    </article>
  );
}
