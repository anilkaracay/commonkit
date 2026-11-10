import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVIDENCE_DIR, REPO_ROOT } from '../../lib/config.js';
import type { DemoContext } from '../lib/context.js';
import { runProc } from '../lib/procs.js';
import { runEvidenceChecks } from '../lib/verify-checks.js';
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
    let text = out;
    // Until scripts/verify.ts imports TEST_PLAN §6 checks 6–11, run them here from the same module.
    if (!/\[(6|7|8|9|10|11)\]/.test(out)) {
      const lines = await runEvidenceChecks((c, m, a) => ctx.chain.view(c, m, a), ctx.dep, EVIDENCE_DIR);
      text += `\n# TEST_PLAN §6 checks 6–11 (scripts/demo/lib/verify-checks.ts, read-only)\n${lines.map((l) => `${l.info ? 'ℹ️' : l.ok ? '✅' : '❌'} [${l.check}] ${l.text}`).join('\n')}\n`;
      const bad = lines.filter((l) => !l.ok && !l.info);
      rec.check(`checks 6–11: ${lines.length - bad.length}/${lines.length} ✅ (sweeps, rights ↔ tasks, escalations, reimbursement caps, service log, evidence steps)`, bad.length === 0, bad.map((l) => l.text).join(' | ') || undefined);
    }
    writeFileSync(file, text);
    const ok = (out.match(/✅/g) ?? []).length;
    const bad = out.split('\n').filter((l) => l.includes('❌'));
    rec.eq('verify.sh exit code', r.code, 0);
    rec.check(`no ❌ (${ok} ✅ lines)`, bad.length === 0, bad.slice(0, 5).join(' | ') || undefined);
    rec.note('Full output: evidence/verify-step21.txt (run without any keychain: NEAR_CREDENTIALS_DIR points nowhere).');
    rec.noTxReason = 'read-only verification';
  },
};
