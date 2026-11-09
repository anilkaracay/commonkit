/** Line icons per asset_type (PROFILES.md). 24px grid, 1.6 stroke, currentColor. */
const paths: Record<string, string> = {
  printer_3d: 'M5 3h14v4H5zM4 7h16v10H4zM8 17v4h8v-4M12 7v5m-2 0h4l-2 2.5z',
  laser_cutter: 'M3 7h18v12H3zM3 11h18M7 7V4h10v3M12 11l-3 6m3-6 3 6m-3-6v6',
  washer: 'M5 3h14v18H5zM5 7h14M8 5h.01M11 5h.01M12 10a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-2.5 4.5c1.5-1 3.5 1 5 0',
  ev_charger: 'M6 3h9v18H6zM6 9h9M11 11l-2 3h3l-2 3M15 7h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V8',
  cargo_bike: 'M5 17a3 3 0 1 0 0-.01M19 17a3 3 0 1 0 0-.01M5 17l4-7h6l4 7M9 10 7 6H5m10 4 1-4h2M10 17h4l-3-7',
  gpu_server: 'M3 5h18v6H3zM3 13h18v6H3zM7 8h.01M7 16h.01M11 8h6M11 16h6',
  tractor: 'M7 18a3 3 0 1 0 0-.01M18 18a2 2 0 1 0 0-.01M4 15V9h7l2 5h7v3M11 9V5h-4v4M14 14V8h3',
  microscope: 'M6 21h12M9 21v-3h6M10 3l4 2-4 8-4-2zM12 10a5 5 0 0 1 4 8M8 16h4',
};

export function AssetIcon({ type, size = 28, className = '' }: { type: string; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={paths[type] ?? 'M4 4h16v16H4z'} />
    </svg>
  );
}
