import type { CatalogEntry } from '../data/offchain';
import { UPKEEP_KINDS, type UpkeepKind } from '../data/types';
import { describeTrigger } from '../lib/metrics';
import { AssetIcon } from './AssetIcon';
import { Mark, type Tone } from './Badges';
import { KIND_LABEL, KindIcon } from './UpkeepKind';

function statusTone(status: string): Tone {
  if (status.startsWith('real hardware')) return 'ok';
  return 'quiet';
}

/**
 * Same WASM, different profile: every profile in profiles/, grouped by the kinds of upkeep it
 * asks for, with an honest Status column (real hardware / simulation / simulator profile).
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
    <div className="panel divide-y divide-line overflow-hidden">
      {[...byKind].map(([kind, rows]) => (
        <details key={kind} className="group">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 hover:bg-bg-alt [&::-webkit-details-marker]:hidden">
            <span className="text-slate-400">
              <KindIcon kind={kind} size={16} />
            </span>
            <h3 className="text-base font-medium">{KIND_LABEL[kind]}</h3>
            <span className="num text-sm text-text-3">{rows.length}</span>
            <span className="ml-auto flex min-w-0 items-center gap-1.5 overflow-hidden text-slate-400">
              {rows.map(({ entry }) => (
                <span key={entry.file} title={entry.meta.display_name}>
                  <AssetIcon type={entry.profile.asset_type} size={16} />
                </span>
              ))}
            </span>
            <span aria-hidden className="text-text-3 transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <table className="w-full table-fixed border-t border-line text-sm">
            <thead className="hidden sm:table-header-group">
              <tr className="text-left text-xs text-text-3">
                <th className="w-[32%] px-5 py-2.5 font-normal">Asset</th>
                <th className="px-5 py-2.5 font-normal">Upkeep rules</th>
                <th className="w-[28%] px-5 py-2.5 font-normal">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(({ entry, rules }) => (
                <tr key={entry.file} className="block px-5 py-3 sm:table-row sm:p-0">
                  <td className="block align-top sm:table-cell sm:px-5 sm:py-3">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="text-slate-400">
                        <AssetIcon type={entry.profile.asset_type} size={18} />
                      </span>
                      <span className="min-w-0 break-words">{entry.meta.display_name}</span>
                    </span>
                    <span className="mono-id mt-0.5 block">{entry.file}</span>
                  </td>
                  <td className="block py-1.5 align-top text-text-2 sm:table-cell sm:px-5 sm:py-3">
                    {rules.map((r) => (
                      <span key={r.rule_id} className="block">
                        {r.title}{' '}
                        <span className="num text-text-3">
                          · {describeTrigger(r.trigger)} · {r.reward_rights} right{r.reward_rights === 1 ? '' : 's'}
                        </span>
                      </span>
                    ))}
                  </td>
                  <td className="block align-top sm:table-cell sm:px-5 sm:py-3">
                    <span className="whitespace-normal">
                      <Mark tone={statusTone(entry.meta.status)}>
                        <span className="whitespace-normal">{entry.meta.status}</span>
                      </Mark>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
    </div>
  );
}
