/** The other eleven commons, in the printer's language: ceramic bodies, navy enamel screens, aluminium
 * details, one status lens. Simpler than the printer, same materials, same scale (1 unit ≈ 10 cm, scaled
 * down for the large ones so a grid of posters reads as one family). */
import { Group } from 'three';
import { anchor, cyl, cylX, cylZ, feet, rbox, screen, torus, tube } from './kit.ts';
import type { Materials } from './materials.ts';
import type { Machine, MachineState } from './types.ts';
import { printer } from './printer.ts';

type Screen = ReturnType<typeof screen>;
const drawState = (scr: Screen | null, s: MachineState) => scr?.draw([{ v: s.float, color: '#8db9ff' }, { v: s.wear, color: s.due ? '#f07a2a' : '#4d7ff0' }]);

function base(M: Materials, g: Group, scr: Screen | null, led: { material: unknown } | null, update: (t: number, s: MachineState) => void = () => {}, anchors: Machine['anchors'] = {}): Machine {
  let st: MachineState = { float: 0, wear: 0, due: false, taskOpen: false, inService: true };
  return {
    group: g,
    anchors,
    setState(s) { st = s; drawState(scr, s); if (led) led.material = s.inService ? M.ledOn : M.navy; },
    update(t) { update(t, st); },
  };
}

export function washer(M: Materials): Machine {
  const g = new Group();
  feet(g, M.rubber, 1.05, 1.05);
  const y0 = 0.08, H = 3.1, front = 1.32;
  g.add(rbox(2.7, H, 2.64, 0.22, M.ceramic, 0, y0 + H / 2, 0));
  g.add(rbox(2.4, 0.46, 0.08, 0.06, M.navyGloss, 0, y0 + H - 0.4, front));
  const scr = screen(0.66, 0.22); scr.mesh.position.set(-0.55, y0 + H - 0.4, front + 0.045); g.add(scr.mesh);
  g.add(cylZ(0.18, 0.1, M.alu, 0.72, y0 + H - 0.4, front + 0.06));
  const led = cylZ(0.045, 0.05, M.ledOn, 0.2, y0 + H - 0.4, front + 0.04, 24); g.add(led);
  g.add(rbox(0.8, 0.04, 0.02, 0.01, M.aluDark, -0.75, y0 + H - 0.78, front + 0.01));
  const cy = y0 + 1.32;
  g.add(torus(0.9, 0.11, M.alu, 0, cy, front + 0.03));
  g.add(cylZ(0.82, 0.05, M.navyGloss, 0, cy, front, 96));
  const drum = new Group();
  drum.add(torus(0.58, 0.025, M.cobalt, 0, 0, 0));
  for (let i = 0; i < 3; i++) { const h = new Group(); h.rotation.z = (i * Math.PI * 2) / 3; h.add(rbox(0.1, 0.36, 0.05, 0.02, M.pla, 0, 0.38, 0)); drum.add(h); }
  drum.position.set(0, cy, front + 0.05);
  g.add(drum);
  return base(M, g, scr, led, (t, s) => { drum.rotation.z = s.inService ? -t * 0.9 : 0; }, { screen: anchor(g, -0.55, y0 + H - 0.4, front + 0.06) });
}

export function laser(M: Materials): Machine {
  const g = new Group();
  feet(g, M.rubber, 1.75, 1.05);
  const y0 = 0.08, H = 1.15, front = 1.32;
  g.add(rbox(4.0, H, 2.64, 0.16, M.ceramic, 0, y0 + H / 2, 0));
  const lid = new Group();
  lid.add(rbox(3.92, 0.36, 2.56, 0.14, M.ceramic, 0, 0.18, 1.28));
  lid.add(rbox(3.2, 0.03, 1.8, 0.02, M.navyGloss, 0, 0.365, 1.18));
  lid.add(rbox(1.3, 0.08, 0.1, 0.04, M.alu, 0, 0.12, 2.6));
  lid.position.set(0, y0 + H, -1.28);
  g.add(lid);
  g.add(cyl(0.13, 0.05, M.cobalt, 1.7, y0 + H + 0.38, -0.95));
  for (let i = 0; i < 6; i++) g.add(rbox(0.05, 0.42, 0.02, 0.012, M.navy, 1.0 + i * 0.16, y0 + H / 2 - 0.05, front + 0.005));
  const scr = screen(0.8, 0.22); scr.mesh.position.set(-1.2, y0 + H / 2 - 0.05, front + 0.012); g.add(scr.mesh);
  const led = cylZ(0.045, 0.05, M.ledOn, -0.55, y0 + H / 2 - 0.05, front + 0.02, 24); g.add(led);
  return base(M, g, scr, led, (t) => { lid.rotation.x = -0.01 * (1 + Math.sin(t * 0.5)); });
}

