/**
 * A short, human title for a Sputnik proposal, derived from its on-chain description (written by
 * scripts/seed, scripts/demo and the asset contract's escalations). The description itself is never
 * changed: the UI shows it in full behind an expand.
 */
import { displayName } from '@commonkit/sdk';
import { castText } from './cast';

const short = (account: string) => displayName(account);
const units = (s: string) =>
  s
    .replace(/\b(\d{4,})\b/g, (n) => Number(n).toLocaleString('en-US'))
    .replace(/(\d)\s?h\b/g, '$1 h')
    .replace(/(\d)\s?s\b/g, '$1 s');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Rule = [RegExp, (m: RegExpMatchArray) => string];

const RULES: Rule[] = [
  [/^COMMONKIT escalation [^#]+#\d+: (.+?) for '[^']+'.*?Amount ([\d.]+) NEAR\. Receiver (\S+)/, (m) => `${m[1]} purchase · ${m[2]} NEAR to ${short(m[3] ?? '')}`],
  [/^demo override (\w+) (\S+) \(production ([^)]+)\) on ([\w-]+)/i, (m) => `Demo override · ${m[4]} ${m[1]} ${units(m[2] ?? '')} (production ${units(m[3] ?? '')})`],
  [/^DEMO OVERRIDE ([\w-]+): (.+?)(?: so | \(|;|$)/, (m) => `Demo override · ${m[1]} ${units(m[2] ?? '')}`],
  [/^([\w-]+) profile \(demo override (\w+) ([\d]+ ?\w*)[^)]*\)(?: \+ fund_float ([\d.]+) NEAR)?/, (m) => `Profile · ${m[1]} with demo override ${m[2]} ${units(m[3] ?? '')}${m[4] ? ` · ${m[4]} NEAR float` : ''}`],
  [/^restore ([\w-]+) profile \((\w+)/, (m) => `Restore · ${m[1]} ${m[2]}`],
  [/^restore ([\w-]+) profile/, (m) => `Restore · ${m[1]} profile`],
  [/^restore ([\w-]+) ledger invariant after (.+?) \(([\d.]+) NEAR\)/, (m) => `Top-up · ${m[3]} NEAR to ${m[1]} (${m[2]})`],
  [/^set_operators ([\w-]+): agent revoked/, (m) => `Operators · ${m[1]} agent revoked`],
  [/^set_operators ([\w-]+): restore (.+?)(?: after|$)/, (m) => `Operators · ${m[1]} ${m[2]} restored`],
  [/^set_operators on ([\w-]+)/, (m) => `Operators · ${m[1]} bridge and agent set`],
  [/^set roles for (.+)$/, (m) => `Roles · ${(m[1] ?? '').split(/,\s*/).map(displayName).join(', ')}`],
  [/^set_roles (\w+): ([^(]+?)\s*(?:\(|$)/, (m) => `Roles · ${displayName(m[1] ?? '')}: ${m[2]}`],
  [/^credential kind (\w+)/, (m) => `Credential kind · ${m[1]}`],
  [/^fund_storage (\S+) ([\d.]+) NEAR/, (m) => `Storage · ${m[2]} NEAR to ${short(m[1] ?? '')}`],
  [/^fund_float ([\w-]+) ([\d.]+) NEAR/, (m) => `Float · ${m[2]} NEAR to ${m[1]}`],
  [/^register_asset ([\w-]+) in ([\w-]+)/, (m) => `Register · ${m[1]} in ${m[2]}`],
];

export function proposalTitle(description: string): string {
  const d = description.trim();
  const body = d.replace(/^COMMONKIT (?:seed|demo step \d+) \([\w-]+\):\s*/, '');
  for (const [re, f] of RULES) {
    const m = (re.source.startsWith('^COMMONKIT') ? d : body).match(re);
    if (m) return f(m);
  }
  // Fallback: the description without the script prefix, decision ids or trailing notes.
  const clean = body.replace(/\s*[—–-]\s*D-\d{3}.*$/, '').replace(/\bD-\d{3}:?\s*/g, '').split(' — ')[0] ?? body;
  const named = castText(clean);
  return cap(named.length > 90 ? `${named.slice(0, 88).trimEnd()}…` : named);
}
