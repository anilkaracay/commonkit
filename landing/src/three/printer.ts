/** The hero machine: a stylised bed-slinger FDM printer. Proportions follow a real 250 × 210 mm class
 * printer (1 unit ≈ 10 cm): low base with a screen, a moving bed, a portal frame with Z rods and motors,
 * an X gantry with a print head, a spool on the frame and a PTFE tube to the head. */
import { ExtrudeGeometry, Group, LatheGeometry, Mesh, Shape, Vector2, type BufferGeometry } from 'three';
import { anchor, cyl, cylX, cylZ, feet, rbox, screen, shadowed, torus, tube } from './kit.ts';
import type { Materials } from './materials.ts';
import type { Machine, MachineState } from './types.ts';

/** Inverted-U portal with rounded outer corners and a bevelled edge that catches a highlight. */
function portal(w: number, h: number, bar: number, depth: number): BufferGeometry {
  const ro = 0.34, ri = 0.1, x0 = -w / 2, x1 = w / 2;
  const s = new Shape();
  s.moveTo(x0, 0);
  s.lineTo(x0, h - ro); s.quadraticCurveTo(x0, h, x0 + ro, h);
  s.lineTo(x1 - ro, h); s.quadraticCurveTo(x1, h, x1, h - ro);
  s.lineTo(x1, 0); s.lineTo(x1 - bar, 0);
  s.lineTo(x1 - bar, h - bar - ri); s.quadraticCurveTo(x1 - bar, h - bar, x1 - bar - ri, h - bar);
  s.lineTo(x0 + bar + ri, h - bar); s.quadraticCurveTo(x0 + bar, h - bar, x0 + bar, h - bar - ri);
  s.lineTo(x0 + bar, 0);
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 5, curveSegments: 20 });
  g.translate(0, 0, -depth / 2);
  return g;
}

