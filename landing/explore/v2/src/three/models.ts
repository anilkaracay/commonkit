/** Procedural machines (no downloaded or generated meshes): rounded boxes, bevelled extrusions, lathes.
 * Every model stands on y = 0, faces +z, and shares one material set and one scale (1 unit ≈ 10 cm). */
import {
  CanvasTexture, CylinderGeometry, ExtrudeGeometry, Group, LatheGeometry, Mesh, MeshStandardMaterial,
  Object3D, PlaneGeometry, Shape, SRGBColorSpace, TorusGeometry, Vector2, type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Materials } from './materials.ts';

export interface MachineState {
  /** float_free / float_cap from the asset ledger */
  float: number;
  /** due_value / threshold of the headline Metric rule (nozzle_clean for the printer) */
  wear: number;
  due: boolean;
  /** an upkeep task is open (get_rule_status open_task) */
  taskOpen: boolean;
  inService: boolean;
}

export interface Machine {
  group: Group;
  anchors: Record<string, Object3D>;
  update(t: number): void;
  setState(s: MachineState): void;
}

const shadowed = <T extends Mesh>(m: T): T => { m.castShadow = true; m.receiveShadow = true; return m; };

function rbox(w: number, h: number, d: number, r: number, mat: Material, x = 0, y = 0, z = 0): Mesh {
  const m = shadowed(new Mesh(new RoundedBoxGeometry(w, h, d, 5, Math.min(r, w / 2, h / 2, d / 2)), mat));
  m.position.set(x, y, z);
  return m;
}

function cyl(r: number, h: number, mat: Material, seg = 48): Mesh {
  return shadowed(new Mesh(new CylinderGeometry(r, r, h, seg), mat));
}

function anchor(parent: Object3D, x: number, y: number, z: number): Object3D {
  const o = new Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

/** A small enamel screen with two bars (float vs cap, wear vs threshold). Drawn once per state change. */
function screen(w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = Math.round((512 * h) / w);
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new Mesh(new PlaneGeometry(w, h), new MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0 }));
  const draw = (bars: { v: number; color: string }[]) => {
    const g = cv.getContext('2d');
    if (!g) return;
    g.fillStyle = '#0C1B33';
    g.fillRect(0, 0, cv.width, cv.height);
    const pad = cv.width * 0.08;
    const bh = cv.height * 0.13;
    bars.forEach((b, i) => {
      const y = cv.height * (0.3 + i * 0.32);
      g.fillStyle = '#1E3560';
      g.fillRect(pad, y, cv.width - pad * 2, bh);
      g.fillStyle = b.color;
      g.fillRect(pad, y, (cv.width - pad * 2) * Math.max(0, Math.min(1, b.v)), bh);
      g.fillStyle = '#DCE6F4';
      g.fillRect(cv.width - pad - 3, y - bh * 0.5, 3, bh * 2);
    });
    tex.needsUpdate = true;
  };
  return { mesh, draw };
}

/** Inverted-U portal frame with rounded outer corners, extruded with a soft bevel. */
function portal(w: number, h: number, bar: number, depth: number, mat: Material): Mesh {
  const ro = 0.32, ri = 0.12, x0 = -w / 2, x1 = w / 2;
  const s = new Shape();
  s.moveTo(x0, 0);
  s.lineTo(x0, h - ro);
  s.quadraticCurveTo(x0, h, x0 + ro, h);
  s.lineTo(x1 - ro, h);
  s.quadraticCurveTo(x1, h, x1, h - ro);
  s.lineTo(x1, 0);
  s.lineTo(x1 - bar, 0);
  s.lineTo(x1 - bar, h - bar - ri);
  s.quadraticCurveTo(x1 - bar, h - bar, x1 - bar - ri, h - bar);
  s.lineTo(x0 + bar + ri, h - bar);
  s.quadraticCurveTo(x0 + bar, h - bar, x0 + bar, h - bar - ri);
  s.lineTo(x0 + bar, 0);
  s.closePath();
  const geo = new ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 4, curveSegments: 16 });
  geo.translate(0, 0, -depth / 2);
  return shadowed(new Mesh(geo, mat));
}

const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);

