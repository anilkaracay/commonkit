import { createHash } from 'node:crypto';

/** Hex sha256 — the contracts accept only hex sha256 for note/evidence/receipt/reason hashes. */
export const sha256Hex = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');
