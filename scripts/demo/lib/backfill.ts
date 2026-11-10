/**
 * One-time evidence backfill: transactions recorded by hash only (sent by the bridge or the agent),
 * or refusals without an E_* code, get receiver, event names, error code and failure from the RPC
 * (spaced calls). Never changes which transactions a step lists.
 */
import { writeEvidenceMd } from './evidence-md.js';
import { readSteps, upsertStep } from './record.js';
import type { TxStatusFn } from './tx-status.js';

export async function backfillTxDetails(txStatus: TxStatusFn): Promise<void> {
  for (const s of readSteps()) {
    let changed = false;
    for (const t of s.transactions) {
      if (t.receiver && t.events && (t.ok || t.error_code)) continue;
      const o = await txStatus(t.hash, t.by);
      t.receiver = o.receiverId;
      t.events = o.events.map((e) => e.event);
      t.ok = o.ok;
      t.error_code = o.code;
      if (o.failure) t.failure = o.failure.slice(0, 400);
      changed = true;
      console.log(`  step ${s.step} ${t.hash.slice(0, 10)}… ${t.ok ? 'ok' : `failed ${t.error_code}`} → ${t.receiver} [${t.events.join(', ')}]`);
    }
    if (changed) upsertStep(s);
  }
  writeEvidenceMd();
}
