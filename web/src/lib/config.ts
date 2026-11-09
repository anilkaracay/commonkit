/** Build-time config. Explorer base URL is pending research B16; override with VITE_EXPLORER_URL. */
const env = import.meta.env;

export const config = {
  network: 'testnet' as const,
  explorerUrl: (env.VITE_EXPLORER_URL as string | undefined) ?? 'https://testnet.nearblocks.io',
  repoUrl: (env.VITE_REPO_URL as string | undefined) ?? 'https://github.com/anilkaracay/commonkit',
};

export function txUrl(hash: string): string {
  return `${config.explorerUrl}/txns/${hash}`;
}

export function accountUrl(accountId: string): string {
  return `${config.explorerUrl}/address/${accountId}`;
}