export function fridge(M: Materials): Machine {
  const g = new Group();
  feet(g, M.rubber, 0.75, 0.75, 0.1);
  const y0 = 0.08, H = 4.3, front = 0.98;
  g.add(rbox(2.0, H, 1.96, 0.2, M.ceramic, 0, y0 + H / 2, 0));
  g.add(rbox(1.94, 0.035, 0.03, 0.012, M.navy, 0, y0 + 2.95, front));
  g.add(rbox(0.09, 0.95, 0.12, 0.04, M.alu, 0.72, y0 + 3.55, front + 0.07));
  g.add(rbox(0.09, 1.6, 0.12, 0.04, M.alu, 0.72, y0 + 2.0, front + 0.07));
  g.add(rbox(0.62, 0.32, 0.06, 0.05, M.navyGloss, -0.45, y0 + 3.6, front + 0.005));
  const scr = screen(0.5, 0.18); scr.mesh.position.set(-0.45, y0 + 3.6, front + 0.04); g.add(scr.mesh);
  const led = cylZ(0.04, 0.05, M.ledOn, -0.05, y0 + 3.6, front + 0.02, 24); g.add(led);
  return base(M, g, scr, led);
}

export function gpuServer(M: Materials): Machine {
  const g = new Group();
  feet(g, M.rubber, 0.95, 1.2, 0.1);
  const y0 = 0.08, H = 2.6, front = 1.45;
  g.add(rbox(2.3, H, 2.9, 0.12, M.ceramic, 0, y0 + H / 2, 0));
  // Front: four drive bays, a perforated navy panel, screen and lens.
  for (let i = 0; i < 4; i++) g.add(rbox(1.7, 0.18, 0.06, 0.04, M.navyGloss, -0.08, y0 + 0.5 + i * 0.26, front));
  for (let i = 0; i < 4; i++) g.add(cylZ(0.035, 0.03, i === 0 ? M.ledOn : M.aluDark, 0.92, y0 + 0.5 + i * 0.26, front + 0.03, 16));
  g.add(rbox(1.9, 0.9, 0.05, 0.06, M.navy, 0, y0 + 1.9, front));
  for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) g.add(cylZ(0.04, 0.02, M.rubber, -0.72 + c * 0.18, y0 + 1.62 + r * 0.19, front + 0.03, 12));
  const scr = screen(0.62, 0.2); scr.mesh.position.set(-0.55, y0 + H - 0.2, front + 0.005); g.add(scr.mesh);
  g.add(rbox(0.66, 0.24, 0.02, 0.03, M.navyGloss, -0.55, y0 + H - 0.2, front - 0.005));
  const led = cylZ(0.045, 0.05, M.ledOn, 0.7, y0 + H - 0.2, front + 0.01, 24); g.add(led);
  return base(M, g, scr, led);
}

export function tractor(M: Materials): Machine {
  const g = new Group();
  const s = new Group();
  // Big rear wheels, small front wheels (rubber + aluminium hubs).
  for (const sx of [-1, 1]) {
    s.add(cylX(1.15, 0.6, M.rubber, sx * 1.25, 1.15, -0.9, 64));
    s.add(cylX(0.58, 0.62, M.alu, sx * 1.25, 1.15, -0.9, 48));
    s.add(cylX(0.65, 0.42, M.rubber, sx * 1.1, 0.65, 1.9, 48));
    s.add(cylX(0.32, 0.44, M.alu, sx * 1.1, 0.65, 1.9, 32));
  }
  // Chassis, bonnet, cab with a navy roof and glass-free openings.
  s.add(rbox(1.3, 0.7, 3.6, 0.18, M.ceramic, 0, 1.25, 0.6));
  s.add(rbox(1.25, 0.8, 1.9, 0.28, M.cobalt, 0, 1.75, 1.45));
  s.add(rbox(1.3, 0.12, 0.08, 0.04, M.navy, 0, 1.6, 2.42));
  const scr = screen(0.5, 0.16); scr.mesh.position.set(0, 1.85, 2.41); s.add(scr.mesh);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) s.add(cyl(0.06, 1.7, M.alu, sx * 0.85, 2.85, -0.9 + sz * 0.55));
  s.add(rbox(1.95, 0.14, 1.5, 0.06, M.navyGloss, 0, 3.72, -0.9));
  s.add(rbox(1.6, 0.6, 0.8, 0.12, M.ceramic, 0, 1.95, -0.9));
  s.add(cyl(0.07, 0.9, M.aluDark, 0.45, 2.5, 1.9));
  const led = cylZ(0.05, 0.05, M.ledOn, 0.55, 2.25, 2.41, 24); s.add(led);
  s.scale.setScalar(0.92);
  g.add(s);
  return base(M, g, scr, led);
}

