import { Link } from 'react-router';
import type { DeployedAsset } from '../data/offchain';
import { SimulatedBadge } from './Badges';
import { useDemoLink } from '../demo/demo';

/** "Same contract. Different commons." Every asset account with its live code_hash. */
export function SameContractStrip({ assets }: { assets: { deployed: DeployedAsset; codeHash: string }[] }) {
  const link = useDemoLink();
  const hashes = new Set(assets.map((a) => a.codeHash));
  const same = hashes.size === 1;
  const hash = [...hashes][0] ?? '';
  return (
    <div className="tag p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow">Same contract everywhere</p>
        <p className={`text-xs font-medium ${same ? 'text-alive' : 'text-danger'}`}>
          {same ? `${assets.length} accounts · 1 code_hash` : `${hashes.size} different code hashes`}
        </p>
      </div>
      {same && <p className="num mt-1 text-xs break-all text-ink-2">{hash}</p>}
      <ul className="mt-3 flex flex-wrap gap-2">
        {assets.map(({ deployed, codeHash }) => (
          <li key={deployed.asset_id}>
            <Link
              to={link(`/a/${deployed.asset_id}`)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${deployed.simulated ? 'tag-sim border-sim' : 'border-line-strong bg-surface'}`}
              title={`${deployed.asset_id}\ncode_hash ${codeHash}`}
            >
              <span className="num font-medium">{deployed.alias}</span>
              <span className="text-ink-3">{deployed.community}</span>
              {deployed.simulated && <SimulatedBadge />}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
