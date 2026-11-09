// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES, ERROR_MESSAGES, humanizeError } from '../lib/errors';

const spec = readFileSync(fileURLToPath(new URL('../../../docs/CONTRACT_SPEC.md', import.meta.url)), 'utf8');
const section10 = spec.slice(spec.indexOf('## 10. Error codes'), spec.indexOf('## 11.'));
const specCodes = [...new Set(section10.match(/\bE_[A-Z_]+\b/g) ?? [])];

describe('error code mapping', () => {
  it('reads the codes from CONTRACT_SPEC §10', () => {
    expect(specCodes.length).toBeGreaterThan(25);
  });

  it('maps every code in the spec to a plain message', () => {
    for (const code of specCodes) {
      expect(ERROR_MESSAGES, code).toHaveProperty(code);
      const msg = (ERROR_MESSAGES as Record<string, string>)[code] ?? '';
      expect(msg.length, code).toBeGreaterThan(10);
      expect(msg, code).not.toMatch(/E_[A-Z]/);
    }
  });

  it('has no messages for codes that are not in the spec', () => {
    for (const code of ERROR_CODES) expect(specCodes).toContain(code);
  });

  it('humanizes contract panics', () => {
    const h = humanizeError(new Error('Smart contract panicked: E_RIGHT_WRONG_GROUP: right group mismatch'));
    expect(h.code).toBe('E_RIGHT_WRONG_GROUP');
    expect(h.message).toBe(ERROR_MESSAGES.E_RIGHT_WRONG_GROUP);
    expect(h.raw).toContain('panicked');
  });

  it('falls back for unknown errors and keeps the raw text', () => {
    const h = humanizeError({ some: 'rpc failure' });
    expect(h.code).toBeNull();
    expect(h.raw).toContain('rpc failure');
  });
});
