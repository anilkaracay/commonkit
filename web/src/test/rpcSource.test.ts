// @vitest-environment node
import { NearRpc } from '@commonkit/sdk';
import { describe, expect, it } from 'vitest';
import { createRpcSource } from '../data/rpc/rpcSource';
import { bundledDeployment } from '../data/bundled';

/** Records every view call and answers with `[]`. */
function recordingSource() {
  const calls: { account: string; method: string; args: Record<string, unknown> }[] = [];
  const fetchImpl = async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { params: { account_id: string; method_name: string; args_base64: string } };
    const { account_id, method_name, args_base64 } = body.params;
    calls.push({ account: account_id, method: method_name, args: JSON.parse(atob(args_base64)) as Record<string, unknown> });
    const bytes = [...new TextEncoder().encode('[]')];
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { result: bytes, logs: [] } }));
  };
  return { ds: createRpcSource({ rpc: new NearRpc('http://rpc.invalid', fetchImpl) }), calls };
}

describe('RPC source sends each contract its own argument types', () => {
  it('asset views page with U64 strings', async () => {
    const { ds, calls } = recordingSource();
    await ds.asset('a.testnet').get_reservations(0, 500);
    await ds.asset('a.testnet').get_tasks(5, 10, 'Open');
    expect(calls[0]).toEqual({ account: 'a.testnet', method: 'get_reservations', args: { from_index: '0', limit: 100 } });
    expect(calls[1]?.args).toEqual({ from_index: '5', limit: 10, status: 'Open' });
  });

  it('commons views page with u64 numbers; nft_tokens with a U128 string', async () => {
    const { ds, calls } = recordingSource();
    await ds.commons('c.testnet').get_all_roles(0, 50);
    await ds.commons('c.testnet').nft_tokens(0, 100);
    expect(calls[0]?.args).toEqual({ from_index: 0, limit: 50 });
    expect(calls[1]?.args).toEqual({ from_index: '0', limit: 100 });
  });

  it('reads the bundled testnet deployment', () => {
    expect(bundledDeployment.assets.map((a) => a.alias)).toEqual(expect.arrayContaining(['printer-01', 'laser-01', 'washer-01', 'fridge-01']));
    expect(bundledDeployment.assets.every((a) => a.simulated)).toBe(true);
    expect(bundledDeployment.communities.map((c) => c.slug)).toEqual(['makerlab', 'dorm-b']);
    expect(bundledDeployment.code.asset.code_hash).not.toBe('');
  });
});
