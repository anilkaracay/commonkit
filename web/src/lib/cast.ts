/**
 * D-036: people are shown by their display names (`displayName()` / CAST in @commonkit/sdk). Free text
 * written before the rename (evidence step titles, agent rationales) still names the original demo
 * accounts; `castText` swaps those names for display. On-chain proposal descriptions stay raw.
 */
import { CAST } from '@commonkit/sdk';

const ORIGINAL = /\b(Ali|Can|Ay[sş]e|Mehmet|Zeynep|Elif|Burak|Selin|Nil|Ozan|Ece)\b/g;

export function castText(text: string): string {
  return text.replace(ORIGINAL, (name) => CAST[name.toLowerCase().replace('ş', 's')] ?? name);
}

/** The agent's rationale for display: cast names, without the trailing "[rationale: template]" source tag. */
export function displayRationale(text: string): string {
  return castText(text.replace(/\s*\[rationale: [^\]]*\]\s*$/, ''));
}