export function generator(M: Materials): Machine {
  const g = new Group();
  // Tubular frame with two wheels and a handle, a ceramic engine housing, fuel tank on top.
  for (const sx of [-1, 1]) {
    g.add(tube([[sx * 1.3, 0.25, 1.0], [sx * 1.3, 0.25, -1.0], [sx * 1.3, 2.1, -1.0], [sx * 1.3, 2.1, 1.0], [sx * 1.3, 0.25, 1.0]], 0.07, M.navy, 64));
    g.add(cylX(0.42, 0.3, M.rubber, sx * 1.48, 0.42, -0.85, 48));
    g.add(cylX(0.2, 0.32, M.alu, sx * 1.48, 0.42, -0.85, 32));
  }
  g.add(cyl(0.12, 0.25, M.rubber, -1.1, 0.12, 0.85)); g.add(cyl(0.12, 0.25, M.rubber, 1.1, 0.12, 0.85));
  g.add(rbox(2.3, 1.3, 1.7, 0.2, M.ceramic, 0, 0.95, 0));
  g.add(rbox(1.7, 0.5, 1.3, 0.22, M.cobalt, 0, 1.85, -0.05));
  g.add(cyl(0.16, 0.12, M.alu, 0.55, 2.16, 0.25));
  g.add(rbox(1.0, 0.5, 0.06, 0.06, M.navyGloss, -0.4, 0.95, 0.86));
  const scr = screen(0.8, 0.36); scr.mesh.position.set(-0.4, 0.95, 0.9); g.add(scr.mesh);
  for (let i = 0; i < 5; i++) g.add(rbox(0.05, 0.6, 0.02, 0.012, M.navy, 0.45 + i * 0.14, 0.95, 0.86));
  const led = cylZ(0.05, 0.05, M.ledOn, 0.45, 1.45, 0.86, 24); g.add(led);
  g.add(tube([[-1.3, 2.1, 1.0], [-1.3, 2.6, 1.3], [1.3, 2.6, 1.3], [1.3, 2.1, 1.0]], 0.06, M.alu, 48));
  return base(M, g, scr, led);
}

export function microscope(M: Materials): Machine {
  const g = new Group();
  const s = new Group();
  s.add(rbox(1.6, 0.36, 2.0, 0.16, M.ceramic, 0, 0.18, 0));
  // Curved arm (C-shape), stage, focus knobs, objective turret, inclined binocular head.
  s.add(tube([[0, 0.3, -0.7], [0, 1.6, -0.85], [0, 2.75, -0.55], [0, 3.05, 0.0]], 0.2, M.ceramic, 48));
  s.add(rbox(1.3, 0.1, 1.2, 0.04, M.navyGloss, 0, 1.25, 0.15));
  s.add(rbox(0.5, 0.04, 0.3, 0.02, M.alu, 0, 1.32, 0.15));
  for (const sx of [-1, 1]) { s.add(cylX(0.22, 0.12, M.aluDark, sx * 0.3, 1.0, -0.72)); s.add(cylX(0.13, 0.18, M.alu, sx * 0.42, 1.0, -0.72)); }
  s.add(cyl(0.3, 0.18, M.aluDark, 0, 2.55, 0.15));
  for (let i = 0; i < 3; i++) { const o = cyl(0.07, 0.5, M.alu, Math.cos(i * 2.1) * 0.15, 2.2, 0.15 + Math.sin(i * 2.1) * 0.15, 24, 0.05); s.add(o); }
  s.add(rbox(0.6, 0.45, 0.6, 0.12, M.cobalt, 0, 3.0, 0.05));
  for (const sx of [-1, 1]) { const ep = cyl(0.09, 0.6, M.navy, sx * 0.14, 3.4, 0.3, 24); ep.rotation.x = -0.6; s.add(ep); }
  const scr = screen(0.6, 0.2); scr.mesh.position.set(0, 0.2, 1.005); s.add(scr.mesh);
  const led = cylZ(0.04, 0.05, M.ledOn, 0.55, 0.2, 1.0, 24); s.add(led);
  s.scale.setScalar(1.05);
  g.add(s);
  return base(M, g, scr, led);
}

