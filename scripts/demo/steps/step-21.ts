import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVIDENCE_DIR, REPO_ROOT } from '../../lib/config.js';
import type { DemoContext } from '../lib/context.js';
import { runProc } from '../lib/procs.js';
import type { DemoStep } from '../lib/runner.js';

export const step21: DemoStep = {
  n: 21,
  title: './scripts/verify.sh — read-only, keyless verification of every on-chain claim',
  core: true,
  simulated: false,
  negative: false,
  async run(ctx: DemoContext) {
    const { rec } = ctx;
    const r = await runProc('bash', [join(REPO_ROOT, 'scripts', 'verify.sh')], { cwd: REPO_ROOT, env: { NEAR_CREDENTIALS_DIR: '/nonexistent-no-keys' } });
    const out = r.out.replace(/\u001b\[[0-9;]*m/g, '');
    const file = join(EVIDENCE_DIR, 'verify-step21.txt');
    const text = out;
    writeFileSync(file, text);
    const ok = (out.match(/✅/g) ?? []).length;
    const bad = out.split('\n').filter((l) => l.includes('❌'));
    rec.eq('verify.sh exit code', r.code, 0);
    rec.check(`no ❌ (${ok} ✅ lines)`, bad.length === 0, bad.slice(0, 5).join(' | ') || undefined);
    rec.note('Full output: evidence/verify-step21.txt (run without any keychain: NEAR_CREDENTIALS_DIR points nowhere).');
    rec.noTxReason = 'read-only verification';
  },
};
