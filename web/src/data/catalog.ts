/**
 * Scenario matrix source: profiles/*.json from the repo, bundled at build time. These files are
 * real (not mock); both data sources serve them. Rules written before D-017 (metric/threshold)
 * are read as Maintenance + Metric trigger until every file carries kind/trigger.
 */
import type { CatalogEntry, ProfileMeta } from './offchain';
import type { Profile, Trigger, UpkeepKind, UpkeepRule } from './types';
import { UPKEEP_KINDS } from './types';

type RawRule = Partial<UpkeepRule> & { rule_id: string; title: string; metric?: string; threshold?: number | string };
type RawFile = { profile: Omit<Profile, 'rules'> & { rules: RawRule[] }; meta: Partial<ProfileMeta> };

const files = import.meta.glob<RawFile>('../../../profiles/*.json', { eager: true, import: 'default' });

export function normalizeRule(r: RawRule): UpkeepRule {
  const kind: UpkeepKind = r.kind && (UPKEEP_KINDS as readonly string[]).includes(r.kind) ? r.kind : 'Maintenance';
  const trigger: Trigger = r.trigger ?? { Metric: { metric: r.metric ?? 'unknown', threshold: r.threshold ?? 0 } };
  return {
    rule_id: r.rule_id,
    kind,
    trigger,
    title: r.title,
    reward_rights: r.reward_rights ?? 0,
    reward_cash: r.reward_cash ?? '0',
    reimbursable_max: r.reimbursable_max ?? '0',
    requires_verification_test: r.requires_verification_test ?? false,
    claim_timeout_hours: r.claim_timeout_hours ?? 0,
  };
}

export function loadCatalog(raw: Record<string, RawFile> = files): CatalogEntry[] {
  return Object.entries(raw)
    .filter(([path]) => !path.endsWith('.schema.json'))
    .map(([path, f]) => ({
      file: path.split('/').pop() ?? path,
      profile: { ...f.profile, rules: f.profile.rules.map(normalizeRule) },
      meta: {
        display_name: f.meta.display_name ?? f.profile.display_name,
        community: f.meta.community ?? '',
        icon: f.meta.icon ?? f.profile.asset_type,
        status: f.meta.status ?? 'unknown',
        scenario_story_en: f.meta.scenario_story_en ?? '',
      },
    }))
    .sort((a, b) => a.file.localeCompare(b.file));
}
