/** Small procedural building blocks shared by every machine. */
import {
  CanvasTexture, CatmullRomCurve3, CylinderGeometry, ExtrudeGeometry, Mesh, MeshStandardMaterial, Object3D,
  PlaneGeometry, Shape, SRGBColorSpace, TorusGeometry, TubeGeometry, Vector3, type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const shadowed = <T extends Mesh>(m: T): T => { m.castShadow = true; m.receiveShadow = true; return m; };

export function rbox(w: number, h: number, d: number, r: number, mat: Material, x = 0, y = 0, z = 0): Mesh {
  const m = shadowed(new Mesh(new RoundedBoxGeometry(w, h, d, 5, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)), mat));
  m.position.set(x, y, z);
  return m;
}

/** Cylinder along y. */
export function cyl(r: number, h: number, mat: Material, x = 0, y = 0, z = 0, seg = 48, rTop = r): Mesh {
  const m = shadowed(new Mesh(new CylinderGeometry(rTop, r, h, seg), mat));
  m.position.set(x, y, z);
  return m;
}
export const cylX = (r: number, h: number, mat: Material, x = 0, y = 0, z = 0, seg = 48) => { const m = cyl(r, h, mat, x, y, z, seg); m.rotation.z = Math.PI / 2; return m; };
export const cylZ = (r: number, h: number, mat: Material, x = 0, y = 0, z = 0, seg = 48) => { const m = cyl(r, h, mat, x, y, z, seg); m.rotation.x = Math.PI / 2; return m; };

export function torus(R: number, r: number, mat: Material, x = 0, y = 0, z = 0, seg = 96): Mesh {
  const m = shadowed(new Mesh(new TorusGeometry(R, r, 20, seg), mat));
  m.position.set(x, y, z);
  return m;
}

export function tube(points: [number, number, number][], r: number, mat: Material, seg = 48): Mesh {
  const c = new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)));
  return shadowed(new Mesh(new TubeGeometry(c, seg, r, 12, false), mat));
}

export function anchor(parent: Object3D, x: number, y: number, z: number): Object3D {
  const o = new Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

/** Rounded-rectangle profile extruded with a soft bevel (front faces read as pressed sheet). */
export function plate(w: number, h: number, depth: number, r: number, mat: Material, bevel = 0.03): Mesh {
  const s = new Shape();
  const x0 = -w / 2, y0 = -h / 2;
  s.moveTo(x0 + r, y0);
  s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  s.lineTo(x0 + w, y0 + h - r); s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  s.lineTo(x0 + r, y0 + h); s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  const g = new ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 12 });
  g.translate(0, 0, -depth / 2);
  return shadowed(new Mesh(g, mat));
}

/** A small enamel screen with up to two bars (float vs cap, wear vs threshold), redrawn per state. */
export function screen(w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = Math.round((512 * h) / w);
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new Mesh(new PlaneGeometry(w, h), new MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0 }));
  const draw = (bars: { v: number; color: string }[]) => {
    const g = cv.getContext('2d');
    if (!g) return;
    g.fillStyle = '#0c1b33';
    g.fillRect(0, 0, cv.width, cv.height);
    const pad = cv.width * 0.08, bh = cv.height * 0.12;
    bars.forEach((b, i) => {
      const y = cv.height * (bars.length === 1 ? 0.44 : 0.3 + i * 0.32);
      g.fillStyle = '#1e3560';
      g.fillRect(pad, y, cv.width - pad * 2, bh);
      g.fillStyle = b.color;
      g.fillRect(pad, y, (cv.width - pad * 2) * Math.max(0, Math.min(1, b.v)), bh);
      g.fillStyle = '#dce6f4';
      g.fillRect(cv.width - pad - 3, y - bh * 0.5, 3, bh * 2);
    });
    tex.needsUpdate = true;
  };
  return { mesh, draw };
}

/** Four feet under a footprint. */
export function feet(parent: Object3D, mat: Material, hx: number, hz: number, r = 0.11, h = 0.08): void {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parent.add(cyl(r, h, mat, sx * hx, h / 2, sz * hz));
}
