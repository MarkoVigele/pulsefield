import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  NoToneMapping,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Vector2,
  WebGLRenderer,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import type { AudioSnapshot } from "../audio";
import { paletteRgb } from "../palettes";
import { pixelRatioFor, profileFor, type Quality } from "../quality";
import type { Settings } from "../settings";
import { TransientTracker, canvasCssSize, collectBars, glowAmount, sampleWave } from "./shared";

export type PrismScene = {
  resize(quality: Quality): void;
  draw(snap: AudioSnapshot, settings: Settings, now: number): void;
  dispose(): void;
};

const CLEAR: Record<Settings["background"], number> = {
  void: 0x05060a,
  lab: 0x0b1018,
  dusk: 0x120814,
  grid: 0x07090f,
};

const SIDES = 6;
const RADIUS = 1.38;
const GROUND_Y = -1.12;
const BASE_H = 0.82;
const SPAN_H = 1.85;

export function canCreatePrismScene(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
  } catch {
    return false;
  }
}

export function createPrismScene(host: HTMLElement, after?: HTMLCanvasElement | null): PrismScene {
  const renderer = new WebGLRenderer({
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(CLEAR.void);
  renderer.domElement.className = "viz viz--webgl";
  renderer.domElement.setAttribute("aria-hidden", "true");
  if (after && after.parentElement === host) {
    after.after(renderer.domElement);
  } else {
    host.prepend(renderer.domElement);
  }

  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 0.1, 48);
  const root = new Group();
  scene.add(root);

  const wallMat = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.86,
    side: DoubleSide,
    depthWrite: true,
  });
  const wallMesh = new Mesh(new BufferGeometry(), wallMat);
  root.add(wallMesh);

  const crownMat = new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 });
  const crown = new Line(new BufferGeometry(), crownMat);
  root.add(crown);

  const frameMat = new LineBasicMaterial({ color: 0xb8e8f4, transparent: true, opacity: 0.78 });
  const frame = new LineSegments(makeFrameGeometry(), frameMat);
  root.add(frame);

  const groundMat = new LineBasicMaterial({ color: 0x6a8898, transparent: true, opacity: 0.28 });
  const ground = new LineSegments(makeGroundGeometry(), groundMat);
  const plateMat = new MeshBasicMaterial({
    color: 0x0a1016,
    transparent: true,
    opacity: 0.72,
    side: DoubleSide,
  });
  const plate = new Mesh(makeHexPlate(RADIUS * 1.04), plateMat);
  plate.position.y = GROUND_Y - 0.002;
  root.add(plate, ground);

  const spineMat = new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 });
  const spine = new Line(new BufferGeometry(), spineMat);
  root.add(spine);

  const bandMats = [0, 1, 2].map(
    () => new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }),
  );
  const bands = bandMats.map((mat) => {
    const loop = new LineLoop(makeHexLoop(1), mat);
    loop.position.y = GROUND_Y;
    root.add(loop);
    return loop;
  });

  const shockMat = new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
  const shockPool = Array.from({ length: 5 }, () => {
    const loop = new LineLoop(makeHexLoop(1), shockMat.clone());
    loop.position.y = GROUND_Y + 0.01;
    loop.visible = false;
    root.add(loop);
    return { loop, life: 0, radius: 1 };
  });

  const transients = new TransientTracker();
  let lastQuality: Quality | null = null;
  let lastW = 0;
  let lastH = 0;
  let lastDpr = 0;
  let lastCols = 0;
  let lastSpine = 0;
  let composer: EffectComposer | null = null;
  let bloomPass: UnrealBloomPass | null = null;
  let theta = 0.72;
  let shockCursor = 0;

  const refCanvas = after ?? renderer.domElement;

  const dropComposer = () => {
    composer?.dispose();
    composer = null;
    bloomPass = null;
  };

  const ensureComposer = (w: number, h: number) => {
    if (composer && bloomPass) {
      composer.setSize(w, h);
      bloomPass.resolution.set(w, h);
      return;
    }
    dropComposer();
    const next = new EffectComposer(renderer);
    next.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new Vector2(w, h), 0.34, 0.28, 0.22);
    next.addPass(bloom);
    next.addPass(new OutputPass());
    composer = next;
    bloomPass = bloom;
  };

  const applyQuality = (quality: Quality, w: number, h: number) => {
    const profile = profileFor(quality);
    const dpr = pixelRatioFor(quality);
    if (w !== lastW || h !== lastH || dpr !== lastDpr) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      lastW = w;
      lastH = h;
      lastDpr = dpr;
    }
    if (profile.bloomPass) {
      ensureComposer(w, h);
    } else {
      dropComposer();
    }
    lastQuality = quality;
  };

  const resize = (quality: Quality) => {
    const box = canvasCssSize(refCanvas);
    const w = Math.max(1, Math.floor(box.w));
    const h = Math.max(1, Math.floor(box.h));
    if (quality !== lastQuality || w !== lastW || h !== lastH) {
      applyQuality(quality, w, h);
    }
  };

  const ensureMeshes = (cols: number, spineN: number) => {
    if (cols !== lastCols) {
      wallMesh.geometry.dispose();
      wallMesh.geometry = makeWallGeometry(cols);
      crown.geometry.dispose();
      crown.geometry = makeCrownGeometry(cols);
      lastCols = cols;
    }
    if (spineN !== lastSpine) {
      spine.geometry.dispose();
      spine.geometry = makeSpineGeometry(spineN);
      lastSpine = spineN;
    }
  };

  const draw = (snap: AudioSnapshot, settings: Settings, now: number) => {
    resize(settings.quality);
    const profile = profileFor(settings.quality);
    const total = Math.max(24, Math.min(120, Math.round(settings.barCount * profile.density)));
    const cols = Math.max(6, Math.min(18, Math.round(total / SIDES)));
    const spineN = Math.max(28, Math.min(96, Math.round((profile.orbPoints || 280) / 8)));
    ensureMeshes(cols, spineN);

    const bins = collectBars(snap, cols, now);
    const { kick, pulse } = transients.step(snap, settings.speed);
    const glow = glowAmount(settings);
    const [cr, cg, cb] = paletteRgb(settings.palette, 0.55, 0.9 + snap.rms);
    const accent = new Color(cr / 255, cg / 255, cb / 255);
    const clear = CLEAR[settings.background];

    renderer.setClearColor(clear);
    wallMat.opacity = 0.9 + snap.rms * 0.08;
    frameMat.color.copy(accent);
    frameMat.opacity = 0.55 + snap.low * 0.2 + kick * 0.18;
    groundMat.color.copy(accent);
    groundMat.opacity = 0.16 + snap.low * 0.18;
    shockMat.color.copy(accent);

    updateWalls(wallMesh.geometry, bins, settings, snap, kick);
    updateCrown(crown.geometry, bins, settings, snap, kick);
    updateSpine(spine.geometry, snap, settings, now);
    updateBands(bands, bandMats, settings, snap, pulse, kick);

    if (kick > 0.14) {
      const slot = shockPool[shockCursor % shockPool.length];
      shockCursor += 1;
      if (slot) {
        slot.life = 1;
        slot.radius = RADIUS * (0.92 + kick * 0.08);
        slot.loop.visible = true;
      }
    }
    for (const slot of shockPool) {
      if (slot.life <= 0) {
        slot.loop.visible = false;
        continue;
      }
      slot.life *= 0.9;
      slot.radius *= 1.034 + settings.speed * 0.012 + snap.rms * 0.01;
      slot.loop.scale.setScalar(slot.radius);
      const mat = slot.loop.material;
      if (mat instanceof LineBasicMaterial) {
        mat.color.copy(accent);
        mat.opacity = slot.life * (0.55 + kick * 0.25);
      }
      if (slot.life < 0.04 || slot.radius > 4.2) {
        slot.life = 0;
        slot.loop.visible = false;
      }
    }

    const breathe = 1 + snap.rms * 0.045 + kick * 0.035;
    root.scale.setScalar(breathe);

    theta += 0.0014 * settings.speed * (0.65 + snap.mid * 0.7);
    const dist = 5.15 - kick * 0.18 - snap.rms * 0.12;
    const height = 1.72 + snap.low * 0.22;
    camera.position.set(Math.cos(theta) * dist, height, Math.sin(theta) * dist);
    camera.lookAt(0, 0.08, 0);

    if (bloomPass) {
      bloomPass.strength = 0.22 + glow * 0.42 + snap.rms * 0.12;
      bloomPass.radius = 0.22 + glow * 0.12;
    }
    if (profile.bloomPass && composer) {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
  };

  const dispose = () => {
    dropComposer();
    wallMesh.geometry.dispose();
    wallMat.dispose();
    crown.geometry.dispose();
    crownMat.dispose();
    frame.geometry.dispose();
    frameMat.dispose();
    plate.geometry.dispose();
    plateMat.dispose();
    ground.geometry.dispose();
    groundMat.dispose();
    spine.geometry.dispose();
    spineMat.dispose();
    for (const loop of bands) {
      loop.geometry.dispose();
    }
    for (const mat of bandMats) mat.dispose();
    for (const slot of shockPool) {
      slot.loop.geometry.dispose();
      const mat = slot.loop.material;
      if (mat instanceof LineBasicMaterial) mat.dispose();
    }
    shockMat.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };

  return { resize, draw, dispose };
}

