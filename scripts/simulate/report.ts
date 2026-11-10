/** Pure text output for simulate.sh: one profile's steps, or the table for `all`. */
import type { LoopResult, StepResult } from './loop.js';

const mark = (ok: boolean | null): string => (ok === null ? '⏭' : ok ? '✅' : '❌');

export function formatProfileSummary(r: LoopResult): string[] {
  const lines = [`${r.assetType} (${r.assetId}) — ${r.ok ? 'PASS' : 'FAIL'} in ${(r.ms / 1000).toFixed(1)} s, mode ${r.mode}`];
  for (const s of r.steps) {
    const skipped = s.detail.startsWith('skipped');
    lines.push(`  ${skipped ? mark(null) : mark(s.ok)} ${s.label}${s.tx ? `  [tx ${s.tx}]` : ''}${s.detail ? `  (${s.detail})` : ''}`);
  }
  lines.push(`  ledger invariant_ok: ${r.invariantOk ?? 'n/a'}   code_hash: ${r.codeHash ?? 'n/a'}`);
  if (r.error) lines.push(`  error: ${r.error}`);
  return lines;
}

/** The shared community (DAO, commons, roles) that every profile's loop runs in. */
export function formatSetup(setup: StepResult[]): string[] {
  if (setup.length === 0) return [];
  return ['shared community (sandbox):', ...setup.map((s) => `  ${mark(s.ok)} ${s.label}${s.tx ? `  [tx ${s.tx}]` : ''}`), ''];
}

export function formatTable(results: LoopResult[]): string[] {
  const hashes = new Set(results.map((r) => r.codeHash).filter(Boolean));
  const head = `${'asset_type'.padEnd(20)} ${'rule (kind)'.padEnd(32)} ${'result'.padEnd(6)} ${'time'.padStart(7)} ${'steps'.padStart(6)}  ${'invariant'.padEnd(9)}  code_hash`;
  const rows = results.map((r) => {
    const passed = r.steps.filter((s) => s.ok && !s.detail.startsWith('skipped')).length;
    return `${r.assetType.padEnd(20)} ${(r.rule ?? '').padEnd(32)} ${(r.ok ? 'PASS' : 'FAIL').padEnd(6)} ${`${(r.ms / 1000).toFixed(1)}s`.padStart(7)} ${`${passed}/${r.steps.length}`.padStart(6)}  ${String(r.invariantOk ?? 'n/a').padEnd(9)}  ${r.codeHash ?? 'n/a'}${r.error ? `  — ${r.error.slice(0, 120)}` : ''}`;
  });
  const failed = results.filter((r) => !r.ok).length;
  return [
    head,
    '-'.repeat(head.length + 30),
    ...rows,
    '',
    `${results.length - failed}/${results.length} profiles passed; ${hashes.size === 1 ? `all assets share one code_hash ${[...hashes][0]}` : `${hashes.size} distinct code_hashes`}`,
    '',
    ...results.filter((r) => !r.ok).flatMap(formatProfileSummary),
  ];
}