export function printer(M: Materials): Machine {
  const g = new Group();
  // Base on four feet.
  for (const [x, z] of [[-1.55, 1.15], [1.55, 1.15], [-1.55, -1.15], [1.55, -1.15]] as const) {
    const f = cyl(0.12, 0.08, M.navy); f.position.set(x!, 0.04, z!); g.add(f);
  }
  const baseY = 0.08;
  g.add(rbox(3.7, 0.56, 2.9, 0.16, M.ceramic, 0, baseY + 0.28, 0));
  const front = 1.45;
  // Front screen (float + nozzle bars) and status lens.
  const bezel = rbox(1.25, 0.34, 0.08, 0.05, M.navy, -0.95, baseY + 0.28, front);
  g.add(bezel);
  const scr = screen(1.08, 0.24);
  scr.mesh.position.set(-0.95, baseY + 0.28, front + 0.045);
  g.add(scr.mesh);
  const led = shadowed(new Mesh(new CylinderGeometry(0.055, 0.055, 0.06, 32), M.ledOn));
  led.rotation.x = Math.PI / 2; led.position.set(1.4, baseY + 0.28, front + 0.02);
  g.add(led);
  const knob = cyl(0.13, 0.08, M.aluDark); knob.rotation.x = Math.PI / 2; knob.position.set(0.95, baseY + 0.28, front + 0.03); g.add(knob);

  // Bed (moves along z), with a part being printed and the open-task tab.
  const bed = new Group();
  bed.add(rbox(2.7, 0.07, 2.5, 0.03, M.aluDark, 0, 0, 0));
  bed.add(rbox(2.56, 0.05, 2.36, 0.025, M.navy, 0, 0.06, 0));
  const prof: Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const v = i / 24;
    prof.push(new Vector2(0.34 + 0.12 * Math.sin(v * Math.PI * 1.1) - 0.08 * v, v * 0.95));
  }
  prof.unshift(new Vector2(0, 0));
  const part = shadowed(new Mesh(new LatheGeometry(prof, 64), M.pla));
  part.scale.setScalar(0.8);
  part.position.set(0.15, 0.085, 0.1);
  bed.add(part);
  const tab = rbox(0.34, 0.1, 0.16, 0.03, M.due, -1.12, 0.07, 1.22);
  bed.add(tab);
  const bedY = baseY + 0.6;
  bed.position.set(0, bedY, 0);
  g.add(bed);

  // Portal frame and Z rods.
  const fz = -0.35;
  const frame = portal(3.5, 3.95, 0.34, 0.3, M.ceramic);
  frame.position.set(0, baseY + 0.56, fz);
  g.add(frame);
  for (const x of [-1.2, 1.2]) {
    const r = cyl(0.045, 3.4, M.alu); r.position.set(x, baseY + 0.56 + 1.75, fz + 0.3); g.add(r);
  }

  // X gantry: two rods between two end blocks, the head rides on them.
  const gantry = new Group();
  for (const dy of [0, 0.34]) {
    const rod = cyl(0.04, 2.5, M.alu); rod.rotation.z = Math.PI / 2; rod.position.set(0, dy, 0); gantry.add(rod);
  }
  for (const x of [-1.25, 1.25]) gantry.add(rbox(0.36, 0.62, 0.36, 0.06, M.aluDark, x, 0.17, -0.12));
  const head = new Group();
  head.add(rbox(0.66, 0.78, 0.56, 0.12, M.cobalt, 0, 0.12, 0.12));
  const fan = shadowed(new Mesh(new TorusGeometry(0.17, 0.035, 16, 48), M.navy));
  fan.position.set(0, 0.16, 0.405); head.add(fan);
  const hub = cyl(0.08, 0.03, M.navy); hub.rotation.x = Math.PI / 2; hub.position.set(0, 0.16, 0.4); head.add(hub);
  const nozzleRing = shadowed(new Mesh(new TorusGeometry(0.1, 0.03, 12, 40), M.navy));
  nozzleRing.rotation.x = Math.PI / 2; nozzleRing.position.set(0, -0.3, 0.12); head.add(nozzleRing);
  const tip = shadowed(new Mesh(new CylinderGeometry(0.075, 0.018, 0.2, 32), M.alu));
  tip.position.set(0, -0.37, 0.12); head.add(tip);
  head.position.set(0, 0, 0.18);
  gantry.add(head);
  const gY = bedY + 0.1 + 0.76 + 0.49;
  gantry.position.set(0, gY, fz + 0.42);
  g.add(gantry);

  // Spool on a short arm above the frame.
  const spool = new Group();
  for (const dx of [-0.2, 0.2]) {
    const d = cyl(0.62, 0.05, M.navy, 64); d.rotation.z = Math.PI / 2; d.position.x = dx; spool.add(d);
  }
  const wound = cyl(0.5, 0.36, M.pla, 64); wound.rotation.z = Math.PI / 2; spool.add(wound);
  const hubS = cyl(0.14, 0.5, M.alu); hubS.rotation.z = Math.PI / 2; spool.add(hubS);
  const arm = rbox(0.16, 0.7, 0.16, 0.05, M.aluDark, 0, baseY + 0.56 + 3.95 + 0.25, fz);
  g.add(arm);
  spool.position.set(0, baseY + 0.56 + 3.95 + 0.7, fz);
  g.add(spool);

  const anchors = {
    screen: anchor(g, -0.95, baseY + 0.28, front + 0.06),
    nozzle: anchor(head, 0, -0.4, 0.12),
    task: anchor(bed, -1.12, 0.12, 1.22),
    led: anchor(g, 1.4, baseY + 0.28, front + 0.05),
  };

  let state: MachineState = { float: 0, wear: 0, due: false, taskOpen: false, inService: true };
  return {
    group: g,
    anchors,
    setState(s) {
      state = s;
      scr.draw([{ v: s.float, color: '#8DB9FF' }, { v: s.wear, color: s.due ? '#F07A2A' : '#4D7FF0' }]);
      nozzleRing.material = s.due ? M.due : M.navy;
      tab.visible = s.taskOpen;
      led.material = s.inService ? M.ledOn : M.navy;
    },
    update(t) {
      // Simulated print motion: smooth XY path, slow spool. Deterministic in t (video capture steps t).
      const p = (t % 9) / 9;
      head.position.x = 0.62 * Math.sin(t * 1.1) + 0.12 * Math.sin(t * 2.9);
      bed.position.z = 0.22 * Math.sin(t * 0.73 + 0.6);
      spool.rotation.x = -t * 0.35;
      gantry.position.y = gY + 0.004 * ease(p);
      if (!state.inService) head.position.x = 0;
    },
  };
}

