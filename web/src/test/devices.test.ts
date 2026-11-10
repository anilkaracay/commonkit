import { describe, expect, it } from 'vitest';
import { bridgeDevices, parseBridgeAssets } from '../data/devices';
import { bundledDeployment } from '../data/bundled';

describe('device label comes from the bridge config', () => {
  it('reads the real bridge/config.emulated.yaml: printer/laser emulated, washer/fridge simulator', () => {
    const kind = (alias: string) => {
      const a = bundledDeployment.assets.find((x) => x.alias === alias);
      return a ? bridgeDevices.get(a.asset_id)?.kind : undefined;
    };
    expect(kind('printer-01')).toBe('emulated');
    expect(kind('laser-01')).toBe('emulated');
    expect(kind('washer-01')).toBe('simulator');
    expect(kind('fridge-01')).toBe('simulator');
  });

  it('parses adapter and emulated_device per asset entry, ignoring comments', () => {
    const m = parseBridgeAssets(`assets:
  - asset_id: a.testnet   # first
    adapter: moonraker
    emulated_device: true
    adapter_config:
      adapter: nested-ignored
  - asset_id: "b.testnet"
    adapter: simulator
  - asset_id: c.testnet
    adapter: smart_plug
`);
    expect(m.get('a.testnet')).toEqual({ adapter: 'moonraker', kind: 'emulated' });
    expect(m.get('b.testnet')).toEqual({ adapter: 'simulator', kind: 'simulator' });
    expect(m.get('c.testnet')).toEqual({ adapter: 'smart_plug', kind: 'device' });
  });
});
