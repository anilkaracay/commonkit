export * from './near.ts';
/** JS side of the design system: token values for canvas/WebGL code (which cannot read CSS variables cheaply)
 * and font URLs for <link rel="preload"> (Vite resolves new URL(..., import.meta.url) to the hashed asset). */

export const color = {
  ink: '#0a1526',
  navy900: '#0d1f3c',
  navy800: '#132b52',
  navy700: '#1c3a6b',
  cobalt700: '#1c42b8',
  cobalt600: '#2453e0',
  blue500: '#4d7ff0',
  sky300: '#9cc3ff',
  ice200: '#dce6f4',
  ice100: '#eaf0f8',
  ice50: '#f5f8fc',
  white: '#ffffff',
  slate700: '#33415a',
  slate600: '#4e5d76',
  slate500: '#5b6a83',
  slate400: '#8593a8',
  slate300: '#a9b9d3',
  line200: '#dce3ee',
  line300: '#c6d1e1',
  orange500: '#f07a2a',
  orange700: '#b4500f',
  orange50: '#fdf0e6',
  red700: '#b42318',
  red50: '#fdecea',
} as const;

/** Pairs that carry text; each must reach WCAG AA 4.5:1 (see contrast.test.ts). */
export const textPairs: readonly (readonly [string, keyof typeof color, keyof typeof color])[] = [
  ['text on bg', 'ink', 'white'],
  ['text on bg-alt', 'ink', 'ice50'],
  ['text-2 on bg', 'slate600', 'white'],
  ['text-2 on bg-alt', 'slate600', 'ice50'],
  ['text-3 on bg', 'slate500', 'white'],
  ['text-3 on bg-alt', 'slate500', 'ice50'],
  ['text-3 on surface-2', 'slate500', 'ice100'],
  ['accent on bg', 'cobalt600', 'white'],
  ['accent on bg-alt', 'cobalt600', 'ice50'],
  ['on-accent', 'white', 'cobalt600'],
  ['on-accent hover', 'white', 'cobalt700'],
  ['due text on bg', 'orange700', 'white'],
  ['due text on due-soft', 'orange700', 'orange50'],
  ['danger on bg', 'red700', 'white'],
  ['danger on danger-soft', 'red700', 'red50'],
  ['liability on bg', 'navy700', 'white'],
  ['inverse text', 'white', 'navy900'],
  ['inverse text-2', 'slate300', 'navy900'],
];

export const motion = { dur: [120, 200, 320, 600, 900], easeOut: [0.2, 0.7, 0.1, 1], easeInOut: [0.65, 0, 0.35, 1] } as const;

/** Font files to preload (CK Sans first: it carries every headline). */
export const fontUrls = {
  sans: new URL('../fonts/ck-sans.woff2', import.meta.url).href,
  mono: new URL('../fonts/geist-mono.woff2', import.meta.url).href,
} as const;

/** WCAG relative-luminance contrast ratio of two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Poster stills of the procedural 3D machines, one per profile asset_type (640 px square, transparent,
 * equal visual mass). One source for landing and app; regenerate with `pnpm --filter @commonkit/landing posters`.
 */
export const machinePosters: Readonly<Record<string, string>> = {
  printer_3d: new URL('../posters/m-printer_3d-640.webp', import.meta.url).href,
  laser_cutter: new URL('../posters/m-laser_cutter-640.webp', import.meta.url).href,
  washer: new URL('../posters/m-washer-640.webp', import.meta.url).href,
  community_fridge: new URL('../posters/m-community_fridge-640.webp', import.meta.url).href,
  ev_charger: new URL('../posters/m-ev_charger-640.webp', import.meta.url).href,
  cargo_bike: new URL('../posters/m-cargo_bike-640.webp', import.meta.url).href,
  gpu_server: new URL('../posters/m-gpu_server-640.webp', import.meta.url).href,
  tractor: new URL('../posters/m-tractor-640.webp', import.meta.url).href,
  microscope: new URL('../posters/m-microscope-640.webp', import.meta.url).href,
  tool_library_ladder: new URL('../posters/m-tool_library_ladder-640.webp', import.meta.url).href,
  rehearsal_room: new URL('../posters/m-rehearsal_room-640.webp', import.meta.url).href,
  emergency_generator: new URL('../posters/m-emergency_generator-640.webp', import.meta.url).href,
};
