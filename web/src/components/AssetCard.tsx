import { Link } from 'react-router';
import type { BoardSnapshot } from '../data/hooks';
import type { DeployedAsset } from '../data/offchain';
import { Mark, SimulatedBadge } from './Badges';
import { FloatMeter } from './KasaBar';
import { MachineVisual } from './MachineVisual';
import { assetStatus } from './assetStatus';
import { useDemoThresholds } from '../data/hooks';
import { mostDueRule } from '../lib/metrics';
import { DemoThresholdChip } from './DemoThreshold';
import { useDemoLink } from '../demo/demo';

/** Shown on the machine card while get_service_status().in_service is false. */
export function OutOfServiceBand({ detail }: { detail?: string }) {
  return (
    <div role="status" className="rounded-md bg-danger-soft px-3.5 py-3 text-danger">
      <p className="text-xs font-semibold tracking-[0.1em]">OUT OF SERVICE</p>
      <p className="mt-1 text-sm text-text-2">{detail ?? 'No new reservations or sessions until a Repair task is rewarded or the council restores it.'}</p>
    </div>
  );
}

/** The machine card on the board: the machine, its name and account, status, float and its most-due upkeep. */
export function AssetCard({ deployed, snap }: { deployed: DeployedAsset; snap: BoardSnapshot }) {
  const status = assetStatus(snap);
  const sim = deployed.simulated || snap.profile.adapter === 'simulator';
  const link = useDemoLink();
  const demo = useDemoThresholds(deployed.asset_id, snap.rules);
  const due = mostDueRule(snap.rules);
  const ruleTitle = due ? (snap.profile.rules.find((r) => r.rule_id === due.rule.rule_id)?.title ?? due.rule.rule_id) : null;
  const shownDemo = due ? demo.get(due.rule.rule_id) : undefined;
  const hot = !!due && (due.fraction >= 1 || due.rule.open_task !== null);
  return (
    <article
      className="ck-card group relative flex min-w-0 flex-col overflow-hidden transition-shadow duration-200 hover:shadow-lg"
      aria-label={snap.meta.display_name}
    >
      <MachineVisual type={snap.profile.asset_type} className="border-b border-line" />
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="min-w-0">
          <h3 className="text-lg">
            <Link to={link(`/a/${deployed.asset_id}`)} className="no-underline after:absolute after:inset-0 group-hover:text-accent">
              {snap.meta.display_name}
            </Link>
          </h3>
          <p className="mono-id mt-1 truncate" title={deployed.asset_id}>
            {deployed.asset_id}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <Mark tone={status.tone}>{status.label}</Mark>
            {sim && <SimulatedBadge assetId={deployed.asset_id} />}
          </div>
        </div>

        {!snap.service.in_service && <OutOfServiceBand detail="Reservations paused until it is repaired." />}

        <div className="mt-auto space-y-4 border-t border-line pt-4">
          <FloatMeter ledger={snap.ledger} floatCap={snap.profile.float_cap} />
          {due && (
            <div>
              <p className="truncate text-sm text-text-2" title={ruleTitle ?? undefined}>
                {ruleTitle}
              </p>
              <div className={`ck-gauge mt-2 ${hot ? 'is-due' : ''}`} style={{ ['--v' as string]: `${Math.min(100, due.fraction * 100)}%` }}>
                <span />
              </div>
              <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="num text-xs text-text-3">
                  {due.bare(due.used)} / {due.format(due.threshold)}
                </span>
                {shownDemo && <DemoThresholdChip demo={shownDemo} compact />}
              </div>
            </div>
          )}
          {snap.profile.required_credential && (
            <p className="text-xs text-text-3">
              Needs a <span className="font-mono text-text-2">{snap.profile.required_credential}</span> credential
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
