/** The scroll stage: the scenario machines stand in one row on one floor; the camera dollies from one to the
 * next as the visitor scrolls (eased), and each machine animates its own state change. One renderer, one
 * studio (same lighting as the hero), the key light and its shadow follow the camera target. */
import {
  Box3, DirectionalLight, Group, Mesh, NeutralToneMapping, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Scene,
  ShadowMaterial, Sphere, Vector3, VSMShadowMap, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeMaterials } from './materials.ts';
import { MACHINES } from './machines.ts';
import { SCENES } from './scenes.ts';
import { contact } from './stage.ts';
import type { Machine, MachineState } from './types.ts';

export interface World {
  /** p ∈ [0, scenes): integer part = scene, fraction = progress inside it */
  renderAt(p: number, t: number): void;
  dispose(): void;
}

const SPACING = 9;
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export function createWorld(canvas: HTMLCanvasElement, bases: MachineState[], dpr = Math.min(devicePixelRatio || 1, 2)): World {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = VSMShadowMap;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  const key = new DirectionalLight('#ffffff', 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 14;
  key.shadow.blurSamples = 16;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.03;
  // Wide frustum: its edge must stay outside the frame, or VSM leaves a faint square on the floor.
  Object.assign(key.shadow.camera, { left: -24, right: 24, top: 22, bottom: -18, near: 1, far: 60 });
  scene.add(key, key.target);
  const fill = new DirectionalLight('#dfe9ff', 0.55);
  const rim = new DirectionalLight('#ffffff', 0.8);
  scene.add(fill, rim, fill.target, rim.target);
  const ground = new Mesh(new PlaneGeometry(SPACING * SCENES.length + 60, 60), new ShadowMaterial({ color: '#061024', opacity: 0.18 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.x = (SPACING * (SCENES.length - 1)) / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const M = makeMaterials();
  const items = SCENES.map((def, i) => {
    const machine: Machine = MACHINES[def.kind](M);
    const holder = new Group();
    holder.add(machine.group);
    holder.position.x = i * SPACING;
    scene.add(holder);
    const box = new Box3().setFromObject(machine.group);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    for (const m of contact(size.x, size.z)) { m.position.set(center.x + i * SPACING, m.position.y, center.z); scene.add(m); }
    const radius = box.getBoundingSphere(new Sphere()).radius;
    return { def, machine, base: bases[i]!, target: new Vector3(i * SPACING + center.x, size.y * 0.47, center.z), radius, key: '' };
  });

  const camera = new PerspectiveCamera(26, 1, 0.1, 300);
  const target = new Vector3();
  let w = 0, h = 0;

  function frame(p: number, t: number): void {
    const cw = canvas.clientWidth || 1, ch = canvas.clientHeight || 1;
    if (cw !== w || ch !== h) { w = cw; h = ch; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    const n = items.length;
    const i = Math.max(0, Math.min(n - 1, Math.floor(p)));
    const u = Math.max(0, Math.min(1, p - i));
    // Hold on a machine for most of its scene, then ease to the next one in the last fifth.
    const move = i < n - 1 ? ease((u - 0.8) / 0.2) : 0;
    const a = items[i]!, b = items[Math.min(n - 1, i + 1)]!;
    target.lerpVectors(a.target, b.target, move);
    const vfov = (camera.fov * Math.PI) / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const fit = (r: number) => (r * 0.98) / Math.sin(Math.min(vfov, hfov) / 2);
    // Pull back while gliding so both machines stay in frame mid-move (no empty floor).
    const dist = (fit(a.radius) + (fit(b.radius) - fit(a.radius)) * move) * (1 + 0.6 * Math.sin(Math.PI * move));
    const yaw = -0.5 + 0.08 * Math.sin(p * 1.3), pitch = 0.17;
    camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(target);
    key.position.set(target.x - 7, 12, target.z + 6); key.target.position.copy(target);
    fill.position.set(target.x + 8, 4, target.z + 3); fill.target.position.copy(target);
    rim.position.set(target.x + 2, 6, target.z - 9); rim.target.position.copy(target);
    // State: scenes before the current one show their end state, later ones their start state.
    items.forEach((it, k) => {
      const uk = k < i ? 1 : k > i ? 0 : u / 0.8;
      const s = it.def.apply(Math.min(1, uk), it.base);
      const sig = `${s.float.toFixed(2)}|${s.wear.toFixed(2)}|${s.due}|${s.taskOpen}|${s.inService}|${s.active}`;
      if (sig !== it.key) { it.key = sig; it.machine.setState(s); }
      if (Math.abs(k - p) < 1.5) it.machine.update(t);
    });
    renderer.render(scene, camera);
  }

  return {
    renderAt: frame,
    dispose() { renderer.dispose(); pmrem.dispose(); env.dispose(); },
  };
}
