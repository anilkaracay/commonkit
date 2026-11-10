import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { AssetAction, parseAction } from '../components/AssetAction';
import { useAssetSnapshot, useCommunities, useDemoThresholds, useDeployment, useEvidence } from '../data/hooks';
import { useDataSource } from '../data/source';
import type { Reservation } from '../data/types';
import { AssetIcon } from '../components/AssetIcon';
import { DeviceBadge, keylessLabel, Pill, SimulatedBadge, type Tone } from '../components/Badges';
import { KasaBar } from '../components/KasaBar';
import { KeepersList } from '../components/KeepersList';
import { UpkeepGauge, RuleBars } from '../components/UpkeepGauge';
import { OutOfServiceBand } from '../components/AssetCard';
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

const resTone: Partial<Record<Reservation['status'], Tone>> = {
  Confirmed: 'liability',
  InSession: 'alive',
  Finished: 'due',
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
    <div className="space-y-10">
      {/* Nameplate */}
      <header className={`tag overflow-hidden ${sim ? 'tag-sim' : ''}`}>
        <div className="grid grid-cols-1 gap-6 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="flex items-start gap-4">
            <div className={`grid size-16 shrink-0 place-items-center rounded-2xl border-2 ${sim ? 'border-sim text-sim' : 'border-ink text-ink'}`}>
              <AssetIcon type={s.profile.asset_type} size={36} />
            </div>
            <div className="min-w-0">
              <p className="eyebrow">
                <Link to={link(`/c/${deployed.community}`)} className="hover:underline">
                  {community?.community.name ?? deployed.community}
                </Link>{' '}
                · {s.profile.group_id}
              </p>
              <h1 className="text-3xl font-extrabold sm:text-4xl">{s.meta.display_name}</h1>
              <p className="mono-id mt-1">{assetId}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Pill tone={status.tone}>{status.label}</Pill>
                {sim && <SimulatedBadge />}
                {s.profile.required_credential && <Pill tone="danger">needs {s.profile.required_credential}</Pill>}
                <DeviceBadge assetId={assetId} />
                <Pill tone={deployed.keyless === true ? 'alive' : 'due'}>
                  {keylessLabel(deployed.keyless)} · {s.profile.adapter} adapter
                </Pill>
                <TxLink hash={deployed.deploy_tx} label="deploy tx" />
              </div>
              <p className="mt-3 max-w-xl text-sm text-ink-2">{s.meta.scenario_story_en}</p>
            </div>
          </div>
          <div className="flex justify-center">
            <UpkeepGauge rules={s.rules} ruleDefs={s.profile.rules} size={176} />
          </div>
        </div>
        {!s.service.in_service && (
          <div className="px-5 pb-4">
            <OutOfServiceBand detail={`Since ${formatDateTime(s.service.since)}. Reservations and sessions are refused (E_OUT_OF_SERVICE); upcoming reservations can be cancelled for a full refund.`} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-surface/60 px-5 py-3">
          {s.service.in_service ? (
            <Link to={link(`/a/${assetId}/reserve`)} className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-paper">
              Reserve
            </Link>
          ) : (
            <span aria-disabled className="cursor-not-allowed rounded-full bg-surface-2 px-4 py-1.5 text-sm font-medium text-ink-3">
              Reserve
            </span>
          )}
          <button
            type="button"
            disabled={wallet.status !== 'connected'}
            title={wallet.status === 'connected' ? 'Report a fault (needs a session in the last 14 days)' : (wallet.unavailableReason ?? 'Connect a wallet to report a fault')}
            onClick={() => navigate(link(`/a/${assetId}?action=fault`))}
            className="rounded-full border border-danger px-4 py-1.5 text-sm font-medium text-danger disabled:cursor-not-allowed disabled:opacity-50"
          >
            Report a fault
          </button>
          <span className="text-sm text-ink-2">
            <span className="num font-semibold text-ink">{formatNear(s.profile.price_per_slot)} NEAR</span> per {s.profile.slot_minutes} min
            {toYocto(s.profile.deposit) > 0n && (
              <>
                {' '}
                + <span className="num">{formatNear(s.profile.deposit)}</span> refundable deposit
              </>
            )}
          </span>
          <span className="ml-auto text-xs text-ink-3">status from chain · bridge live feed connects in M7</span>
        </div>
      </header>

      {action && <AssetAction action={action} snap={s} />}

      {sim && <SimulationPanel assetType={s.profile.asset_type} assetId={assetId} />}

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Section title="Kasa" eyebrow="what this machine holds">
          <div className="tag p-4">
            <KasaBar ledger={s.ledger} floatCap={s.profile.float_cap} />
            <p className={`mt-3 text-xs ${s.ledger.invariant_ok ? 'text-alive' : 'text-danger'}`}>
              {s.ledger.invariant_ok ? 'Balance covers every obligation (invariant_ok).' : 'Ledger invariant is broken.'}{' '}
              <span className="text-ink-3">balance {formatNear(s.ledger.balance)} NEAR incl. {formatNear(s.ledger.storage_reserve)} storage reserve</span>
            </p>
          </div>
        </Section>
        <Section title="Who keeps me alive" eyebrow="maintainers and trainers">
          <div className="tag px-4 py-1">
            <KeepersList tasks={s.tasks} trainings={trainings} nowMs={now} />
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <Section title="Upkeep rules" eyebrow={`profile v${s.wiring.profile_version}`}>
          <div className="tag p-4">
            <RuleBars rules={s.rules} ruleDefs={s.profile.rules} demo={demo} />
          </div>
        </Section>
        <Section title="Telemetry" eyebrow={`${s.telemetry.reports} reports from the bridge`}>
          <dl className="tag grid grid-cols-2 gap-4 p-4">
            {s.telemetry.metrics.map(([m, v]) => (
              <div key={m}>
                <dt className="text-xs text-ink-3">{metricLabel(m)}</dt>
                <dd className="num text-lg font-semibold">{formatMetric(m, v)}</dd>
              </div>
            ))}
            <p className="col-span-2 text-xs text-ink-3">updated {formatAgo(s.telemetry.updated_at, now)} · counters only go up</p>
          </dl>
        </Section>
      </div>

      {(s.faults.some((f) => f.reports.length > 0) || s.serviceLog.length > 0) && (
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <Section title="Fault reports" eyebrow="from members who used it in the last 14 days">
            <ul className="tag divide-y divide-line px-4">
              {s.faults.flatMap((f) =>
                f.reports.map((r) => (
                  <li key={`${f.rule_id}-${r.reporter}`} className="py-2.5 text-sm">
                    <Account id={r.reporter} /> <span className="text-xs text-ink-3">· {f.rule_id} · {formatAgo(r.at, now)}</span>
                    <p className="num text-[11px] break-all text-ink-3">note sha256 {r.note_hash}</p>
                  </li>
                )),
              )}
            </ul>
          </Section>
          <Section title="Service log" eyebrow="out-of-service periods">
            <ul className="tag divide-y divide-line px-4">
              {s.serviceLog.map((p) => (
                <li key={p.seq} className="py-2.5 text-sm">
                  <p>
                    {formatDateTime(p.started_at)} → {p.ended_at ? formatDateTime(p.ended_at) : <span className="font-medium text-danger">still out</span>}
                  </p>
                  <p className="text-xs text-ink-3">
                    by <Account id={p.started_by} />
                    {p.ended_by && ('RepairRewarded' in p.ended_by ? ` · restored by repair task #${p.ended_by.RepairRewarded.task_id}` : ' · restored by council')}
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      <Section title="Tasks" eyebrow="upkeep opened by the operations agent">
        {s.tasks.length === 0 ? (
          <Empty>No upkeep tasks yet. One opens when a rule above is due.</Empty>
        ) : (
          <ul className="tag divide-y divide-line px-4">
            {[...s.tasks].reverse().map((t) => (
              <TaskRow key={t.id} task={t} assetId={assetId} rule={s.profile.rules.find((r) => r.rule_id === t.rule_id)} simulated={sim} nowMs={now} txHash={ds.rowTx(`task-${deployed.alias}-${t.id}`)} />
            ))}
          </ul>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <Section title="Next slots" eyebrow={`${s.profile.slot_minutes} min each · UTC`}>
          <ol className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {(avail.data ?? []).map(({ reservation_id: holder }, i) => {
              const slotNo = nowSlot + BigInt(i);
              return (
                <li
                  key={i}
                  className={`rounded-md border px-1 py-1.5 text-center text-[11px] ${holder ? 'border-transparent bg-ink text-paper' : 'border-line-strong bg-surface'}`}
                  title={holder ? `reservation #${holder}` : 'free'}
                >
                  <span className="num block">{formatTime(slotStartNs(slotNo, s.profile.slot_minutes))}</span>
                  <span className="block opacity-70">{holder ? `#${holder}` : 'free'}</span>
                </li>
              );
            })}
          </ol>
        </Section>
        <Section title="Reservations" eyebrow="latest first">
          <ul className="tag divide-y divide-line px-4">
            {[...s.reservations].reverse().map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-2.5 text-sm">
                <span className="num w-8 shrink-0 text-xs text-ink-3">#{r.id}</span>
                <div className="min-w-0 flex-1">
                  <p>
                    <Account id={r.holder} /> <span className="text-ink-3">· {r.slots} slot{r.slots > 1 ? 's' : ''}</span>
                  </p>
                  <p className="text-xs text-ink-3">
                    {formatDateTime(slotStartNs(r.start_slot, s.profile.slot_minutes))} ·{' '}
                    {r.right_id ? `right ${r.right_id}` : `fee ${formatNear(r.fee_paid)}`}
                    {toYocto(r.deposit_paid) > 0n && ` + deposit ${formatNear(r.deposit_paid)}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Pill tone={resTone[r.status] ?? 'muted'}>{r.status}</Pill>
                  {r.status === 'Confirmed' && (
                    <Link to={link(`/a/${assetId}/access/${r.id}`)} className="text-xs underline decoration-dotted">
                      start
                    </Link>
                  )}
                  <TxLink hash={ds.rowTx(`res-${deployed.alias}-${r.id}`)} />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <Section title="Escalations" eyebrow="payments above the cash cap go to the DAO">
          {s.escalations.length === 0 ? (
            <Empty>No escalations. Purchases above the cap become Sputnik proposals opened by this contract.</Empty>
          ) : (
            <ul className="tag divide-y divide-line px-4">
              {s.escalations.map((e) => (
                <li key={e.id} className="py-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p>
                      <span className="num font-semibold">{formatNear(e.amount)} NEAR</span> {e.kind} → <Account id={e.receiver} />
                    </p>
                    <Pill tone={e.status === 'Approved' ? 'alive' : e.status === 'Submitted' ? 'due' : 'muted'}>{e.status}</Pill>
                  </div>
                  <p className="mt-1 text-xs text-ink-2">{e.reason}</p>
                  <p className="mt-1 text-xs text-ink-3">
                    proposal #{e.proposal_id ?? '—'} in {s.wiring.dao_id} · bond {formatNear(e.bond_paid)} NEAR from float
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Reputation" eyebrow="on this machine">
          {rep.size === 0 ? (
            <Empty>No sessions yet.</Empty>
          ) : (
            <table className="tag w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-3">
                  <th className="p-3 font-normal">member</th>
                  <th className="p-3 text-right font-normal">sessions</th>
                  <th className="p-3 text-right font-normal">clean</th>
                  <th className="p-3 text-right font-normal">faults</th>
                  <th className="p-3 text-right font-normal">upkeep</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[...rep].sort((a, b) => b[1].maint - a[1].maint || b[1].clean - a[1].clean).map(([acc, e]) => (
                  <tr key={acc}>
                    <td className="p-3"><Account id={acc} /></td>
                    <td className="num p-3 text-right">{e.sessions}</td>
                    <td className="num p-3 text-right">{e.clean}</td>
                    <td className="num p-3 text-right">{e.faults}</td>
                    <td className="num p-3 text-right font-semibold text-alive">{e.maint}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      <Section title="Profile" eyebrow="the rules this account enforces">
        <dl className="tag grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-4">
          {(
            [
              ['slot', `${s.profile.slot_minutes} min`],
              ['max slots', String(s.profile.max_slots_per_reservation)],
              ['price / slot', `${formatNear(s.profile.price_per_slot)} NEAR`],
              ['deposit', `${formatNear(s.profile.deposit)} → ${formatNear(s.profile.deposit_trusted)} after ${s.profile.trusted_after} clean`],
              ['float cap', `${formatNear(s.profile.float_cap)} NEAR`],
              ['reward quota', `${s.period.rights_minted}/${s.profile.period_reward_quota} rights per ${s.profile.period_days} d`],
              ['right covers', `${s.profile.right_max_slots} slots · ${s.profile.right_validity_days} d`],
              ['DAO', s.wiring.dao_id],
              ['agent', s.wiring.agent_id ?? 'none (revoked)'],
              ['bridge', s.wiring.bridge_id ?? 'none'],
              ['code_hash', s.account.code_hash],
              ['explorer', config.explorerUrl.replace(/^https?:\/\//, '')],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-ink-3">{k}</dt>
              <dd className="num text-xs break-all">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}

/** Simulator assets: the button does nothing on-chain; it shows how to run it and the last run. */
function SimulationPanel({ assetType, assetId }: { assetType: string; assetId: string }) {
  const evidence = useEvidence();
  const run = evidence.data?.find((st) => st.step === 15);
  const device = deviceOf(assetId);
  const emulated = device?.kind === 'emulated';
  const adapter = device?.adapter ?? '';
  return (
    <div className="tag tag-sim flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex-1">
        <p className="flex items-center gap-2 font-medium">
          <SimulatedBadge /> This machine is simulated
        </p>
        <p className="mt-1 text-sm text-ink-2">
          {emulated ? (
            <>
              The real <span className="num">{adapter}</span> adapter talks to an emulated device; no physical machine is involved. Run the emulated stack yourself:
            </>
          ) : (
            <>
              Telemetry comes from a simulator scenario for <span className="num">{assetType}</span>, not hardware.
            </>
          )}
        </p>
        <code className="mt-2 block rounded-md bg-ink px-3 py-2 font-mono text-xs break-all text-paper">
          {emulated ? 'pnpm --filter @commonkit/bridge dev:emulated' : `./scripts/simulate.sh ${assetType}`}
        </code>
        {!emulated && <p className="mt-1 text-xs text-ink-3">simulate.sh is still being written (README); until then the bridge simulator runs this scenario.</p>}
      </div>
      <div className="text-sm sm:w-64">
        <a href={`${config.repoUrl}#simulation`} target="_blank" rel="noreferrer" className="inline-block rounded-full border border-sim px-4 py-1.5 font-medium text-sim">
          Run simulation
        </a>
        {run && (
          <p className="mt-2 text-xs text-ink-2">
            Latest run: step {run.step} · {new Date(run.timestamp).toISOString().slice(0, 16).replace('T', ' ')} UTC <TxLink hash={run.txHashes[0]} />
          </p>
        )}
      </div>
    </div>
  );
}
