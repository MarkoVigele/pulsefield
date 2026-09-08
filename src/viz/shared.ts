import type { AudioSnapshot } from "../audio";
import { paletteGlow } from "../palettes";
import { bloomScaleFor, pixelRatioFor } from "../quality";
import type { Settings } from "../settings";

type CanvasBox = { w: number; h: number };
const boxCache = new WeakMap<HTMLCanvasElement, CanvasBox>();
const boxWatch = new WeakSet<HTMLCanvasElement>();

function readBox(canvas: HTMLCanvasElement): CanvasBox {
  const cached = boxCache.get(canvas);
  if (cached && cached.w > 0 && cached.h > 0) return cached;
  const rect = canvas.getBoundingClientRect();
  const box = { w: rect.width, h: rect.height };
  boxCache.set(canvas, box);
  return box;
}

function watchBox(canvas: HTMLCanvasElement): void {
  if (boxWatch.has(canvas) || typeof ResizeObserver === "undefined") return;
  boxWatch.add(canvas);
  const ro = new ResizeObserver((entries) => {
    const cr = entries[0]?.contentRect;
    if (!cr) return;
    boxCache.set(canvas, { w: cr.width, h: cr.height });
  });
  ro.observe(canvas);
}

export function resizeCanvas(
  canvas: HTMLCanvasElement,
  quality: Settings["quality"],
): CanvasRenderingContext2D | null {
  const dpr = pixelRatioFor(quality);
  if (typeof ResizeObserver === "undefined") {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return canvas.getContext("2d");
  }
  watchBox(canvas);
  const box = readBox(canvas);
  const w = Math.max(1, Math.floor(box.w * dpr));
  const h = Math.max(1, Math.floor(box.h * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return canvas.getContext("2d");
}

export class Envelope {
  smoothed: number[] = [];
  peaks: number[] = [];

  step(next: number[], settings: Settings): number[] {
    const n = next.length;
    if (this.smoothed.length !== n) {
      this.smoothed = next.slice();
      this.peaks = next.slice();
    }
    const attack = Math.min(1, 0.45 * settings.speed);
    const release = Math.min(1, 0.08 * settings.speed);
    const peakFall = 0.008 * settings.speed;
    for (let i = 0; i < n; i += 1) {
      const target = next[i] ?? 0;
      const prev = this.smoothed[i] ?? 0;
      const k = target > prev ? attack : release;
      const value = prev + (target - prev) * k;
      this.smoothed[i] = value;
      const peak = this.peaks[i] ?? 0;
      this.peaks[i] = target > peak ? target : Math.max(0, peak - peakFall);
    }
    return this.smoothed;
  }
}

export class TransientTracker {
  private prevRms = 0;
  private prevPeak = 0;
  private prevLow = 0;
  pulse = 0;
  kick = 0;

  step(snap: AudioSnapshot, speed: number): { pulse: number; kick: number } {
    const dRms = Math.max(0, snap.rms - this.prevRms);
    const dPeak = Math.max(0, snap.peak - this.prevPeak);
    const dLow = Math.max(0, snap.low - this.prevLow);
    const hit = dRms * 2.1 + dPeak * 1.5 + dLow * 1.8;
    this.kick = Math.max(this.kick * (0.8 - 0.06 * speed), hit);
    this.pulse = Math.max(this.pulse * (0.86 - 0.04 * speed), dRms * 1.6 + snap.rms * 0.12);
    this.prevRms = snap.rms;
    this.prevPeak = snap.peak;
    this.prevLow = snap.low;
    return { pulse: this.pulse, kick: this.kick };
  }
}

export function collectBars(snap: AudioSnapshot, barCount: number, now: number): number[] {
  const freq = snap.frequency;
  const count = Math.max(8, barCount);
  const out = new Array<number>(count).fill(0);
  const nyquist = snap.sampleRate / 2;
  const minHz = 32;
  const maxHz = Math.min(16000, nyquist);
  const hasSignal = freq.length > 0;

  for (let i = 0; i < count; i += 1) {
    const breath = 0.05 + 0.04 * Math.abs(Math.sin(now / 700 + i * 0.35));
    if (!hasSignal) {
      out[i] = breath;
      continue;
    }
    const t0 = i / count;
    const t1 = (i + 1) / count;
    const f0 = minHz * (maxHz / minHz) ** t0;
    const f1 = minHz * (maxHz / minHz) ** t1;
    const i0 = Math.floor((f0 / nyquist) * freq.length);
    const i1 = Math.max(i0 + 1, Math.floor((f1 / nyquist) * freq.length));
    let sum = 0;
    let n = 0;
    for (let b = i0; b < i1 && b < freq.length; b += 1) {
      sum += freq[b] ?? 0;
      n += 1;
    }
    const raw = n ? sum / n / 255 : 0;
    out[i] = Math.min(1, 0.03 + raw);
  }
  return out;
}

export function paintBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  settings: Settings,
  snap: AudioSnapshot,
  now: number,
): void {
  const pulse = 0.04 + snap.rms * 0.22 * settings.sensitivity;
  if (settings.background === "void") {
    ctx.fillStyle = "#05060a";
    ctx.fillRect(0, 0, width, height);
  } else if (settings.background === "lab") {
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, "#0b1018");
    g.addColorStop(1, "#05070c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  } else if (settings.background === "dusk") {
    const g = ctx.createRadialGradient(
      width * 0.5,
      height * 0.35,
      20,
      width * 0.5,
      height * 0.4,
      height * 0.8,
    );
    g.addColorStop(0, `rgba(48, 22, 64, ${0.35 + pulse})`);
    g.addColorStop(1, "#06050a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.fillStyle = "#07090f";
    ctx.fillRect(0, 0, width, height);
  }

  if (settings.background === "grid" || settings.background === "lab") {
    ctx.save();
    ctx.strokeStyle = `rgba(90, 120, 140, ${0.08 + pulse * 0.15})`;
    ctx.lineWidth = 1;
    const step = Math.max(24, Math.floor(width / 18));
    const drift = ((now * 0.02 * settings.speed) % step) - step;
    for (let x = drift; x < width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  const veil = ctx.createRadialGradient(
    width / 2,
    height * 0.55,
    height * 0.1,
    width / 2,
    height * 0.55,
    height * 0.85,
  );
  veil.addColorStop(0, "rgba(0,0,0,0)");
  veil.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, width, height);
}

export function paintFloor(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  baseline: number,
  settings: Settings,
  snap: AudioSnapshot,
): void {
  const glow = paletteGlow(settings.palette);
  ctx.save();
  ctx.strokeStyle = glow;
  ctx.globalAlpha = 0.18 + snap.low * 0.35;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, baseline + 1);
  ctx.lineTo(width, baseline + 1);
  ctx.stroke();

  const fade = ctx.createLinearGradient(0, baseline, 0, height);
  fade.addColorStop(0, "rgba(255,255,255,0.04)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, baseline, width, height - baseline);
  ctx.restore();
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x, y, radius);
  ctx.closePath();
}

export function glowAmount(settings: Settings): number {
  return settings.bloom * bloomScaleFor(settings.quality);
}

export function sampleWave(snap: AudioSnapshot, index: number, count: number): number {
  const wave = snap.time;
  if (wave.length === 0 || count <= 0) return 0;
  const t = count <= 1 ? 0 : index / (count - 1);
  const pos = t * (wave.length - 1);
  const i0 = Math.floor(pos);
  const i1 = Math.min(wave.length - 1, i0 + 1);
  const frac = pos - i0;
  const a = ((wave[i0] ?? 128) - 128) / 128;
  const b = ((wave[i1] ?? 128) - 128) / 128;
  return a + (b - a) * frac;
}
