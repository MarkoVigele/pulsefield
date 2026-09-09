import {
  ACESFilmicToneMapping,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  FogExp2,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  RingGeometry,
  SRGBColorSpace,
  Scene,
  SphereGeometry,
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
import { TransientTracker, canvasCssSize, collectBars, glowAmount } from "./shared";

export type OrbScene = {
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

export function canCreateOrbScene(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
  } catch {
    return false;
  }
}

export function createOrbScene(host: HTMLElement, after?: HTMLCanvasElement | null): OrbScene {
  const renderer = new WebGLRenderer({
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setClearColor(CLEAR.void);
  renderer.domElement.className = "viz viz--webgl";
  renderer.domElement.setAttribute("aria-hidden", "true");
  if (after && after.parentElement === host) {
    after.after(renderer.domElement);
  } else {
    host.prepend(renderer.domElement);
  }

  const scene = new Scene();
  scene.fog = new FogExp2(CLEAR.void, 0.085);
  const camera = new PerspectiveCamera(42, 1, 0.1, 40);
  const root = new Group();
  scene.add(root);

  const ambient = new AmbientLight(0x6a7a88, 0.22);
  const key = new PointLight(0x9ad4ff, 4.2, 16, 1.4);
  key.position.set(0, 0.35, 0.2);
  scene.add(ambient, key);

  let orbGeo = new SphereGeometry(1, 32, 32);
  let origPos = floatCopy(orbGeo.getAttribute("position"));
  const orbMat = new MeshStandardMaterial({
    color: 0x7ad4ff,
    emissive: 0x245070,
    emissiveIntensity: 0.85,
    roughness: 0.32,
    metalness: 0.22,
  });
  const orb = new Mesh(orbGeo, orbMat);
  orb.position.y = 0.2;

  const coreMat = new MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 1.4,
    roughness: 1,
    metalness: 0,
  });
  const core = new Mesh(new SphereGeometry(0.52, 24, 24), coreMat);
  core.position.y = 0.2;

  const islandMat = new MeshStandardMaterial({
    color: 0x10141c,
    roughness: 0.18,
    metalness: 0.62,
    emissive: 0x0a1220,
    emissiveIntensity: 0.35,
  });
  const island = new Mesh(new CircleGeometry(2.35, 72), islandMat);
  island.rotation.x = -Math.PI / 2;
  island.position.y = -1.12;

  const rimMat = new MeshStandardMaterial({
    color: 0x7ad4ff,
    emissive: 0x3aa0c8,
    emissiveIntensity: 0.8,
    roughness: 0.4,
    metalness: 0.1,
  });
  const rim = new Mesh(new RingGeometry(2.28, 2.62, 80), rimMat);
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = -1.1;

  root.add(island, rim, orb, core);

  const pointsGeo = new BufferGeometry();
  const pointsMat = new PointsMaterial({
    color: 0xc8f4ff,
    size: 0.035,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new Points(pointsGeo, pointsMat);
  root.add(points);

  let pointState: { x: number; y: number; z: number; life: number }[] = [];
  const transients = new TransientTracker();
  let lastQuality: Quality | null = null;
  let lastW = 0;
  let lastH = 0;
  let lastDpr = 0;
  let composer: EffectComposer | null = null;
  let bloomPass: UnrealBloomPass | null = null;
  let theta = 0.35;

  const refCanvas = after ?? renderer.domElement;

  const rebuildOrb = (segments: number) => {
    orb.geometry.dispose();
    orbGeo = new SphereGeometry(1, segments, segments);
    origPos = floatCopy(orbGeo.getAttribute("position"));
    orb.geometry = orbGeo;
  };

  const rebuildPoints = (count: number) => {
    pointState = Array.from({ length: count }, () => spawnPoint(true));
    const buf = new Float32Array(count * 3);
    pointsGeo.setAttribute("position", new BufferAttribute(buf, 3));
  };

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
    const bloom = new UnrealBloomPass(new Vector2(w, h), 0.72, 0.42, 0.18);
    next.addPass(bloom);
    next.addPass(new OutputPass());
    composer = next;
    bloomPass = bloom;
  };

  const applyQuality = (quality: Quality, w: number, h: number) => {
    const profile = profileFor(quality);
    const dpr = pixelRatioFor(quality);
    if (orbGeo.parameters.widthSegments !== profile.orbSegments) {
      rebuildOrb(profile.orbSegments);
    }
    if (pointState.length !== profile.orbPoints) {
      rebuildPoints(profile.orbPoints);
    }
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

  const draw = (snap: AudioSnapshot, settings: Settings, now: number) => {
    resize(settings.quality);
    const profile = profileFor(settings.quality);
    const { kick, pulse } = transients.step(snap, settings.speed);
    const bins = collectBars(snap, 28, now);
    const glow = glowAmount(settings);
    const [r, g, b] = paletteRgb(settings.palette, 0.55, 0.85 + snap.rms);
    const color = new Color(r / 255, g / 255, b / 255);
    const tip = paletteRgb(settings.palette, 0.9, 1);
    const tipColor = new Color(tip[0] / 255, tip[1] / 255, tip[2] / 255);
    const clear = CLEAR[settings.background];

    renderer.setClearColor(clear);
    if (scene.fog instanceof FogExp2) {
      scene.fog.color.setHex(clear);
      scene.fog.density = 0.07 + snap.low * 0.03;
    }

    orbMat.color.copy(color);
    orbMat.emissive.copy(color).multiplyScalar(0.45);
    orbMat.emissiveIntensity = 0.55 + snap.rms * 1.1 + glow * 0.6;
    orbMat.roughness = 0.28 + snap.high * 0.15;
    coreMat.emissive.copy(tipColor);
    coreMat.emissiveIntensity = 1.1 + snap.peak * 1.4 + kick * 1.2;
    key.color.copy(color);
    key.intensity = 2.6 + snap.rms * 6 + kick * 4;
    islandMat.emissive.copy(color).multiplyScalar(0.22 + snap.low * 0.35);
    rimMat.color.copy(color);
    rimMat.emissive.copy(color);
    rimMat.emissiveIntensity = 0.45 + snap.low * 0.9 + kick * 0.6;
    pointsMat.color.copy(tipColor);
    pointsMat.size = 0.028 + snap.high * 0.03 + (profile.bloomPass ? 0.01 : 0);

    const pos = orbGeo.getAttribute("position");
    const count = pos.count;
    for (let i = 0; i < count; i += 1) {
      const ox = origPos[i * 3] ?? 0;
      const oy = origPos[i * 3 + 1] ?? 0;
      const oz = origPos[i * 3 + 2] ?? 0;
      const len = Math.hypot(ox, oy, oz) || 1;
      const nx = ox / len;
      const ny = oy / len;
      const nz = oz / len;
      const t = (ny + 1) * 0.5;
      const idx = Math.min(bins.length - 1, Math.floor(t * bins.length));
      const energy = bins[idx] ?? 0;
      const wave = Math.sin(t * 9 + now * 0.0014 * settings.speed + nx * 3) * snap.mid * 0.05;
      const radius = 1 + energy * 0.3 + snap.rms * 0.07 + wave + kick * 0.05;
      pos.setXYZ(i, nx * radius, ny * radius, nz * radius);
    }
    pos.needsUpdate = true;
    if (settings.quality === "high") {
      orbGeo.computeVertexNormals();
    }

    const breathe = 1 + snap.rms * 0.14 + kick * 0.09;
    orb.scale.setScalar(breathe);
    core.scale.setScalar(0.92 + pulse * 0.18 + snap.peak * 0.12);
    island.scale.setScalar(1 + snap.low * 0.12 + kick * 0.04);
    rim.scale.setScalar(1 + kick * 0.16 + pulse * 0.05);

    const attr = pointsGeo.getAttribute("position");
    for (let i = 0; i < pointState.length; i += 1) {
      const p = pointState[i];
      if (!p || !attr) continue;
      p.life -= 1;
      p.y += 0.006 * settings.speed + snap.low * 0.004;
      const spin = now * 0.00018 * settings.speed + i * 0.01;
      const side = settings.mirror && i % 2 === 0 ? -1 : 1;
      p.x += Math.cos(spin) * 0.002 * side;
      p.z += Math.sin(spin) * 0.002;
      if (kick > 0.12) {
        p.x *= 1.01;
        p.z *= 1.01;
        p.y += kick * 0.04;
      }
      if (p.life <= 0 || Math.hypot(p.x, p.z) > 3.4 || p.y > 2.4) {
        const next = spawnPoint(false);
        p.x = next.x;
        p.y = next.y;
        p.z = next.z;
        p.life = next.life;
      }
      attr.setXYZ(i, p.x, p.y, p.z);
    }
    if (attr) attr.needsUpdate = true;

    theta += 0.0011 * settings.speed * (0.7 + snap.mid);
    const dist = 4.7 - kick * 0.28 - snap.rms * 0.15;
    const height = 1.45 + snap.low * 0.2;
    camera.position.set(Math.cos(theta) * dist, height, Math.sin(theta) * dist);
    camera.lookAt(0, 0.05, 0);

    if (bloomPass) {
      bloomPass.strength = 0.42 + glow * 0.85 + snap.rms * 0.25;
      bloomPass.radius = 0.38 + glow * 0.2;
    }
    if (profile.bloomPass && composer) {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
  };

  const dispose = () => {
    dropComposer();
    orbGeo.dispose();
    orbMat.dispose();
    core.geometry.dispose();
    coreMat.dispose();
    island.geometry.dispose();
    islandMat.dispose();
    rim.geometry.dispose();
    rimMat.dispose();
    pointsGeo.dispose();
    pointsMat.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };

  rebuildPoints(profileFor("medium").orbPoints);
  return { resize, draw, dispose };
}

function floatCopy(attr: { array: ArrayLike<number> }): Float32Array {
  return Float32Array.from(attr.array);
}

function spawnPoint(spread: boolean): { x: number; y: number; z: number; life: number } {
  const a = Math.random() * Math.PI * 2;
  const r = spread ? 0.4 + Math.random() * 2.1 : 0.55 + Math.random() * 0.7;
  return {
    x: Math.cos(a) * r,
    y: spread ? -0.8 + Math.random() * 1.8 : -0.3 + Math.random() * 0.6,
    z: Math.sin(a) * r,
    life: 40 + Math.random() * 90,
  };
}
