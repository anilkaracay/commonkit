import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { AssetAction, parseAction } from '../components/AssetAction';
import { useAssetSnapshot, useCommunities, useDemoThresholds, useDeployment, useEvidence } from '../data/hooks';
import { useDataSource } from '../data/source';
import type { Reservation } from '../data/types';
import { keylessLabel, Mark, SimulatedBadge, type Tone } from '../components/Badges';
import { KasaBar, MoneyFigures } from '../components/KasaBar';
import { KeepersList } from '../components/KeepersList';
import { UpkeepGauge, RuleBars } from '../components/UpkeepGauge';
import { OutOfServiceBand } from '../components/AssetCard';
import { MachineVisual } from '../components/MachineVisual';
import { useWallet } from '../wallet/wallet';
import { Empty, LoadError, Loading, Section } from '../components/Section';
import { TaskRow } from '../components/TaskRow';
import { Account, TxLink } from '../components/TxLink';
import { assetStatus } from '../components/assetStatus';
import { useDemoLink } from '../demo/demo';
import { config } from '../lib/config';
import { formatMetric, metricLabel } from '../lib/metrics';
import { formatNear, toYocto } from '../lib/near';
import { formatAgo, formatDateTime, formatTime, slotOf, slotStartNs } from '../lib/time';
import { NotFoundPage } from './NotFound';
import { deviceOf } from '../data/devices';
import { ReservationActions } from '../components/ReservationActions';

const resTone: Partial<Record<Reservation['status'], Tone>> = {
  Confirmed: 'ok',
  InSession: 'ok',
  Finished: 'quiet',
  Disputed: 'danger',
  Rejected: 'danger',
};

