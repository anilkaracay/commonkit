/**
 * After the judge flow: demo reservations booked ahead and never used (step 6) become no-shows once
 * their start window has passed (`mark_no_show`, ANY): fee kept, deposit refunded. Not a judge
 * step; its transactions go to evidence/demo-housekeeping.json.
 */
import { EvidenceLog } from '../../lib/evidence.js';
import type { Chain } from '../../lib/near.js';
import { TGAS } from '../../lib/config.js';
import type { Cast } from './cast.js';
import { chainTime } from './context.js';
import { writeEvidenceMd } from './evidence-md.js';
import { NS_PER_MIN } from './slots.js';
import { AssetView } from './views.js';

const DEMO_MEMBERS = (c: Cast) => [c.ali, c.can, c.ayse, c.zeynep, c.mehmet];

export async function housekeeping(chain: Chain, cast: Cast): Promise<void> {
  const log = new EvidenceLog('demo-housekeeping');
  const now = await chainTime(chain);
  for (const assetId of [cast.printer, cast.laser, cast.washer, cast.fridge]) {
    const a = new AssetView(chain, assetId);
    const p = await a.profile();
    for (const holder of DEMO_MEMBERS(cast))
      for (const r of await a.byHolder(holder)) {
        const windowEnd = (BigInt(r.start_slot) * BigInt(p.slot_minutes) + BigInt(p.start_window_minutes)) * NS_PER_MIN;
        if (r.status !== 'Confirmed' || now <= windowEnd) continue;
        log.add(
          `mark_no_show ${assetId.split('.')[0]} reservation ${r.id} (${holder.split('.')[0]}, unused demo booking)`,
          await chain.call(cast.root, assetId, 'mark_no_show', { id: r.id }, { gas: 60n * TGAS }),
        );
      }
  }
  writeEvidenceMd();
}
