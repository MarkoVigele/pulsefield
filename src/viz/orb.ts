import type { AudioSnapshot } from "../audio";
import { paletteColor, paletteGlow, paletteRgb, rgba } from "../palettes";
import type { PresetId } from "../presets";
import { profileFor, threeDEnabled } from "../quality";
import type { Settings } from "../settings";
import {
  TransientTracker,
  collectBars,
  glowAmount,
  paintBackground,
  resizeCanvas,
  sampleWave,
} from "./shared";
import type { PrismScene } from "./orb3d";
import type { Visualizer, VisualizerHost } from "./types";

const SIDES = 6;

export class PrismField implements Visualizer {
  readonly id: PresetId = "orb";
  private host: VisualizerHost | null = null;
  private scene: PrismScene | null = null;
  private loading: Promise<void> | null = null;
  private failed = false;
  private transients = new TransientTracker();
  private shocks: { r: number; a: number }[] = [];

  mount(host: VisualizerHost): void {
    this.host = host;
  }

  dispose(): void {
    this.teardown();
    this.host = null;
    this.failed = false;
    this.shocks = [];
  }

  resize(canvas: HTMLCanvasElement, quality: Settings["quality"]): CanvasRenderingContext2D | null {
    return resizeCanvas(canvas, quality);
  }

  draw(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    snap: AudioSnapshot,
    settings: Settings,
    now: number,
  ): void {
    if (threeDEnabled(settings.quality) && this.host && !this.failed) {
      if (!this.scene) {
        this.ensureScene();
        this.drawFallback(ctx, canvas, snap, settings, now);
        return;
      }
      this.scene.draw(snap, settings, now);
      return;
    }
    this.teardown();
    this.drawFallback(ctx, canvas, snap, settings, now);
  }

  private ensureScene(): void {
    if (this.loading || this.scene || !this.host) return;
    const host = this.host;
    this.loading = import("./orb3d")
      .then(({ canCreatePrismScene, createPrismScene }) => {
        if (this.host !== host) return;
        if (!canCreatePrismScene()) {
          this.failed = true;
          return;
        }
        this.scene = createPrismScene(host.root, host.canvas);
      })
      .catch(() => {
        this.failed = true;
      })
      .finally(() => {
        this.loading = null;
      });
  }

  private teardown(): void {
    this.scene?.dispose();
    this.scene = null;
    this.loading = null;
  }

  private drawFallback(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    snap: AudioSnapshot,
    settings: Settings,
    now: number,
  ): void {
    const { width, height } = canvas;
    paintBackground(ctx, width, height, settings, snap, now);

    const profile = profileFor(settings.quality);
    const total = Math.max(24, Math.min(96, Math.round(settings.barCount * profile.density)));
    const cols = Math.max(6, Math.min(16, Math.round(total / SIDES)));
    const bins = collectBars(snap, cols, now);
    const { kick, pulse } = this.transients.step(snap, settings.speed);
    const bloom = glowAmount(settings);
    const cx = width * 0.5;
    const cy = height * 0.62;
    const scale = Math.min(width, height) * 0.22;
    const rgb = paletteRgb(settings.palette, 0.5, 0.75 + snap.rms);

    if (kick > 0.16) {
      this.shocks.push({ r: 0.95, a: Math.min(0.8, 0.32 + kick) });
      if (this.shocks.length > 6) this.shocks.shift();
    }

    ctx.save();

    const faces = Array.from({ length: SIDES }, (_, s) => {
      const a = hexCorner(s);
      const b = hexCorner(s + 1);
      return { s, depth: (a.x + b.x + a.z + b.z) * 0.5 };
    }).sort((a, b) => a.depth - b.depth);

    drawGround(ctx, cx, cy, scale, rgb, snap, kick);

    for (const shock of this.shocks) {
      drawHex(ctx, cx, cy, scale, shock.r, 0, rgb, shock.a, 1.6 + kick * 3, true);
      shock.r += (0.028 + settings.speed * 0.02) * (1 + snap.rms);
      shock.a *= 0.93;
    }
    this.shocks = this.shocks.filter((item) => item.a > 0.03 && item.r < 2.6);

    if (bloom > 0.02) {
      ctx.shadowBlur = 8 + bloom * 22;
      ctx.shadowColor = paletteGlow(settings.palette);
    }

    for (const face of faces) {
      drawFace(ctx, cx, cy, scale, face.s, bins, cols, settings, snap, kick);
    }

    ctx.shadowBlur = 0;
    drawSpine(ctx, cx, cy, scale, snap, settings, now, pulse);
    drawCrown(ctx, cx, cy, scale, bins, cols, settings, snap, kick, bloom);
    drawBands(ctx, cx, cy, scale, settings, snap, pulse, kick);

    ctx.restore();
  }
}

function hexAngle(index: number): number {
  return (index / SIDES) * Math.PI * 2 - Math.PI / 6;
}

function hexCorner(index: number, radius = 1): { x: number; z: number } {
  const a = hexAngle(index);
  return { x: Math.cos(a) * radius, z: Math.sin(a) * radius };
}

