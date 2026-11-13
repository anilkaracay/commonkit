import { describe, expect, it } from 'vitest';
import {
  decodeEvents,
  NearRpc,
  nearToYocto,
  parseErrorCode,
  utf8ToBase64,
  yoctoToNear,
} from './index.js';

describe('units', () => {
  it('round-trips NEAR <-> yocto without floats', () => {
    expect(nearToYocto('0.25')).toBe(250_000_000_000_000_000_000_000n);
    expect(nearToYocto('3')).toBe(3n * 10n ** 24n);
    expect(yoctoToNear(nearToYocto('1.23456'), 4)).toBe('1.2345');
    expect(yoctoToNear('0')).toBe('0');
    expect(yoctoToNear(1n)).toBe('0');
    expect(yoctoToNear(1n, 24)).toBe('0.000000000000000000000001');
  });
  it('rejects malformed amounts', () => {
    expect(() => nearToYocto('1.2.3')).toThrow();
    expect(() => nearToYocto('-1')).toThrow();
    expect(() => nearToYocto('0.' + '1'.repeat(25))).toThrow();
  });
});

describe('events', () => {
  it('decodes NEP-297 logs and filters by standard', () => {
    const logs = [
      'plain log',
      'EVENT_JSON:{"standard":"commonkit","version":"1.0.0","event":"swept","data":{"amount":"1"}}',
      'EVENT_JSON:{"standard":"nep171","version":"1.2.0","event":"nft_mint","data":[]}',
      'EVENT_JSON:{broken',
    ];
    expect(decodeEvents(logs)).toHaveLength(2);
    expect(decodeEvents(logs, 'commonkit')[0]?.event).toBe('swept');
  });
});

describe('errors', () => {
  it('extracts known codes from panic messages', () => {
    expect(parseErrorCode('Smart contract panicked: E_RULE_NOT_DUE: delta 10 < 1800')).toBe('E_RULE_NOT_DUE');
    expect(parseErrorCode('E_SOMETHING_ELSE: x')).toBeNull();
  });
});

describe('NearRpc', () => {
  it('encodes args without Buffer (browser-safe)', () => {
    expect(utf8ToBase64('{"a":"ş"}')).toBe(Buffer.from('{"a":"ş"}').toString('base64'));
  });
  it('decodes view results and surfaces contract errors', async () => {
    const ok = new NearRpc('http://x', async () =>
      new Response(JSON.stringify({ result: { result: [...Buffer.from('{"a":1}')] } })),
    );
    expect(await ok.view('a.testnet', 'get')).toEqual({ a: 1 });
    const bad = new NearRpc('http://x', async () =>
      new Response(JSON.stringify({ result: { error: 'wasm execution failed: E_NOT_DAO' } })),
    );
    await expect(bad.view('a.testnet', 'get')).rejects.toThrow(/E_NOT_DAO/);
  });
});

import { displayName } from './cast.js';
describe('cast', () => {
  it('maps demo accounts to English display names and leaves others alone', () => {
    expect(displayName('ayse.commonkit-sxflo.testnet')).toBe('Ava');
    expect(displayName('mehmet')).toBe('Mark');
    expect(displayName('stranger.testnet')).toBe('stranger');
  });
});
