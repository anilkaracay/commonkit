import printer from '../assets/machines/printer.webp';
import laser from '../assets/machines/laser.webp';
import washer from '../assets/machines/washer.webp';
import fridge from '../assets/machines/fridge.webp';
import { AssetIcon } from './AssetIcon';

/**
 * Poster stills of the landing's procedural 3D machines (landing/explore/v2/posters, cropped 4:3).
 * Other asset types fall back to their line icon on the same ice tile.
 */
const posters: Record<string, string> = {
  printer_3d: printer,
  laser_cutter: laser,
  washer,
  community_fridge: fridge,
};

export function MachineVisual({ type, className = '', priority = false }: { type: string; className?: string; priority?: boolean }) {
  const src = posters[type];
  return (
    <div className={`relative grid aspect-[4/3] place-items-center overflow-hidden bg-bg-alt ${className}`}>
      {src ? (
        <img src={src} alt="" width={960} height={720} loading={priority ? 'eager' : 'lazy'} decoding="async" className="h-full w-full object-contain p-[6%]" />
      ) : (
        <AssetIcon type={type} size={56} className="text-slate-400" />
      )}
    </div>
  );
}