export function printer(M: Materials): Machine {
  const g = new Group();
  const baseY = 0.08, baseH = 0.62, front = 1.5;
  feet(g, M.rubber, 1.62, 1.22, 0.13, 0.08);
  g.add(rbox(3.8, baseH, 3.0, 0.18, M.ceramic, 0, baseY + baseH / 2, 0));
  // A shallow shadow-gap line around the top of the base (reads as a two-part housing).
  g.add(rbox(3.812, 0.022, 3.012, 0.18, M.navy, 0, baseY + baseH - 0.15, 0));
  // Front: screen in a gloss bezel, knob, status lens, power rocker.
  const sy = baseY + 0.3;
  g.add(rbox(1.36, 0.4, 0.08, 0.06, M.navyGloss, -0.92, sy, front));
  const scr = screen(1.18, 0.28);
  scr.mesh.position.set(-0.92, sy, front + 0.046);
  g.add(scr.mesh);
  g.add(cylZ(0.16, 0.08, M.aluDark, 0.62, sy, front + 0.03));
  g.add(cylZ(0.12, 0.1, M.alu, 0.62, sy, front + 0.06));
  const led = cylZ(0.05, 0.05, M.ledOn, 1.42, sy, front + 0.02, 32);
  g.add(led);

  // Bed: Y carriage, heated bed, PEI sheet, four levelling knobs, the part, the open-task tab.
  const bed = new Group();
  bed.add(rbox(2.9, 0.06, 2.6, 0.03, M.aluDark, 0, 0, 0));
  bed.add(rbox(2.72, 0.06, 2.48, 0.04, M.alu, 0, 0.07, 0));
  bed.add(rbox(2.62, 0.035, 2.38, 0.02, M.navy, 0, 0.12, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bed.add(cyl(0.09, 0.07, M.aluDark, sx * 1.22, -0.06, sz * 1.08, 24));
  const prof: Vector2[] = [new Vector2(0, 0)];
  for (let i = 0; i <= 28; i++) {
    const v = i / 28;
    prof.push(new Vector2(0.24 + 0.07 * Math.sin(v * Math.PI * 1.2) + 0.012 * Math.cos(v * 60), v * 0.86));
  }
  prof.push(new Vector2(0.2, 0.86));
  const part = shadowed(new Mesh(new LatheGeometry(prof, 72), M.pla));
  part.position.set(0.2, 0.14, 0.12);
  bed.add(part);
  const tab = rbox(0.36, 0.09, 0.18, 0.03, M.due, -1.12, 0.16, 1.1);
  bed.add(tab);
  const bedY = baseY + baseH + 0.1;
  bed.position.set(0, bedY, 0);
  g.add(bed);

  // Portal frame, Z motors at the bottom, rods and lead screws, top clamps.
  const fz = -0.42, frameY = baseY + baseH;
  const frame = shadowed(new Mesh(portal(3.6, 4.0, 0.36, 0.32), M.ceramic));
  frame.position.set(0, frameY, fz);
  g.add(frame);
  for (const sx of [-1, 1]) {
    g.add(rbox(0.42, 0.36, 0.42, 0.05, M.navy, sx * 1.24, frameY + 0.18, fz + 0.38));
    g.add(cyl(0.045, 3.3, M.alu, sx * 1.12, frameY + 0.36 + 1.65, fz + 0.32));
    g.add(cyl(0.03, 3.3, M.aluDark, sx * 1.34, frameY + 0.36 + 1.65, fz + 0.36));
    g.add(rbox(0.36, 0.16, 0.3, 0.04, M.aluDark, sx * 1.24, frameY + 3.58, fz + 0.32));
  }

  // X gantry with two rods, end blocks, and the head.
  const gantry = new Group();
  for (const dy of [0, 0.36]) gantry.add(cylX(0.04, 2.5, M.alu, 0, dy, 0));
  for (const sx of [-1, 1]) gantry.add(rbox(0.4, 0.66, 0.42, 0.07, M.navy, sx * 1.23, 0.18, -0.08));
  const head = new Group();
  head.add(rbox(0.7, 0.82, 0.5, 0.1, M.cobalt, 0, 0.16, 0.1));
  head.add(rbox(0.62, 0.7, 0.06, 0.08, M.navyGloss, 0, 0.12, 0.37));
  const fan = torus(0.17, 0.028, M.alu, 0, 0.16, 0.41, 64);
  head.add(fan);
  const blades = new Group();
  for (let i = 0; i < 5; i++) {
    const b = rbox(0.05, 0.13, 0.012, 0.006, M.aluDark, 0, 0.07, 0);
    const h = new Group(); h.rotation.z = (i * Math.PI * 2) / 5; h.add(b); blades.add(h);
  }
  blades.position.set(0, 0.16, 0.405);
  head.add(blades);
  head.add(cyl(0.06, 0.12, M.alu, 0, -0.32, 0.12, 32));
  const nozzleRing = torus(0.085, 0.022, M.navy, 0, -0.26, 0.12, 40);
  nozzleRing.rotation.x = Math.PI / 2;
  head.add(nozzleRing);
  head.add(cyl(0.022, 0.12, M.alu, 0, -0.43, 0.12, 24, 0.06));
  head.position.set(0, 0, 0.16);
  gantry.add(head);
  const gY = bedY + 0.14 + 0.86 + 0.52;
  gantry.position.set(0, gY, fz + 0.46);
  g.add(gantry);

  // Spool holder on top of the frame, PTFE tube to the head (redrawn as the head moves).
  const topY = frameY + 4.0;
  g.add(rbox(0.16, 0.36, 0.16, 0.05, M.aluDark, 0.9, topY + 0.16, fz));
  const spool = new Group();
  for (const dx of [-0.19, 0.19]) spool.add(cylX(0.5, 0.045, M.navy, dx, 0, 0, 72));
  spool.add(cylX(0.42, 0.33, M.pla, 0, 0, 0, 72));
  spool.add(cylX(0.13, 0.52, M.alu, 0, 0, 0, 32));
  spool.position.set(0.9, topY + 0.52, fz - 0.05);
  g.add(spool);
  let ptfe: Mesh | null = null;
  const tubeAt = (hx: number) => {
    if (ptfe) { g.remove(ptfe); ptfe.geometry.dispose(); }
    const hz = fz + 0.46 + 0.16 + 0.1, hy = gY + 0.6;
    ptfe = tube([[0.9, topY + 0.1, fz + 0.2], [0.75 + hx * 0.2, topY - 0.05, fz + 0.75], [hx * 0.7, gY + 1.3, hz + 0.25], [hx, hy, hz]], 0.035, M.navyGloss, 40);
    g.add(ptfe);
  };
  tubeAt(0);

  const anchors = {
    screen: anchor(g, -0.92, sy, front + 0.07),
    nozzle: anchor(head, 0, -0.46, 0.12),
    task: anchor(bed, -1.12, 0.2, 1.1),
    upkeep: anchor(head, -0.36, 0.16, 0.2),
    led: anchor(g, 1.42, sy, front + 0.05),
  };
  let state: MachineState = { float: 0, wear: 0, due: false, taskOpen: false, inService: true };
  let lastTubeX = 0;
  return {
    group: g,
    anchors,
    setState(s) {
      state = s;
      scr.draw([{ v: s.float, color: '#8db9ff' }, { v: s.wear, color: s.due ? '#f07a2a' : '#4d7ff0' }]);
      nozzleRing.material = s.due ? M.due : M.navy;
      tab.visible = s.taskOpen;
      led.material = s.inService ? M.ledOn : M.navy;
    },
    update(t) {
      // Simulated print motion (labelled on the page): smooth XY path, slow spool, part-cooling fan.
      const x = state.inService ? 0.62 * Math.sin(t * 1.1) + 0.12 * Math.sin(t * 2.9) : 0;
      head.position.x = x;
      bed.position.z = state.inService ? 0.2 * Math.sin(t * 0.73 + 0.6) : 0;
      spool.rotation.x = -t * 0.35;
      blades.rotation.z = -t * 9;
      if (Math.abs(x - lastTubeX) > 0.03) { tubeAt(x); lastTubeX = x; }
    },
  };
}