function hexAngle(index: number, sides = SIDES): number {
  return (index / sides) * Math.PI * 2 - Math.PI / 6;
}

function hexPoint(index: number, radius: number, sides = SIDES): { x: number; z: number } {
  const a = hexAngle(index, sides);
  return { x: Math.cos(a) * radius, z: Math.sin(a) * radius };
}

function hexEdgePoint(side: number, t: number, radius: number): { x: number; z: number } {
  const a = hexPoint(side, radius);
  const b = hexPoint(side + 1, radius);
  const k = Math.min(1, Math.max(0, t));
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
}

function binAt(bins: number[], i: number, count: number, mirror: boolean): number {
  if (count <= 0) return 0;
  const clamped = Math.min(count - 1, Math.max(0, i));
  const src = mirror ? (clamped < count / 2 ? count - 1 - clamped : clamped) : clamped;
  return bins[src] ?? 0;
}

function barHeight(energy: number, snap: AudioSnapshot, kick: number): number {
  return BASE_H + energy * SPAN_H + snap.rms * 0.16 + kick * 0.1;
}

function makeWallGeometry(cols: number): BufferGeometry {
  const geo = new BufferGeometry();
  const vertsPerSide = (cols + 1) * 2;
  const positions = new Float32Array(SIDES * vertsPerSide * 3);
  const colors = new Float32Array(SIDES * vertsPerSide * 3);
  const indices: number[] = [];
  for (let s = 0; s < SIDES; s += 1) {
    const base = s * vertsPerSide;
    for (let i = 0; i < cols; i += 1) {
      const a = base + i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  geo.setAttribute("position", new BufferAttribute(positions, 3));
  geo.setAttribute("color", new BufferAttribute(colors, 3));
  geo.setIndex(indices);
  return geo;
}

function makeCrownGeometry(cols: number): BufferGeometry {
  const geo = new BufferGeometry();
  const count = SIDES * cols + 1;
  geo.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute("color", new BufferAttribute(new Float32Array(count * 3), 3));
  return geo;
}

function makeSpineGeometry(count: number): BufferGeometry {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute("color", new BufferAttribute(new Float32Array(count * 3), 3));
  return geo;
}

function makeFrameGeometry(): BufferGeometry {
  const positions: number[] = [];
  for (let i = 0; i < SIDES; i += 1) {
    const a = hexPoint(i, RADIUS);
    const b = hexPoint(i + 1, RADIUS);
    positions.push(a.x, GROUND_Y, a.z, b.x, GROUND_Y, b.z);
    positions.push(a.x, GROUND_Y, a.z, a.x, GROUND_Y + BASE_H, a.z);
    positions.push(a.x, GROUND_Y + BASE_H, a.z, b.x, GROUND_Y + BASE_H, b.z);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  return geo;
}

function makeGroundGeometry(): BufferGeometry {
  const positions: number[] = [];
  const rings = [0.55, 0.9, 1.28, 1.72, 2.2];
  for (const r of rings) {
    for (let i = 0; i < SIDES; i += 1) {
      const a = hexPoint(i, r);
      const b = hexPoint(i + 1, r);
      positions.push(a.x, GROUND_Y, a.z, b.x, GROUND_Y, b.z);
    }
  }
  for (let i = 0; i < SIDES; i += 1) {
    const a = hexPoint(i, 0.2);
    const b = hexPoint(i, 2.2);
    positions.push(a.x, GROUND_Y, a.z, b.x, GROUND_Y, b.z);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  return geo;
}

function makeHexPlate(radius: number): BufferGeometry {
  const positions = new Float32Array((SIDES + 1) * 3);
  const indices: number[] = [];
  positions[1] = 0;
  for (let i = 0; i < SIDES; i += 1) {
    const p = hexPoint(i, radius);
    positions[(i + 1) * 3] = p.x;
    positions[(i + 1) * 3 + 2] = p.z;
    indices.push(0, i + 1, i + 1 === SIDES ? 1 : i + 2);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return geo;
}

function makeHexLoop(radius: number): BufferGeometry {
  const positions = new Float32Array(SIDES * 3);
  for (let i = 0; i < SIDES; i += 1) {
    const p = hexPoint(i, radius);
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = p.z;
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(positions, 3));
  return geo;
}

function updateWalls(
  geo: BufferGeometry,
  bins: number[],
  settings: Settings,
  snap: AudioSnapshot,
  kick: number,
): void {
  const pos = geo.getAttribute("position");
  const col = geo.getAttribute("color");
  if (!pos || !col) return;
  const cols = Math.round(pos.count / (SIDES * 2) - 1);
  if (cols < 1) return;

  for (let s = 0; s < SIDES; s += 1) {
    for (let i = 0; i <= cols; i += 1) {
      const t = i / cols;
      const p = hexEdgePoint(s, t, RADIUS);
      const e = binAt(bins, Math.min(cols - 1, i), cols, settings.mirror);
      const h = barHeight(e, snap, kick);
      const base = (s * (cols + 1) + i) * 2;
      pos.setXYZ(base, p.x, GROUND_Y, p.z);
      pos.setXYZ(base + 1, p.x, GROUND_Y + h, p.z);
      const faceT = (s + t) / SIDES;
      const rgbLo = paletteRgb(settings.palette, faceT, 0.42 + e * 0.35);
      const rgbHi = paletteRgb(settings.palette, 0.28 + faceT * 0.55, 0.78 + e + snap.rms * 0.2);
      col.setXYZ(base, rgbLo[0] / 255, rgbLo[1] / 255, rgbLo[2] / 255);
      col.setXYZ(base + 1, rgbHi[0] / 255, rgbHi[1] / 255, rgbHi[2] / 255);
    }
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
}

function updateCrown(
  geo: BufferGeometry,
  bins: number[],
  settings: Settings,
  snap: AudioSnapshot,
  kick: number,
): void {
  const pos = geo.getAttribute("position");
  const col = geo.getAttribute("color");
  if (!pos || !col) return;
  const cols = Math.round((pos.count - 1) / SIDES);
  if (cols < 1) return;
  let n = 0;
  for (let s = 0; s < SIDES; s += 1) {
    for (let i = 0; i < cols; i += 1) {
      const t = i / cols;
      const p = hexEdgePoint(s, t, RADIUS);
      const e = binAt(bins, i, cols, settings.mirror);
      const h = barHeight(e, snap, kick);
      pos.setXYZ(n, p.x, GROUND_Y + h, p.z);
      const rgb = paletteRgb(settings.palette, 0.55 + t * 0.4, 1);
      col.setXYZ(n, rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
      n += 1;
    }
  }
  const first = hexPoint(0, RADIUS);
  const e0 = binAt(bins, 0, cols, settings.mirror);
  pos.setXYZ(n, first.x, GROUND_Y + barHeight(e0, snap, kick), first.z);
  const tip = paletteRgb(settings.palette, 0.85, 1);
  col.setXYZ(n, tip[0] / 255, tip[1] / 255, tip[2] / 255);
  pos.needsUpdate = true;
  col.needsUpdate = true;
}

function updateSpine(geo: BufferGeometry, snap: AudioSnapshot, settings: Settings, now: number): void {
  const pos = geo.getAttribute("position");
  const col = geo.getAttribute("color");
  if (!pos || !col) return;
  const n = pos.count;
  const height = SPAN_H + BASE_H;
  for (let i = 0; i < n; i += 1) {
    const t = n <= 1 ? 0 : i / (n - 1);
    const wave = snap.time.length ? sampleWave(snap, i, n) : 0.08 * Math.sin(now * 0.002 + t * 10);
    const phase = snap.time.length ? sampleWave(snap, (i + Math.floor(n * 0.25)) % n, n) : wave * 0.4;
    const x = wave * (0.42 + snap.rms * 0.2) * (settings.mirror ? 1 : 0.85);
    const z = phase * 0.22;
    pos.setXYZ(i, x, GROUND_Y + 0.08 + t * height, z);
    const rgb = paletteRgb(settings.palette, 0.2 + t * 0.7, 0.75 + snap.peak);
    col.setXYZ(i, rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
}

function updateBands(
  bands: LineLoop[],
  mats: LineBasicMaterial[],
  settings: Settings,
  snap: AudioSnapshot,
  pulse: number,
  kick: number,
): void {
  const specs = [
    { e: snap.low, y: GROUND_Y + 0.04, r: RADIUS * (1.12 + snap.low * 0.16 + kick * 0.06), t: 0.15 },
    { e: snap.mid, y: GROUND_Y + BASE_H * 0.72 + pulse * 0.08, r: RADIUS * (1.04 + snap.mid * 0.1), t: 0.5 },
    { e: snap.high, y: GROUND_Y + BASE_H + snap.high * 0.35, r: RADIUS * (0.98 + snap.high * 0.12), t: 0.85 },
  ];
  for (let i = 0; i < bands.length; i += 1) {
    const loop = bands[i];
    const mat = mats[i];
    const spec = specs[i];
    if (!loop || !mat || !spec) continue;
    loop.position.y = spec.y;
    loop.scale.setScalar(spec.r);
    const rgb = paletteRgb(settings.palette, spec.t, 0.6 + spec.e);
    mat.color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    mat.opacity = 0.18 + spec.e * 0.55 + kick * 0.12;
  }
}