export function rehearsalRoom(M: Materials): Machine {
  const g = new Group();
  // A rehearsal room shown by its shared kit: an amp head on a speaker cabinet, and a mic stand.
  feet(g, M.rubber, 0.95, 0.65, 0.1);
  g.add(rbox(2.2, 2.2, 1.5, 0.14, M.ceramic, 0, 0.08 + 1.1, 0));
  g.add(rbox(1.96, 1.96, 0.06, 0.08, M.navy, 0, 1.18, 0.75));
  for (const [x, y] of [[-0.48, 1.66], [0.48, 1.66], [-0.48, 0.7], [0.48, 0.7]] as const) {
    g.add(torus(0.36, 0.05, M.aluDark, x, y, 0.8, 64));
    g.add(cylZ(0.12, 0.06, M.navyGloss, x, y, 0.8, 32));
  }
  g.add(rbox(2.2, 0.75, 1.3, 0.12, M.cobalt, 0, 2.66, -0.05));
  g.add(rbox(1.9, 0.3, 0.06, 0.05, M.navyGloss, 0, 2.66, 0.62));
  for (let i = 0; i < 6; i++) g.add(cylZ(0.06, 0.08, M.alu, -0.6 + i * 0.18, 2.66, 0.67, 24));
  const scr = screen(0.42, 0.16); scr.mesh.position.set(0.68, 2.66, 0.655); g.add(scr.mesh);
  const led = cylZ(0.04, 0.05, M.ledOn, 0.42, 2.66, 0.66, 24); g.add(led);
  const stand = new Group();
  stand.add(cyl(0.32, 0.04, M.navy, 0, 0.02, 0));
  stand.add(cyl(0.03, 3.0, M.aluDark, 0, 1.52, 0));
  const mic = cyl(0.08, 0.35, M.navyGloss, 0, 3.1, 0.08, 24); mic.rotation.x = 0.5; stand.add(mic);
  stand.position.set(1.85, 0, 0.6);
  g.add(stand);
  return base(M, g, scr, led);
}

export function evCharger(M: Materials): Machine {
  const g = new Group();
  g.add(rbox(1.1, 0.12, 0.9, 0.05, M.navy, 0, 0.06, 0));
  g.add(rbox(0.8, 3.7, 0.6, 0.2, M.ceramic, 0, 0.12 + 1.85, 0));
  g.add(rbox(0.6, 0.5, 0.05, 0.06, M.navyGloss, 0, 3.1, 0.3));
  const scr = screen(0.5, 0.36); scr.mesh.position.set(0, 3.1, 0.33); g.add(scr.mesh);
  g.add(rbox(0.82, 0.08, 0.62, 0.03, M.cobalt, 0, 3.7, 0));
  const led = cylZ(0.045, 0.05, M.ledOn, 0, 2.7, 0.31, 24); g.add(led);
  // Holster with the connector, and the coiled cable hanging from the side.
  g.add(rbox(0.3, 0.4, 0.2, 0.06, M.navy, 0.22, 2.1, 0.38));
  const plug = rbox(0.18, 0.34, 0.24, 0.07, M.navyGloss, 0.22, 2.3, 0.5); g.add(plug);
  g.add(tube([[0.42, 1.7, 0.1], [0.75, 1.2, 0.3], [0.7, 0.55, 0.45], [0.35, 0.7, 0.6], [0.3, 1.5, 0.55], [0.22, 2.1, 0.5]], 0.05, M.rubber, 64));
  return base(M, g, scr, led);
}

