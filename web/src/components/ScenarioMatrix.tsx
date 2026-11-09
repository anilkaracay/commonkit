import type { CatalogEntry } from '../data/offchain';
import { UPKEEP_KINDS, type UpkeepKind } from '../data/types';
import { describeTrigger } from '../lib/metrics';
import { AssetIcon } from './AssetIcon';
import { Pill, type Tone } from './Badges';
import { KIND_LABEL, KindIcon } from './UpkeepKind';

function statusTone(status: string): Tone {
  if (status.startsWith('real hardware')) return 'alive';
  if (status.startsWith('simulation')) return 'sim';
  return 'muted';
}

/**
 * Same WASM, different profile: every profile in profiles/, grouped by the kinds of upkeep it
 * asks for, with an honest Status column (real hardware / simulation / profile example only).
 */
export function ScenarioMatrix({ catalog }: { catalog: CatalogEntry[] }) {
  const byKind = new Map<UpkeepKind, { entry: CatalogEntry; rules: CatalogEntry['profile']['rules'] }[]>();
  for (const entry of catalog) {
    for (const kind of UPKEEP_KINDS) {
      const rules = entry.profile.rules.filter((r) => r.kind === kind);
      if (rules.length) byKind.set(kind, [...(byKind.get(kind) ?? []), { entry, rules }]);
    }
  }
  return (
    <div className="space-y-2">
      {[...byKind].map(([kind, rows]) => (
        <details key={kind} className="group tag overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 p-3 [&::-webkit-details-marker]:hidden">
            <KindIcon kind={kind} size={16} />
            <h3 className="text-base font-bold">{KIND_LABEL[kind]}</h3>
            <span className="text-xs text-ink-3">{rows.length} profile{rows.length === 1 ? '' : 's'}</span>
            <span className="ml-auto flex min-w-0 items-center gap-1 overflow-hidden text-ink-2">
              {rows.map(({ entry }) => (
                <span key={entry.file} title={entry.meta.display_name} className={entry.meta.status.startsWith('simulation') ? 'text-sim' : ''}>
                  <AssetIcon type={entry.profile.asset_type} size={16} />
                </span>
              ))}
            </span>
            <span aria-hidden className="text-ink-3 transition-transform group-open:rotate-90">›</span>
          </summary>
          <div className="border-t border-line">
            <table className="w-full table-fixed text-sm">
              <thead className="hidden sm:table-header-group">
                <tr className="text-left text-xs text-ink-3">
                  <th className="w-[34%] p-3 font-normal">asset</th>
                  <th className="p-3 font-normal">upkeep rules</th>
                  <th className="w-[26%] p-3 font-normal">status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map(({ entry, rules }) => (
                  <tr key={entry.file} className="block p-3 sm:table-row sm:p-0">
                    <td className="block sm:table-cell sm:p-3">
                      <span className="flex items-center gap-2 font-medium">
                        <AssetIcon type={entry.profile.asset_type} size={18} />
                        <span className="min-w-0 break-words">{entry.meta.display_name}</span>
                      </span>
                      <span className="num block text-[11px] text-ink-3">{entry.file}</span>
                    </td>
                    <td className="block py-1 text-xs text-ink-2 sm:table-cell sm:p-3">
                      {rules.map((r) => (
                        <span key={r.rule_id} className="block">
                          {r.title} <span className="num text-ink-3">· {describeTrigger(r.trigger)} · {r.reward_rights} right{r.reward_rights === 1 ? '' : 's'}</span>
                        </span>
                      ))}
                    </td>
                    <td className="block sm:table-cell sm:p-3">
                      <Pill tone={statusTone(entry.meta.status)}>{entry.meta.status}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </div>
  );
}
