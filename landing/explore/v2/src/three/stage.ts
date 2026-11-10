/** One studio for every machine: soft room light (PMREM), one key light with a soft shadow, a contact
 * shadow for ambient occlusion, transparent background (the page colour shows through), neutral tone mapping.
 * Time is explicit so posters and the video capture are deterministic. */
import {
  ACESFilmicToneMapping, Box3, CanvasTexture, DirectionalLight, Mesh, MeshBasicMaterial, NeutralToneMapping,
  VSMShadowMap, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Scene, ShadowMaterial, Sphere, Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeMaterials } from './materials.ts';
import { MACHINES, type Machine, type MachineKind, type MachineState } from './models.ts';

export interface StageOptions {
  kind: MachineKind;
  state: MachineState;
  /** fixed camera distance in model units (shared scale across posters); default: fit the model */
  distance?: number;
  /** horizontal framing offset in model units (positive moves the model left on screen) */
  shiftX?: number;
  yaw?: number;
  pitch?: number;
  /** fixed look-at height (shared floor line across posters) */
  targetY?: number;
  dpr?: number;
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

function contactShadow(size: number): Mesh {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(6,16,36,0.55)');
  grd.addColorStop(0.45, 'rgba(6,16,36,0.22)');
  grd.addColorStop(1, 'rgba(6,16,36,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const m = new Mesh(new PlaneGeometry(size, size), new MeshBasicMaterial({ map: new CanvasTexture(cv), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002;
  m.renderOrder = -1;
  return m;
}

export function createStage(canvas: HTMLCanvasElement, opt: StageOptions): Stage {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(opt.dpr ?? Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = NeutralToneMapping ?? ACESFilmicToneMapping;
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
  const sc = key.shadow.camera;
  sc.left = -6; sc.right = 6; sc.top = 7; sc.bottom = -4; sc.near = 1; sc.far = 30;
  scene.add(key);
  const fill = new DirectionalLight('#dfe9ff', 0.55);
  fill.position.set(8, 4, 3);
  scene.add(fill);
  const rim = new DirectionalLight('#ffffff', 0.7);
  rim.position.set(2, 6, -9);
  scene.add(rim);

  const M = makeMaterials();
  const machine = MACHINES[opt.kind](M);
  machine.setState(opt.state);
  scene.add(machine.group);

  const box = new Box3().setFromObject(machine.group);
  const sphere = box.getBoundingSphere(new Sphere());
  const size = box.getSize(new Vector3());
  const ground = new Mesh(new PlaneGeometry(40, 40), new ShadowMaterial({ color: '#061024', opacity: 0.2 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const blob = contactShadow(Math.max(size.x, size.z) * 1.55);
  blob.scale.set(size.x / Math.max(size.x, size.z), 1, size.z / Math.max(size.x, size.z));
  blob.scale.multiplyScalar(1.05);
  scene.add(blob);

  const camera = new PerspectiveCamera(26, 1, 0.1, 200);
  const target = new Vector3(0, opt.targetY ?? size.y * 0.47, 0);
  const yaw = opt.yaw ?? -0.52;
  const pitch = opt.pitch ?? 0.2;

  let w = 0, h = 0;
  const frame = (t: number) => {
    const cw = canvas.clientWidth || 1, ch = canvas.clientHeight || 1;
    if (cw !== w || ch !== h) {
      w = cw; h = ch;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
    }
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const fit = (sphere.radius * 0.98) / Math.sin(Math.min(vfov, hfov) / 2);
    const dist = opt.distance ?? fit;
    const a = yaw + 0.045 * Math.sin(t * 0.21);
    const p = pitch + 0.012 * Math.sin(t * 0.17 + 1);
    camera.position.set(Math.sin(a) * Math.cos(p) * dist, target.y + Math.sin(p) * dist, Math.cos(a) * Math.cos(p) * dist);
    camera.lookAt(target);
    if (opt.shiftX) {
      camera.updateMatrixWorld();
      const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      camera.position.addScaledVector(right, opt.shiftX);
    }
    camera.updateProjectionMatrix();
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
