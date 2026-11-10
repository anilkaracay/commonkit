/** One material set for every machine: matte ceramic, brushed aluminium, navy enamel, sky PLA. No emissive glow. */
import { Color, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';

export const C = {
  ceramic: '#EEF2F8',
  cobalt: '#2350D6',
  navy: '#13284A',
  alu: '#C3CEDC',
  aluDark: '#7C8AA0',
  sky: '#8DB9FF',
  due: '#F07A2A',
} as const;

export function makeMaterials() {
  return {
    ceramic: new MeshPhysicalMaterial({ color: C.ceramic, roughness: 0.58, clearcoat: 0.18, clearcoatRoughness: 0.45, sheen: 0.2, sheenColor: '#cfe0ff', sheenRoughness: 0.8 }),
    cobalt: new MeshPhysicalMaterial({ color: C.cobalt, roughness: 0.46, clearcoat: 0.25, clearcoatRoughness: 0.35 }),
    navy: new MeshStandardMaterial({ color: C.navy, roughness: 0.72, metalness: 0.05 }),
    alu: new MeshStandardMaterial({ color: C.alu, roughness: 0.3, metalness: 0.85 }),
    aluDark: new MeshStandardMaterial({ color: C.aluDark, roughness: 0.38, metalness: 0.8 }),
    pla: new MeshStandardMaterial({ color: C.sky, roughness: 0.62 }),
    due: new MeshStandardMaterial({ color: C.due, roughness: 0.55 }),
    // Status light: a lit lens, not a glow (no bloom pass). Off = navy enamel.
    ledOn: new MeshStandardMaterial({ color: '#6E9BFF', emissive: new Color('#2E64F0'), emissiveIntensity: 0.9, roughness: 0.3 }),
  };
}
export type Materials = ReturnType<typeof makeMaterials>;
