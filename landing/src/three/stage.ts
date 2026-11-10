/** One studio for every machine: soft room light (PMREM), a key light with a VSM soft shadow, cool fill
 * and rim lights, a two-layer contact shadow shaped like the machine's footprint (ambient occlusion where
 * it meets the floor), transparent background, neutral tone mapping. Time is explicit so posters and the
 * video capture are deterministic. */
import {
  Box3, CanvasTexture, DirectionalLight, Mesh, MeshBasicMaterial, NeutralToneMapping, PerspectiveCamera,
  PlaneGeometry, PMREMGenerator, Scene, ShadowMaterial, Sphere, Vector3, VSMShadowMap, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeMaterials } from './materials.ts';
import { MACHINES, type MachineKind } from './machines.ts';
import type { Machine, MachineState } from './types.ts';

export interface StageOptions {
  kind: MachineKind;
  state: MachineState;
  /** fixed camera distance (shared scale across posters); default: fit the model */
  distance?: number;
  /** never closer than this (keeps flat machines from filling a grid tile) */
  minDistance?: number;
  /** grid posters: share of the frame the machine's projected box fills (same visual mass for every machine) */
  fill?: number;
  /** multiplies the camera distance (per-machine optical correction for airy or bulky silhouettes) */
  zoom?: number;
  /** fit margin when distance is not given (1 = bounding sphere touches the frame) */
  fit?: number;
  yaw?: number;
  pitch?: number;
  /** fixed look-at height (shared floor line across posters) */
  targetY?: number;
  dpr?: number;
  /** camera drift amplitude (0 for posters of the grid) */
  drift?: number;
}

export interface Stage {
  machine: Machine;
  renderAt(t: number): void;
  start(): void;
  stop(): void;
  anchors(): Record<string, { x: number; y: number }>;
  onFrame(cb: () => void): void;
  setState(s: MachineState): void;
  dispose(): void;
}

/** Soft rounded-rectangle footprint drawn with canvas shadowBlur (works in every engine). */
function footprint(w: number, d: number, blur: number, alpha: number): CanvasTexture {
  const S = 512, pad = 168;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const k = (S - pad * 2) / Math.max(w, d);
  const rw = w * k, rd = d * k, r = Math.min(rw, rd) * 0.18;
  g.shadowColor = `rgba(6,16,36,${alpha})`;
  g.shadowBlur = blur;
  g.shadowOffsetX = S * 2;
  g.beginPath();
  g.roundRect((S - rw) / 2 - S * 2, (S - rd) / 2, rw, rd, r);
  g.fill();
  return new CanvasTexture(cv);
}

function contact(w: number, d: number): Mesh[] {
  const span = Math.max(w, d) * (512 / (512 - 336));
  return [
    [footprint(w * 0.96, d * 0.96, 14, 0.5), 1],
    [footprint(w * 1.02, d * 1.02, 56, 0.3), 1],
  ].map(([tex, s], i) => {
    const m = new Mesh(new PlaneGeometry(span * (s as number), span * (s as number)), new MeshBasicMaterial({ map: tex as CanvasTexture, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.002 + i * 0.001;
    m.renderOrder = -1;
    return m;
  });
}

export function createStage(canvas: HTMLCanvasElement, opt: StageOptions): Stage {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(opt.dpr ?? Math.min(window.devicePixelRatio || 1, 2));
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
  key.position.set(-7, 12, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 14;
  key.shadow.blurSamples = 16;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.03;
  Object.assign(key.shadow.camera, { left: -10, right: 10, top: 10, bottom: -8, near: 1, far: 40 });
  scene.add(key);
  const fill = new DirectionalLight('#dfe9ff', 0.55);
  fill.position.set(8, 4, 3);
  scene.add(fill);
  const rim = new DirectionalLight('#ffffff', 0.8);
  rim.position.set(2, 6, -9);
  scene.add(rim);

  const M = makeMaterials();
  const machine = MACHINES[opt.kind](M);
  machine.setState(opt.state);
  scene.add(machine.group);

  const box = new Box3().setFromObject(machine.group);
  const sphere = box.getBoundingSphere(new Sphere());
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const ground = new Mesh(new PlaneGeometry(40, 40), new ShadowMaterial({ color: '#061024', opacity: 0.18 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  for (const m of contact(size.x, size.z)) { m.position.x = center.x; m.position.z = center.z; scene.add(m); }

  const camera = new PerspectiveCamera(26, 1, 0.1, 200);
  const target = new Vector3(center.x, opt.targetY ?? size.y * 0.47, center.z);
  const yaw = opt.yaw ?? -0.52;
  const pitch = opt.pitch ?? 0.2;
  const drift = opt.drift ?? 1;

  let w = 0, h = 0;
  const frame = (t: number) => {
    const cw = canvas.clientWidth || canvas.width || 1, ch = canvas.clientHeight || canvas.height || 1;
    if (cw !== w || ch !== h) {
      w = cw; h = ch;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const projW = Math.abs(size.x * Math.cos(yaw)) + Math.abs(size.z * Math.sin(yaw));
    const projH = size.y * Math.cos(pitch) + Math.max(size.x, size.z) * Math.sin(pitch);
    // Equal visual mass: frame the geometric mean of the projected box at `fill`, but never let it overflow.
    const tv = 2 * Math.tan(vfov / 2), th = 2 * Math.tan(hfov / 2);
    const depth = Math.max(size.x, size.z) / 2;
    const boxDist = opt.fill ? Math.max(Math.sqrt((projH / tv) * (projW / th)) / opt.fill, Math.max(projH / tv, projW / th) / 0.9) + depth : 0;
    const sphereDist = Math.max(opt.minDistance ?? 0, (sphere.radius * (opt.fit ?? 0.98)) / Math.sin(Math.min(vfov, hfov) / 2));
    const dist = (opt.distance ?? (opt.fill ? boxDist : sphereDist)) * (opt.zoom ?? 1);
    const a = yaw + drift * 0.045 * Math.sin(t * 0.21);
    const p = pitch + drift * 0.012 * Math.sin(t * 0.17 + 1);
    camera.position.set(target.x + Math.sin(a) * Math.cos(p) * dist, target.y + Math.sin(p) * dist, target.z + Math.cos(a) * Math.cos(p) * dist);
    camera.lookAt(target);
    machine.update(t);
    renderer.render(scene, camera);
  };

  let raf = 0, running = false, t0 = 0, last = 0;
  const cbs: (() => void)[] = [];
  const loop = (now: number) => {
    if (!running) return;
    last = (now - t0) / 1000;
    frame(last);
    for (const cb of cbs) cb();
    raf = requestAnimationFrame(loop);
  };
  const v = new Vector3();
  return {
    machine,
    renderAt(t) { last = t; frame(t); for (const cb of cbs) cb(); },
    start() { if (running) return; running = true; t0 = performance.now() - last * 1000; raf = requestAnimationFrame(loop); },
    stop() { running = false; cancelAnimationFrame(raf); },
    anchors() {
      const out: Record<string, { x: number; y: number }> = {};
      for (const [k, o] of Object.entries(machine.anchors)) {
        o.getWorldPosition(v).project(camera);
        out[k] = { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
      }
      return out;
    },
    onFrame(cb) { cbs.push(cb); },
    setState(s) { machine.setState(s); },
    dispose() { this.stop(); renderer.dispose(); pmrem.dispose(); env.dispose(); },
  };
}
