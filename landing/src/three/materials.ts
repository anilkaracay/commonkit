/** One material set for every machine: matte ceramic with a faint roughness grain, brushed aluminium,
 * navy enamel, sky PLA, rubber. Colours come from @commonkit/design. No emissive glow, no bloom. */
import { CanvasTexture, Color, MeshPhysicalMaterial, MeshStandardMaterial, RepeatWrapping } from 'three';
import { color } from '@commonkit/design';

/** Deterministic value noise (no Math.random: posters and video must be reproducible). */
function grain(size: number, lo: number, hi: number, seed: number): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(size, size);
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < size * size; i++) {
    const v = Math.round((lo + (hi - lo) * rnd()) * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new CanvasTexture(cv);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

/** Brushed lines for aluminium (anisotropic look without anisotropy cost). */
function brushed(size: number): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  g.fillStyle = 'rgb(90,90,90)';
  g.fillRect(0, 0, size, size);
  let s = 7;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y < size; y++) {
    const v = Math.round(70 + 50 * rnd());
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(0, y, size, 1);
  }
  const t = new CanvasTexture(cv);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

export const C = {
  ceramic: '#eef2f8',
  ceramicShade: '#e2e8f1',
  cobalt: color.cobalt600,
  navy: color.navy800,
  alu: '#c3cedc',
  aluDark: '#7c8aa0',
  sky: '#8db9ff',
  due: color.orange500,
  rubber: '#2a3550',
} as const;

export function makeMaterials() {
  const r = grain(128, 0.5, 0.66, 3);
  const rb = brushed(256);
  return {
    ceramic: new MeshPhysicalMaterial({ color: C.ceramic, roughness: 1, roughnessMap: r, clearcoat: 0.16, clearcoatRoughness: 0.42, sheen: 0.18, sheenColor: '#cfe0ff', sheenRoughness: 0.8 }),
    ceramicShade: new MeshPhysicalMaterial({ color: C.ceramicShade, roughness: 0.62, clearcoat: 0.1 }),
    cobalt: new MeshPhysicalMaterial({ color: C.cobalt, roughness: 0.44, clearcoat: 0.3, clearcoatRoughness: 0.3 }),
    navy: new MeshStandardMaterial({ color: C.navy, roughness: 0.7, metalness: 0.05 }),
    navyGloss: new MeshPhysicalMaterial({ color: '#0f2142', roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.15 }),
    alu: new MeshStandardMaterial({ color: C.alu, roughness: 0.34, roughnessMap: rb, metalness: 0.88 }),
    aluDark: new MeshStandardMaterial({ color: C.aluDark, roughness: 0.42, metalness: 0.8 }),
    pla: new MeshStandardMaterial({ color: C.sky, roughness: 0.58 }),
    rubber: new MeshStandardMaterial({ color: C.rubber, roughness: 0.82 }),
    due: new MeshStandardMaterial({ color: C.due, roughness: 0.55 }),
    ledOn: new MeshStandardMaterial({ color: '#6e9bff', emissive: new Color('#2e64f0'), emissiveIntensity: 0.85, roughness: 0.3 }),
  };
}
export type Materials = ReturnType<typeof makeMaterials>;