export function washer(M: Materials): Machine {
  const g = new Group();
  for (const [x, z] of [[-1.05, 1.05], [1.05, 1.05], [-1.05, -1.05], [1.05, -1.05]] as const) {
    const f = cyl(0.11, 0.08, M.navy); f.position.set(x!, 0.04, z!); g.add(f);
  }
  const y0 = 0.08, H = 3.1, front = 1.32;
  g.add(rbox(2.7, H, 2.64, 0.22, M.ceramic, 0, y0 + H / 2, 0));
  g.add(rbox(2.36, 0.42, 0.06, 0.05, M.navy, 0, y0 + H - 0.38, front));
  const scr = screen(0.62, 0.2);
  scr.mesh.position.set(-0.55, y0 + H - 0.38, front + 0.035); g.add(scr.mesh);
  const knob = cyl(0.17, 0.1, M.alu); knob.rotation.x = Math.PI / 2; knob.position.set(0.72, y0 + H - 0.38, front + 0.06); g.add(knob);
  const drawer = rbox(0.7, 0.04, 0.02, 0.01, M.aluDark, -0.8, y0 + H - 0.72, front + 0.01); g.add(drawer);
  const cy = y0 + 1.32;
  const ring = shadowed(new Mesh(new TorusGeometry(0.86, 0.1, 24, 96), M.alu));
  ring.position.set(0, cy, front + 0.02); g.add(ring);
  const win = cyl(0.8, 0.04, M.navy, 96); win.rotation.x = Math.PI / 2; win.position.set(0, cy, front); g.add(win);
  const drum = new Group();
  const inner = shadowed(new Mesh(new TorusGeometry(0.56, 0.025, 12, 96), M.cobalt)); drum.add(inner);
  for (let i = 0; i < 3; i++) {
    const rib = rbox(0.1, 0.36, 0.05, 0.02, M.pla, 0, 0.36, 0);
    const holder = new Group(); holder.rotation.z = (i * Math.PI * 2) / 3; holder.add(rib); drum.add(holder);
  }
  drum.position.set(0, cy, front + 0.04); g.add(drum);
  const led = shadowed(new Mesh(new CylinderGeometry(0.045, 0.045, 0.05, 24), M.ledOn));
  led.rotation.x = Math.PI / 2; led.position.set(0.18, y0 + H - 0.38, front + 0.04); g.add(led);
  return {
    group: g,
    anchors: { screen: anchor(g, -0.55, y0 + H - 0.38, front + 0.05), door: anchor(g, 0, cy, front + 0.1) },
    setState(s) {
      scr.draw([{ v: s.float, color: '#8DB9FF' }, { v: s.wear, color: s.due ? '#F07A2A' : '#4D7FF0' }]);
      led.material = s.inService ? M.ledOn : M.navy;
    },
    update(t) { drum.rotation.z = -t * 0.9; },
  };
}

