// Round-2 concept (explore only). Run from landing/: pnpm exec vite --config explore/v2/vite.config.ts
import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fill } from './src/slots.ts';
import type { CkData } from './src/format.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const json = (p: string) => JSON.parse(readFileSync(path.join(repo, p), 'utf8'));

/** Build-time picks from the testnet snapshot and evidence files: only the fields the page prints. */
function pick() {
  const snap = json('landing/src/data/testnet-snapshot.json');
  const steps: any[] = json('evidence/steps.json');
  const overrides: any[] = json('evidence/demo-overrides.json');
  const step = (n: number) => steps.find((x) => Number(x.step) === n);
  const tx = (n: number, i: number) => step(n).transactions[i];
  const s17 = step(17).transactions;
  const prof = json('profiles/printer_3d.json').profile;
  const data = {
    takenAt: snap.taken_at,
    assets: snap.assets.map((a: any) => ({
      account: a.account, kind: a.asset_type, name: a.display_name, community: a.community, dao: a.dao,
      inService: a.in_service, floatFree: a.ledger.float_free, floatCap: a.ledger.float_cap,
      feesIn: a.ledger.total_fees_in, swept: a.ledger.total_swept, codeHash: a.code_hash, fullAccessKeys: a.full_access_keys,
      rules: a.rules.map((r: any) => ({ id: r.rule_id, kind: r.kind, trigger: r.trigger, dueValue: r.due_value, due: r.due, openTask: r.open_task, rewardRights: r.reward_rights })),
      tasks: a.tasks.map((t: any) => ({ id: t.id, rule: t.rule_id, status: t.status, claimer: t.claimer, verifier: t.verifier, rewardRights: t.reward_rights })),
    })),
    // Demo thresholds still active on testnet: the latest override/restore entry per asset + rule.
    overrides: [...new Map(overrides.map((o) => [o.asset + '#' + o.rule_id, o])).values()]
      .filter((o) => o.kind === 'override')
      .map((o) => ({ asset: o.asset, rule: o.rule_id, value: o.value, production: o.production })),
    printerProfile: { price: prof.price_per_slot, deposit: prof.deposit, slotMinutes: prof.slot_minutes, validityDays: prof.right_validity_days, group: prof.group_id },
    earned: { step: 8, tx: tx(8, 3).hash, by: tx(8, 3).by, rights: step(8).outputs.right_ids.split(',') },
    refused: s17.filter((t: any) => /right|revoke|burn/i.test(t.label)).map((t: any) => ({ label: t.label, hash: t.hash, code: t.error_code, by: t.by })),
  };
  return data;
}

function ckData(): Plugin {
  const id = 'virtual:ck-data';
  return {
    name: 'ck-data',
    resolveId: (s) => (s === id ? '\0' + id : undefined),
    load: (s) => (s === '\0' + id ? `export default ${JSON.stringify(pick())};` : undefined),
    transformIndexHtml: { order: 'pre', handler: (html) => fill(html, pick() as unknown as CkData) },
  };
}

export default defineConfig({
  root: here,
  base: './',
  plugins: [ckData()],
  build: {
    target: 'es2022',
    outDir: path.join(here, 'dist'),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: { input: { index: path.join(here, 'index.html'), lab: path.join(here, 'lab.html') } },
  },
  server: { port: 5191, fs: { allow: [repo] } },
  preview: { port: 4191 },
});