export function cargoBike(M: Materials): Machine {
  const g = new Group();
  const wheel = (z: number, r: number) => {
    g.add(torus(r, 0.07, M.rubber, 0, r + 0.07, z, 72).rotateY(Math.PI / 2));
    g.add(torus(r - 0.08, 0.025, M.alu, 0, r + 0.07, z, 72).rotateY(Math.PI / 2));
    g.add(cylX(0.08, 0.2, M.aluDark, 0, r + 0.07, z, 24));
  };
  wheel(-1.6, 0.68); wheel(1.75, 0.52);
  // Frame tubes (cobalt), seat, handlebar, front cargo box (ceramic) with the lock module.
  const F = (pts: [number, number, number][]) => g.add(tube(pts, 0.06, M.cobalt, 32));
  F([[0, 0.75, -1.6], [0, 1.7, -0.9]]);
  F([[0, 0.75, -1.6], [0, 0.85, 0.2], [0, 0.6, 1.0], [0, 0.6, 1.75]]);
  F([[0, 0.85, -0.1], [0, 1.7, -0.9]]);
  F([[0, 1.7, -0.9], [0, 1.8, 0.4]]);
  F([[0, 1.8, 0.4], [0, 0.6, 1.75]]);
  g.add(cyl(0.035, 0.5, M.alu, 0, 1.95, -0.95));
  g.add(rbox(0.28, 0.08, 0.5, 0.04, M.navy, 0, 2.2, -1.0));
  g.add(cyl(0.035, 0.5, M.alu, 0, 2.05, 0.4));
  g.add(cylX(0.035, 0.9, M.aluDark, 0, 2.3, 0.4, 24));
  g.add(rbox(1.1, 0.75, 1.15, 0.12, M.ceramic, 0, 1.1, 1.2));
  g.add(rbox(0.5, 0.2, 0.05, 0.04, M.navyGloss, 0.0, 1.15, 1.785));
  const scr = screen(0.4, 0.14); scr.mesh.position.set(0, 1.15, 1.815); g.add(scr.mesh);
  const led = cylZ(0.035, 0.05, M.ledOn, 0.4, 1.15, 1.78, 24); g.add(led);
  return base(M, g, scr, led);
}

export function ladder(M: Materials): Machine {
  const g = new Group();
  // A-frame step ladder: aluminium rails, ceramic steps, cobalt top cap, navy spreader, rubber feet.
  const h = 4.2, spread = 0.75;
  const side = (sz: number, steps: boolean) => {
    const leg = new Group();
    for (const sx of [-1, 1]) leg.add(rbox(0.1, h, 0.18, 0.03, M.alu, sx * 0.62, h / 2, 0));
    for (const sx of [-1, 1]) leg.add(rbox(0.16, 0.12, 0.26, 0.04, M.rubber, sx * 0.62, 0.06, 0));
    if (steps) for (let i = 1; i <= 5; i++) leg.add(rbox(1.18, 0.07, 0.34, 0.03, M.ceramic, 0, i * 0.68, 0.08));
    else for (let i = 1; i <= 3; i++) leg.add(rbox(1.18, 0.05, 0.06, 0.02, M.aluDark, 0, i * 1.0, 0));
    leg.rotation.x = -sz * 0.17;
    leg.position.z = sz * spread;
    g.add(leg);
  };
  side(1, true); side(-1, false);
  g.add(rbox(1.42, 0.24, 0.6, 0.08, M.cobalt, 0, h + 0.02, 0));
  for (const sx of [-1, 1]) g.add(tube([[sx * 0.66, 1.6, 0.5], [sx * 0.68, 1.5, 0], [sx * 0.66, 1.6, -0.5]], 0.025, M.navy, 16));
  const tag = new Group();
  tag.add(rbox(0.4, 0.28, 0.04, 0.04, M.navyGloss, 0, 0, 0));
  const scr = screen(0.32, 0.18); scr.mesh.position.set(0, 0, 0.025); tag.add(scr.mesh);
  tag.position.set(0, 2.9, 0.98); tag.rotation.x = -0.17;
  g.add(tag);
  return base(M, g, scr, null);
}

export const MACHINES = {
  printer_3d: printer,
  laser_cutter: laser,
  washer,
  community_fridge: fridge,
  gpu_server: gpuServer,
  tractor,
  emergency_generator: generator,
  microscope,
  rehearsal_room: rehearsalRoom,
  ev_charger: evCharger,
  cargo_bike: cargoBike,
  tool_library_ladder: ladder,
} as const;
export type MachineKind = keyof typeof MACHINES;
