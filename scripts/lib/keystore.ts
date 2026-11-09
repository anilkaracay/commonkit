/**
 * Write side of the legacy NEAR CLI keychain (~/.near-credentials/testnet), same layout as
 * near-cli-rs 0.31: `<account>.json` (primary key) and `<account>/ed25519_<pk>.json` (every key).
 * Reading and signing live in `@commonkit/sdk/signer`. Nothing here prints a secret key.
 */
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { KeyPair } from 'near-api-js';
import { listKeychainKeys } from '@commonkit/sdk/signer';
import { KEYCHAIN_DIR } from './config.js';

/** File name the CLI uses for an extra key: `ed25519:ABC` → `ed25519_ABC.json`. */
export const keyFileName = (publicKey: string): string => `${publicKey.replace(':', '_')}.json`;

export class Keystore {
  constructor(readonly dir: string = KEYCHAIN_DIR) {}

  /** All public keys stored for an account (primary first). */
  publicKeys(accountId: string): string[] {
    return listKeychainKeys(accountId, this.dir);
  }

  has(accountId: string, publicKey?: string): boolean {
    const keys = this.publicKeys(accountId);
    return publicKey ? keys.includes(publicKey) : keys.length > 0;
  }

  /** Generate a new ed25519 key pair, store it (mode 600) and return only the public key. */
  generate(accountId: string, opts: { primary: boolean }): string {
    const kp = KeyPair.fromRandom('ed25519');
    const publicKey = kp.getPublicKey().toString();
    const body = JSON.stringify({
      account_id: accountId,
      public_key: publicKey,
      private_key: kp.toString(),
    });
    const sub = join(this.dir, accountId);
    mkdirSync(sub, { recursive: true, mode: 0o700 });
    const files = [join(sub, keyFileName(publicKey))];
    if (opts.primary && !existsSync(join(this.dir, `${accountId}.json`)))
      files.push(join(this.dir, `${accountId}.json`));
    for (const f of files) {
      writeFileSync(f, body, { mode: 0o600 });
      chmodSync(f, 0o600);
    }
    return publicKey;
  }
}
