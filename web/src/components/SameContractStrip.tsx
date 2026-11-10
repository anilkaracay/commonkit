import { Link } from 'react-router';
import type { DeployedAsset } from '../data/offchain';
import { SimulatedBadge } from './Badges';
import { MachineVisual } from './MachineVisual';
import { useDemoLink } from '../demo/demo';

/** "Same contract. Different commons." Every asset account with its live code_hash. */
export function SameContractStrip({ assets }: { assets: { deployed: DeployedAsset; codeHash: string; assetType?: string }[] }) {
  const link = useDemoLink();
  const hashes = new Set(assets.map((a) => a.codeHash));
  const same = hashes.size === 1;
  const hash = [...hashes][0] ?? '';
  return (
    <div className="panel grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-center lg:p-6">
      <div className="min-w-0">
        <p className={`text-lg font-semibold ${same ? '' : 'text-danger'}`}>
          {same ? `${assets.length} accounts · 1 code_hash` : `${hashes.size} different code hashes`}
        </p>
        {same && <p className="mono-id mt-2 break-all">{hash}</p>}
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {assets.map(({ deployed, codeHash, assetType }) => (
          <li key={deployed.asset_id} className="min-w-0">
            <Link to={link(`/a/${deployed.asset_id}`)} className="group block no-underline" title={`${deployed.asset_id}\ncode_hash ${codeHash}`}>
              {assetType && <MachineVisual type={assetType} className="rounded-md" />}
              <span className="mt-2 block truncate text-sm font-medium group-hover:text-accent">{deployed.alias}</span>
              <span className="block truncate text-xs text-text-3">{deployed.community}</span>
            </Link>
            {deployed.simulated && <SimulatedBadge className="mt-1" />}
          </li>
        ))}
      </ul>
    </div>
  );
}
