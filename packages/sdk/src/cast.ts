/**
 * Display names for the team-controlled demo accounts (D-036). On-chain account ids never change;
 * every UI, caption and README narrative shows these names, with the real account id in details.
 * Initials match the account ids so avatars stay consistent.
 */
export const CAST: Readonly<Record<string, string>> = {
  ali: 'Alex',
  can: 'Casey',
  ayse: 'Ava',
  mehmet: 'Mark',
  zeynep: 'Zoe',
  // makerlab council
  elif: 'Ellie',
  burak: 'Ben',
  selin: 'Sam',
  // dorm-b council
  nil: 'Nina',
  ozan: 'Oscar',
  ece: 'Emma',
};

/** Display name for an account id like "ayse.commonkit-sxflo.testnet" (or a bare "ayse"). */
export function displayName(accountId: string): string {
  const first = accountId.split('.')[0] ?? accountId;
  return CAST[first] ?? first;
}
