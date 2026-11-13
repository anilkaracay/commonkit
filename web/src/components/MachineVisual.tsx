import { machinePosters } from '@commonkit/design';
import { AssetIcon } from './AssetIcon';

/**
 * Poster still of the machine's procedural 3D model, from @commonkit/design (the same stills the
 * landing uses). Asset types without a poster fall back to their line icon on the same ice tile.
 */
export function MachineVisual({ type, className = '', priority = false }: { type: string; className?: string; priority?: boolean }) {
  const src = machinePosters[type];
  return (
    <div className={`relative grid aspect-[4/3] place-items-center overflow-hidden bg-bg-alt ${className}`}>
      {src ? (
        <img src={src} alt="" width={640} height={640} loading={priority ? 'eager' : 'lazy'} decoding="async" className="absolute inset-0 h-full w-full object-contain p-[3%]" />
      ) : (
        <AssetIcon type={type} size={56} className="text-slate-400" />
      )}
    </div>
  );
}
