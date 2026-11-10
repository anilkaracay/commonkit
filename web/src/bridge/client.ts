/**
 * The bridge next to a device (bridge/README.md): NEP-413 challenge → wallet signMessage → signed
 * request. Base URL from VITE_BRIDGE_URL (default the local bridge, http://localhost:8787).
 */
import type { WalletProvider } from '../wallet/wallet';

export const BRIDGE_URL = ((import.meta.env.VITE_BRIDGE_URL as string | undefined) ?? 'http://localhost:8787').replace(/\/$/, '');

export type ChallengeAction = 'access' | 'finish' | 'verify' | 'confirm';

interface Challenge {
  nonce: string; // base64, 32 bytes
  message: string;
  recipient: string;
  expires_at_iso: string;
}

export class BridgeError extends Error {
  constructor(
    readonly reason: string,
    readonly detail: string,
  ) {
    super(`${reason}: ${detail}`);
  }
}

/** Bridge rejection codes (bridge/src/errors.ts) in plain words. */
export const BRIDGE_MESSAGES: Record<string, string> = {
  RESERVATION_NOT_ACCESSIBLE: 'No valid reservation for you right now, so the device stays locked.',
  OUT_OF_SERVICE: 'This machine is out of service. The device stays locked.',
  KEY_NOT_FULL_ACCESS: 'Your wallet signed with a limited key. Access needs your full-access key.',
  KEY_NOT_ON_ACCOUNT: 'The signing key does not belong to this account.',
  BAD_SIGNATURE: 'The signature did not verify. Try again.',
  NONCE_EXPIRED: 'The request expired. Try again.',
  NONCE_USED: 'This request was already used. Try again.',
  NOT_STEWARD: 'Only a steward of this item can confirm a return.',
  CONFIRM_REFUSED: 'The bridge refused the confirmation (wrong code, the holder confirming, or never handed over).',
  NOT_MANUAL_ASSET: 'This item is not a hand-over (QR) item.',
  DEVICE_OFFLINE: 'The device is offline.',
  DEVICE_BUSY: 'The device is busy.',
  CHAIN_UNAVAILABLE: 'The bridge could not reach NEAR testnet. Try again shortly.',
};

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BRIDGE_URL}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new BridgeError('BRIDGE_UNREACHABLE', `No bridge at ${BRIDGE_URL}. The bridge runs next to the device.`);
  }
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string; detail?: string };
  if (!res.ok || json.ok === false) throw new BridgeError(json.reason ?? `HTTP_${res.status}`, json.detail ?? '');
  return json as T;
}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BRIDGE_URL}${path}`);
  } catch {
    throw new BridgeError('BRIDGE_UNREACHABLE', `No bridge at ${BRIDGE_URL}.`);
  }
  const json = (await res.json().catch(() => ({}))) as { reason?: string; detail?: string };
  if (!res.ok) throw new BridgeError(json.reason ?? `HTTP_${res.status}`, json.detail ?? '');
  return json as T;
}

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Ask for a challenge, have the wallet sign it (NEP-413), return the signed body for the bridge. */
export async function signedBody(
  wallet: WalletProvider,
  assetId: string,
  action: ChallengeAction,
  ids: { reservation_id?: string; task_id?: string },
) {
  if (!wallet.accountId) throw new Error('Connect a wallet first.');
  const ch = await post<Challenge>('/access/challenge', { asset_id: assetId, account_id: wallet.accountId, action, ...ids });
  const signed = await wallet.signMessage({ message: ch.message, recipient: ch.recipient, nonce: fromBase64(ch.nonce) });
  return {
    asset_id: assetId,
    account_id: signed.accountId,
    ...ids,
    public_key: signed.publicKey,
    signature: signed.signature,
    nonce: ch.nonce,
    message: ch.message,
    recipient: ch.recipient,
  };
}

export interface AccessResult {
  ok: true;
  session_id: string;
  resumed: boolean;
  key_permission: string;
  device?: { manual_qr?: { handover_code: string; handover_link: string; return_link: string } };
}

export async function requestAccess(wallet: WalletProvider, assetId: string, reservationId: string): Promise<AccessResult> {
  return post<AccessResult>('/access', await signedBody(wallet, assetId, 'access', { reservation_id: reservationId }));
}

export interface ManualLoan {
  session_id: string;
  reservation_id: string | null;
  holder?: string;
  [k: string]: unknown;
}

export function manualSession(assetId: string) {
  return get<{ asset_id: string; simulated: boolean; current: ManualLoan | null; outstanding: ManualLoan[] }>(`/manual/${assetId}/session`);
}

export async function confirmManual(wallet: WalletProvider, assetId: string, loan: ManualLoan, step: 'handover' | 'return', code?: string) {
  const body = await signedBody(wallet, assetId, 'confirm', { reservation_id: loan.reservation_id ?? undefined });
  return post<{ ok: true; step: string }>(`/manual/${assetId}/${loan.session_id}/confirm`, { ...body, step, ...(code ? { code } : {}) });
}

export function bridgeMessage(err: unknown): string {
  if (err instanceof BridgeError) return BRIDGE_MESSAGES[err.reason] ?? (err.detail || err.reason);
  return err instanceof Error ? err.message : String(err);
}
