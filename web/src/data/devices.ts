/**
 * Device kind per asset, from one source: the bridge's emulated-stack config
 * (bridge/config.emulated.yaml, bundled at build time). `adapter: simulator` → simulator;
 * `emulated_device: true` → a real adapter against an emulated device; anything else → device.
 * The config is read with a small line parser (asset_id / adapter / emulated_device keys only).
 */
import rawConfig from '../../../bridge/config.emulated.yaml?raw';

export type DeviceKind = 'simulator' | 'emulated' | 'device';

export interface DeviceInfo {
  adapter: string;
  kind: DeviceKind;
}

export function parseBridgeAssets(yaml: string): Map<string, DeviceInfo> {
  const out = new Map<string, DeviceInfo>();
  let current: { id: string; adapter: string; emulated: boolean } | null = null;
  const flush = () => {
    if (current) {
      const kind: DeviceKind = current.adapter === 'simulator' ? 'simulator' : current.emulated ? 'emulated' : 'device';
      out.set(current.id, { adapter: current.adapter, kind });
    }
  };
  for (const raw of yaml.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '');
    const id = /^\s*-\s*asset_id:\s*["']?([^"'\s]+)/.exec(line);
    if (id?.[1]) {
      flush();
      current = { id: id[1], adapter: '', emulated: false };
      continue;
    }
    if (!current) continue;
    const ad = /^\s+adapter:\s*["']?([\w-]+)/.exec(line);
    if (ad?.[1] && !current.adapter) current.adapter = ad[1];
    if (/^\s+emulated_device:\s*true\b/.test(line)) current.emulated = true;
  }
  flush();
  return out;
}

export const bridgeDevices = parseBridgeAssets(rawConfig);

export function deviceOf(assetId: string, devices: Map<string, DeviceInfo> = bridgeDevices): DeviceInfo | null {
  return devices.get(assetId) ?? null;
}