export function laser(M: Materials): Machine {
  const g = new Group();
  for (const [x, z] of [[-1.7, 1.05], [1.7, 1.05], [-1.7, -1.05], [1.7, -1.05]] as const) {
    const f = cyl(0.11, 0.08, M.navy); f.position.set(x!, 0.04, z!); g.add(f);
  }
  const y0 = 0.08, H = 1.15, front = 1.32;
  g.add(rbox(4.0, H, 2.64, 0.16, M.ceramic, 0, y0 + H / 2, 0));
  // Lid with a navy window panel and a front handle.
  const lid = new Group();
  lid.add(rbox(3.92, 0.34, 2.56, 0.14, M.ceramic, 0, 0.17, 1.28));
  lid.add(rbox(3.2, 0.03, 1.8, 0.02, M.navy, 0, 0.345, 1.18));
  lid.add(rbox(1.3, 0.07, 0.1, 0.035, M.alu, 0, 0.12, 2.58));
  lid.position.set(0, y0 + H, -1.28);
  g.add(lid);
  const btn = cyl(0.12, 0.05, M.cobalt); btn.position.set(1.7, y0 + H + 0.37, -0.95); g.add(btn);
  for (let i = 0; i < 6; i++) g.add(rbox(0.05, 0.42, 0.02, 0.012, M.navy, 1.0 + i * 0.16, y0 + H / 2 - 0.05, front + 0.005));
  const scr = screen(0.8, 0.22);
  scr.mesh.position.set(-1.2, y0 + H / 2 - 0.05, front + 0.012); g.add(scr.mesh);
  const led = shadowed(new Mesh(new CylinderGeometry(0.045, 0.045, 0.05, 24), M.ledOn));
  led.rotation.x = Math.PI / 2; led.position.set(-0.55, y0 + H / 2 - 0.05, front + 0.02); g.add(led);
  return {
    group: g,
    anchors: { screen: anchor(g, -1.2, y0 + H / 2, front + 0.05) },
    setState(s) {
      scr.draw([{ v: s.float, color: '#8DB9FF' }, { v: s.wear, color: s.due ? '#F07A2A' : '#4D7FF0' }]);
      led.material = s.inService ? M.ledOn : M.navy;
    },
    update(t) { lid.rotation.x = -0.012 * (1 + Math.sin(t * 0.5)); },
  };
}

export function fridge(M: Materials): Machine {
  const g = new Group();
  for (const [x, z] of [[-0.75, 0.75], [0.75, 0.75], [-0.75, -0.75], [0.75, -0.75]] as const) {
    const f = cyl(0.1, 0.08, M.navy); f.position.set(x!, 0.04, z!); g.add(f);
  }
  const y0 = 0.08, H = 4.3, front = 0.98;
  g.add(rbox(2.0, H, 1.96, 0.2, M.ceramic, 0, y0 + H / 2, 0));
  g.add(rbox(1.94, 0.035, 0.03, 0.012, M.navy, 0, y0 + 2.95, front));
  g.add(rbox(0.09, 0.95, 0.12, 0.04, M.alu, 0.72, y0 + 3.55, front + 0.07));
  g.add(rbox(0.09, 1.6, 0.12, 0.04, M.alu, 0.72, y0 + 2.0, front + 0.07));
  g.add(rbox(0.6, 0.3, 0.05, 0.04, M.navy, -0.45, y0 + 3.6, front + 0.005));
  const scr = screen(0.5, 0.18);
  scr.mesh.position.set(-0.45, y0 + 3.6, front + 0.035); g.add(scr.mesh);
  const led = shadowed(new Mesh(new CylinderGeometry(0.04, 0.04, 0.05, 24), M.ledOn));
  led.rotation.x = Math.PI / 2; led.position.set(-0.05, y0 + 3.6, front + 0.02); g.add(led);
  return {
    group: g,
    anchors: { screen: anchor(g, -0.45, y0 + 3.6, front + 0.05) },
    setState(s) {
      scr.draw([{ v: s.float, color: '#8DB9FF' }, { v: s.wear, color: s.due ? '#F07A2A' : '#4D7FF0' }]);
      led.material = s.inService ? M.ledOn : M.navy;
    },
    update() { /* still */ },
  };
}

export const MACHINES = { printer, washer, laser, fridge } as const;
export type MachineKind = keyof typeof MACHINES;