/** `/a/:assetId` — the machine card. */
export function AssetPage() {
  const { assetId = '' } = useParams();
  const ds = useDataSource();
  const dep = useDeployment();
  const q = useAssetSnapshot(assetId);
  const comms = useCommunities();
  const link = useDemoLink();
  const wallet = useWallet();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const action = parseAction(params.get('action'));
  const now = ds.now();

  const slotMinutes = q.data?.profile.slot_minutes ?? 60;
  const nowSlot = slotOf(BigInt(now) * 1_000_000n, slotMinutes);
  const avail = useQuery({
    queryKey: ['availability', ds.kind, assetId, nowSlot.toString()],
    enabled: !!q.data,
    queryFn: () => ds.asset(assetId).get_availability(nowSlot.toString(), 12),
  });

  const deployed = dep.data?.assets.find((a) => a.asset_id === assetId);
  const demo = useDemoThresholds(assetId, q.data?.rules ?? []);
  if (dep.data && !deployed) return <NotFoundPage what={`asset "${assetId}"`} />;
  if (q.error) return <LoadError error={q.error} />;
  if (!q.data || !deployed) return <Loading what="the machine" />;
  const s = q.data;
  const sim = deployed.simulated || s.profile.adapter === 'simulator';
  const status = assetStatus(s);
  const community = comms.data?.find((c) => c.community.slug === deployed.community);
  const trainings = community?.trainings.filter((t) => t.kind === s.profile.required_credential) ?? [];

  const rep = new Map<string, { sessions: number; clean: number; maint: number; faults: number }>();
  for (const r of s.reputationLog) {
    const e = rep.get(r.account) ?? { sessions: 0, clean: 0, maint: 0, faults: 0 };
    if (r.kind === 'session') e.sessions += 1;
    if (r.kind === 'clean_return') e.clean += 1;
    if (r.kind === 'upkeep') e.maint += 1;
    if (r.kind === 'fault_report') e.faults += 1;
    rep.set(r.account, e);
  }

  return (
    <div className="space-y-16 sm:space-y-20">
      {/* The machine card: the machine first, then who it is, what it holds, and what you can do. */}
      <header className="ck-card grid overflow-hidden lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <MachineVisual type={s.profile.asset_type} priority className="border-b border-line lg:aspect-auto lg:min-h-full lg:border-r lg:border-b-0" />
        <div className="flex min-w-0 flex-col gap-7 p-5 sm:p-8 lg:p-10">
          <div className="min-w-0">
            <p className="text-sm text-text-3">
              <Link to={link(`/c/${deployed.community}`)} className="no-underline hover:text-accent">
                {community?.community.name ?? deployed.community}
              </Link>
              <span className="font-mono text-xs"> · {s.profile.group_id}</span>
            </p>
            <h1 className="display mt-2 text-[34px] sm:text-[44px]">{s.meta.display_name}</h1>
            <p className="mono-id mt-2">{assetId}</p>
            <p className="mt-4 max-w-[34rem] text-text-2">{s.meta.scenario_story_en}</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              <Mark tone={status.tone}>{status.label}</Mark>
              {sim && <SimulatedBadge assetId={assetId} />}
            </div>
          </div>

          {!s.service.in_service && (
            <OutOfServiceBand detail={`Since ${formatDateTime(s.service.since)}. Reservations and sessions are refused; upcoming reservations can be cancelled for a full refund.`} />
          )}

          <MoneyFigures ledger={s.ledger} floatCap={s.profile.float_cap} />

          <div className="space-y-3 border-t border-line pt-6">
            <div className="flex flex-wrap items-center gap-3">
              {s.service.in_service ? (
                <Link to={link(`/a/${assetId}/reserve`)} className="ck-btn ck-btn--lg">
                  Reserve
                </Link>
              ) : (
                <span aria-disabled="true" className="ck-btn ck-btn--lg">
                  Reserve
                </span>
              )}
              <button
                type="button"
                disabled={wallet.status !== 'connected'}
                title={wallet.status === 'connected' ? 'Report a fault (needs a session in the last 14 days)' : (wallet.unavailableReason ?? 'Connect a wallet to report a fault')}
                onClick={() => navigate(link(`/a/${assetId}?action=fault`))}
                className="ck-btn ck-btn--lg ck-btn--ghost"
              >
                Report a fault
              </button>
            </div>
            <p className="text-sm text-text-3">
              <span className="num font-semibold text-text">{formatNear(s.profile.price_per_slot)} NEAR</span> per {s.profile.slot_minutes} min
              {toYocto(s.profile.deposit) > 0n && (
                <>
                  {' '}
                  · <span className="num">{formatNear(s.profile.deposit)}</span> NEAR refundable deposit
                </>
              )}
              {s.profile.required_credential && (
                <>
                  {' '}
                  · needs a <span className="font-mono text-xs text-text-2">{s.profile.required_credential}</span> credential
                </>
              )}
            </p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-3">
              <span>{keylessLabel(deployed.keyless)}</span>
              <span>· {s.profile.adapter} adapter</span>
              <span>· read live from NEAR testnet</span>
              <TxLink hash={deployed.deploy_tx} label="deploy tx" />
            </p>
          </div>
        </div>
      </header>

      {action && <AssetAction action={action} snap={s} />}

      {sim && <SimulationPanel assetType={s.profile.asset_type} assetId={assetId} />}

      <Section title="Upkeep" note={`Profile v${s.wiring.profile_version} · the rule closest to its trigger, then every rule`}>
        <div className="panel grid gap-10 p-5 pb-6 sm:p-8 md:grid-cols-[220px_minmax(0,1fr)] md:items-center md:gap-12">
          <div className="flex justify-center pb-12">
            <UpkeepGauge rules={s.rules} ruleDefs={s.profile.rules} size={196} />
          </div>
          <RuleBars rules={s.rules} ruleDefs={s.profile.rules} demo={demo} />
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
        <Section title="Who keeps me alive" note="Members whose upkeep or training was rewarded">
          <div className="panel p-5 sm:p-6">
            <KeepersList tasks={s.tasks} trainings={trainings} nowMs={now} />
          </div>
        </Section>
        <Section title="Money" note={s.ledger.invariant_ok ? 'The balance covers every obligation.' : 'Ledger invariant is broken.'}>
          <div className="panel p-5 sm:p-6">
            <KasaBar ledger={s.ledger} floatCap={s.profile.float_cap} />
            <p className={`mt-4 text-xs ${s.ledger.invariant_ok ? 'text-text-3' : 'text-danger'}`}>
              Balance <span className="num">{formatNear(s.ledger.balance)}</span> NEAR, including <span className="num">{formatNear(s.ledger.storage_reserve)}</span> storage reserve
              {s.ledger.invariant_ok ? ' · invariant_ok' : ''}
            </p>
          </div>
        </Section>
      </div>

      <Section title="Telemetry" note={`${s.telemetry.reports} reports from the bridge · updated ${formatAgo(s.telemetry.updated_at, now)} · counters only go up`}>
        <dl className="panel grid grid-cols-2 overflow-hidden sm:grid-cols-3 lg:grid-cols-6">
          {s.telemetry.metrics.map(([m, v]) => (
            <div key={m} className="min-w-0 p-5 shadow-[inset_-1px_-1px_0_var(--ck-line)]">
              <dt className="truncate text-sm text-text-3">{metricLabel(m)}</dt>
              <dd className="num mt-1 text-2xl font-medium tracking-tight">{formatMetric(m, v)}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Tasks" note="Upkeep opened by the operations agent">
        {s.tasks.length === 0 ? (
          <Empty>No upkeep tasks yet. One opens when a rule above is due.</Empty>
        ) : (
          <ul className="panel divide-y divide-line">
            {[...s.tasks].reverse().map((t) => (
              <TaskRow key={t.id} task={t} assetId={assetId} rule={s.profile.rules.find((r) => r.rule_id === t.rule_id)} simulated={sim} nowMs={now} txHash={ds.rowTx(`task-${deployed.alias}-${t.id}`)} />
            ))}
          </ul>
        )}
      </Section>

      {(s.faults.some((f) => f.reports.length > 0) || s.serviceLog.length > 0) && (
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-10">
          <Section title="Fault reports" note="From members who used it in the last 14 days">
            <ul className="panel divide-y divide-line">
              {s.faults.flatMap((f) =>
                f.reports.map((r) => (
                  <li key={`${f.rule_id}-${r.reporter}`} className="px-5 py-4 text-sm">
                    <Account id={r.reporter} /> <span className="text-text-3">· {f.rule_id} · {formatAgo(r.at, now)}</span>
                    <p className="mono-id mt-1 break-all">note sha256 {r.note_hash}</p>
                  </li>
                )),
              )}
            </ul>
          </Section>
          <Section title="Service log" note="Out-of-service periods">
            <ul className="panel divide-y divide-line">
              {s.serviceLog.map((p) => (
                <li key={p.seq} className="px-5 py-4 text-sm">
                  <p className="num">
                    {formatDateTime(p.started_at)} → {p.ended_at ? formatDateTime(p.ended_at) : <span className="font-medium text-danger">still out</span>}
                  </p>
                  <p className="mt-1 text-text-3">
                    by <Account id={p.started_by} />
                    {p.ended_by && ('RepairRewarded' in p.ended_by ? ` · restored by repair task #${p.ended_by.RepairRewarded.task_id}` : ' · restored by council')}
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      <div className="grid grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-10">
        <Section title="Next slots" note={`${s.profile.slot_minutes} min each · UTC`}>
          {avail.isLoading && <Loading what="slots" />}
          {avail.error && <LoadError error={avail.error} />}
          <ol className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {(avail.data ?? []).map(({ reservation_id: holder }, i) => {
              const slotNo = nowSlot + BigInt(i);
              return (
                <li
                  key={i}
                  className={`rounded-sm px-1 py-2.5 text-center text-xs ${holder ? 'bg-inverse text-inverse-text' : 'bg-bg-alt text-text-2'}`}
                  title={holder ? `reservation #${holder}` : 'free'}
                >
                  <span className="num block text-sm font-medium">{formatTime(slotStartNs(slotNo, s.profile.slot_minutes))}</span>
                  <span className={`block ${holder ? 'text-inverse-text-2' : 'text-text-3'}`}>{holder ? `#${holder}` : 'free'}</span>
                </li>
              );
            })}
          </ol>
        </Section>
        <Section title="Reservations" note="Latest first">
          {s.reservations.length === 0 ? (
            <Empty>No reservations yet.</Empty>
          ) : (
            <ul className="panel divide-y divide-line">
              {[...s.reservations].reverse().map((r) => (
                <li key={r.id} className="flex items-start gap-4 px-5 py-4 text-sm">
                  <span className="num w-7 shrink-0 text-text-3">#{r.id}</span>
                  <div className="min-w-0 flex-1">
                    <p>
                      <Account id={r.holder} /> <span className="text-text-3">· {r.slots} slot{r.slots > 1 ? 's' : ''}</span>
                    </p>
                    <p className="num mt-1 text-text-3">
                      {formatDateTime(slotStartNs(r.start_slot, s.profile.slot_minutes))} · {r.right_id ? `right ${r.right_id}` : `fee ${formatNear(r.fee_paid)}`}
                      {toYocto(r.deposit_paid) > 0n && ` + deposit ${formatNear(r.deposit_paid)}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Mark tone={resTone[r.status] ?? 'quiet'}>{r.status}</Mark>
                    {r.status === 'Confirmed' && (
                      <Link to={link(`/a/${assetId}/access/${r.id}`)} className="text-link text-xs">
                        Start →
                      </Link>
                    )}
                    <ReservationActions assetId={assetId} r={r} profile={s.profile} nowMs={now} />
                    <TxLink hash={ds.rowTx(`res-${deployed.alias}-${r.id}`)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-10">
        <Section title="Escalations" note="Payments above the cash cap become DAO proposals">
          {s.escalations.length === 0 ? (
            <Empty>No escalations. Purchases above the cap become Sputnik proposals opened by this contract.</Empty>
          ) : (
            <ul className="panel divide-y divide-line">
              {s.escalations.map((e) => (
                <li key={e.id} className="px-5 py-4 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p>
                      <span className="num font-semibold">{formatNear(e.amount)} NEAR</span> {e.kind} → <Account id={e.receiver} />
                    </p>
                    <Mark tone={e.status === 'Approved' ? 'ok' : 'quiet'}>{e.status}</Mark>
                  </div>
                  <p className="mt-1 text-text-2">{e.reason}</p>
                  <p className="num mt-1 text-xs text-text-3">
                    proposal #{e.proposal_id ?? '—'} in {s.wiring.dao_id} · bond {formatNear(e.bond_paid)} NEAR from float
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Reputation" note="On this machine">
          {rep.size === 0 ? (
            <Empty>No sessions yet.</Empty>
          ) : (
            <div className="panel overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-text-3">
                    <th className="px-5 py-3 font-normal">Member</th>
                    <th className="px-3 py-3 text-right font-normal">Sessions</th>
                    <th className="px-3 py-3 text-right font-normal">Clean</th>
                    <th className="px-3 py-3 text-right font-normal">Faults</th>
                    <th className="py-3 pr-5 pl-3 text-right font-normal">Upkeep</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line border-t border-line">
                  {[...rep]
                    .sort((a, b) => b[1].maint - a[1].maint || b[1].clean - a[1].clean)
                    .map(([acc, e]) => (
                      <tr key={acc}>
                        <td className="px-5 py-3">
                          <Account id={acc} />
                        </td>
                        <td className="num px-3 py-3 text-right">{e.sessions}</td>
                        <td className="num px-3 py-3 text-right">{e.clean}</td>
                        <td className="num px-3 py-3 text-right">{e.faults}</td>
                        <td className="num py-3 pr-5 pl-3 text-right font-semibold text-accent">{e.maint}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>

      <Section title="Profile" note="The rules this account enforces">
        <dl className="panel grid grid-cols-1 gap-x-8 px-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
          {(
            [
              ['Slot', `${s.profile.slot_minutes} min`],
              ['Max slots', String(s.profile.max_slots_per_reservation)],
              ['Price per slot', `${formatNear(s.profile.price_per_slot)} NEAR`],
              ['Deposit', `${formatNear(s.profile.deposit)} → ${formatNear(s.profile.deposit_trusted)} after ${s.profile.trusted_after} clean`],
              ['Float cap', `${formatNear(s.profile.float_cap)} NEAR`],
              ['Reward quota', `${s.period.rights_minted}/${s.profile.period_reward_quota} rights per ${s.profile.period_days} d`],
              ['A right covers', `${s.profile.right_max_slots} slots · ${s.profile.right_validity_days} d`],
              ['DAO', s.wiring.dao_id],
              ['Agent', s.wiring.agent_id ?? 'none (revoked)'],
              ['Bridge', s.wiring.bridge_id ?? 'none'],
              ['code_hash', s.account.code_hash],
              ['Explorer', config.explorerUrl.replace(/^https?:\/\//, '')],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex min-w-0 items-baseline justify-between gap-4 border-b border-line py-3">
              <dt className="shrink-0 text-sm text-text-3">{k}</dt>
              <dd className="num min-w-0 text-right text-sm break-all">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}

/** Simulator assets: nothing here runs on-chain by itself; it shows how to run the loop and the last run. */
function SimulationPanel({ assetType, assetId }: { assetType: string; assetId: string }) {
  const evidence = useEvidence();
  // Judge step 15 is the washer's simulate.sh run on testnet; other assets have no such step.
  const run = assetType === 'washer' ? evidence.data?.find((st) => st.step === 15) : undefined;
  const device = deviceOf(assetId);
  return (
    <section aria-label="Simulation" className="grid gap-5 rounded-md bg-bg-alt p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-10">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-medium">
          No physical machine behind this account <SimulatedBadge assetId={assetId} />
        </p>
        <p className="mt-2 text-sm text-text-2">
          {device?.kind === 'emulated' ? (
            <>
              The real <span className="font-mono text-xs">{device.adapter}</span> adapter drives an emulated device that implements the device's API.
            </>
          ) : (
            <>Telemetry comes from a simulator scenario.</>
          )}{' '}
          The same loop runs locally against a NEAR sandbox with the real contracts, bridge and agent: reserve, upkeep task, approval, rights.
        </p>
      </div>
      <div className="min-w-0 space-y-2.5">
        <code className="code">./scripts/simulate.sh {assetType}</code>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-3">
          <a href={`${config.repoUrl}#simulation`} target="_blank" rel="noreferrer" className="text-link">
            How to run it ↗
          </a>
          {run && (
            <span>
              Latest testnet run: step {run.step} · {new Date(run.timestamp).toISOString().slice(0, 16).replace('T', ' ')} UTC <TxLink hash={run.txHashes[0]} />
            </span>
          )}
        </p>
      </div>
    </section>
  );
}