function hexEdge(side: number, t: number, radius = 1): { x: number; z: number } {
  const a = hexCorner(side, radius);
  const b = hexCorner(side + 1, radius);
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

function project(cx: number, cy: number, scale: number, x: number, y: number, z: number): { x: number; y: number } {
  return {
    x: cx + (x - z) * scale * 0.92,
    y: cy - y * scale + (x + z) * scale * 0.34,
  };
}

function binAt(bins: number[], i: number, count: number, mirror: boolean): number {
  if (count <= 0) return 0;
  const clamped = Math.min(count - 1, Math.max(0, i));
  const src = mirror ? (clamped < count / 2 ? count - 1 - clamped : clamped) : clamped;
  return bins[src] ?? 0;
}

function barH(energy: number, snap: AudioSnapshot, kick: number): number {
  return 0.72 + energy * 1.45 + snap.rms * 0.14 + kick * 0.08;
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  rgb: readonly [number, number, number],
  snap: AudioSnapshot,
  kick: number,
): void {
  ctx.globalAlpha = 0.2 + snap.low * 0.2;
  ctx.fillStyle = rgba(rgb, 0.12 + snap.low * 0.1 + kick * 0.06);
  ctx.beginPath();
  for (let i = 0; i < SIDES; i += 1) {
    const p = project(cx, cy, scale, Math.cos(hexAngle(i)) * 1.15, 0, Math.sin(hexAngle(i)) * 1.15);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = rgba(rgb, 0.35);
  ctx.lineWidth = 1.2;
  for (const r of [0.7, 1.15, 1.7]) {
    drawHex(ctx, cx, cy, scale, r, 0, rgb, 0.16 + snap.low * 0.12, 1, true);
  }
  ctx.globalAlpha = 1;
}

function drawHex(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  radius: number,
  y: number,
  rgb: readonly [number, number, number],
  alpha: number,
  width: number,
  stroke: boolean,
): void {
  ctx.beginPath();
  for (let i = 0; i < SIDES; i += 1) {
    const p = project(cx, cy, scale, Math.cos(hexAngle(i)) * radius, y, Math.sin(hexAngle(i)) * radius);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  if (stroke) {
    ctx.strokeStyle = rgba(rgb, alpha);
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  side: number,
  bins: number[],
  cols: number,
  settings: Settings,
  snap: AudioSnapshot,
  kick: number,
): void {
  for (let i = 0; i < cols; i += 1) {
    const t0 = i / cols;
    const t1 = (i + 1) / cols;
    const e = binAt(bins, i, cols, settings.mirror);
    const h = barH(e, snap, kick);
    const q0 = hexEdge(side, t0);
    const q1 = hexEdge(side, t1);
    const b0 = project(cx, cy, scale, q0.x, 0, q0.z);
    const b1 = project(cx, cy, scale, q1.x, 0, q1.z);
    const tL = project(cx, cy, scale, q0.x, h, q0.z);
    const tR = project(cx, cy, scale, q1.x, h, q1.z);
    ctx.beginPath();
    ctx.moveTo(b0.x, b0.y);
    ctx.lineTo(b1.x, b1.y);
    ctx.lineTo(tR.x, tR.y);
    ctx.lineTo(tL.x, tL.y);
    ctx.closePath();
    ctx.fillStyle = paletteColor(settings.palette, (side + t0) / SIDES, 0.4 + e);
    ctx.globalAlpha = 0.38 + e * 0.55;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawCrown(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  bins: number[],
  cols: number,
  settings: Settings,
  snap: AudioSnapshot,
  kick: number,
  bloom: number,
): void {
  ctx.beginPath();
  let started = false;
  for (let s = 0; s < SIDES; s += 1) {
    for (let i = 0; i < cols; i += 1) {
      const t = i / cols;
      const q = hexEdge(s, t);
      const h = barH(binAt(bins, i, cols, settings.mirror), snap, kick);
      const p = project(cx, cy, scale, q.x, h, q.z);
      if (!started) {
        ctx.moveTo(p.x, p.y);
        started = true;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
  }
  ctx.closePath();
  if (bloom > 0.02) {
    ctx.shadowBlur = 6 + bloom * 18;
    ctx.shadowColor = paletteGlow(settings.palette);
  }
  ctx.strokeStyle = paletteColor(settings.palette, 0.8, 1);
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 1.6 + snap.peak * 2;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

function drawSpine(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  snap: AudioSnapshot,
  settings: Settings,
  now: number,
  pulse: number,
): void {
  const n = 48;
  ctx.beginPath();
  for (let i = 0; i < n; i += 1) {
    const t = n <= 1 ? 0 : i / (n - 1);
    const wave = snap.time.length ? sampleWave(snap, i, n) : 0.08 * Math.sin(now * 0.002 + t * 9);
    const p = project(cx, cy, scale, wave * (0.38 + pulse * 0.15), 0.06 + t * 1.85, 0);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = paletteColor(settings.palette, 0.7, 1);
  ctx.globalAlpha = 0.7 + snap.peak * 0.25;
  ctx.lineWidth = 1.4 + snap.peak * 3;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawBands(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  settings: Settings,
  snap: AudioSnapshot,
  pulse: number,
  kick: number,
): void {
  const rgbLow = paletteRgb(settings.palette, 0.15, 0.7);
  const rgbMid = paletteRgb(settings.palette, 0.5, 0.8);
  const rgbHigh = paletteRgb(settings.palette, 0.85, 1);
  drawHex(ctx, cx, cy, scale, 1.08 + snap.low * 0.18 + kick * 0.06, 0.12, rgbLow, 0.2 + snap.low * 0.4, 1.4, true);
  drawHex(ctx, cx, cy, scale, 0.78 + snap.mid * 0.16, 0.7 + pulse * 0.1, rgbMid, 0.18 + snap.mid * 0.4, 1.2, true);
  drawHex(ctx, cx, cy, scale, 0.48 + snap.high * 0.2, 1.25 + snap.high * 0.12, rgbHigh, 0.16 + snap.high * 0.45, 1.1, true);
}
