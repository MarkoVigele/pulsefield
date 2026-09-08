import type { AudioSnapshot } from "./audio";
import { paletteColor, paletteGlow } from "./palettes";
import { bloomScaleFor, pixelRatioFor } from "./quality";
import type { Settings } from "./settings";

export class BarsClassic {
  private smoothed: number[] = [];
  private peaks: number[] = [];

  resize(canvas: HTMLCanvasElement, quality: Settings["quality"]): CanvasRenderingContext2D | null {
    const dpr = pixelRatioFor(quality);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return canvas.getContext("2d");
  }

  draw(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    snap: AudioSnapshot,
    settings: Settings,
    now: number,
  ): void {
    const { width, height } = canvas;
    this.paintBackground(ctx, width, height, settings, snap, now);

    const values = this.envelope(collectBars(snap, settings.barCount, now), settings);
    const count = values.length;
    if (count === 0) return;

    const columns = settings.mirror ? count * 2 : count;
    const gap = Math.max(1, width / columns / 8);
    const barW = Math.max(2, width / columns - gap);
    const baseline = height * 0.78;
    const maxH = height * 0.62;
    const bloom = settings.bloom * bloomScaleFor(settings.quality);

    ctx.save();
    ctx.lineCap = "round";

    for (let i = 0; i < columns; i += 1) {
      const src = settings.mirror
        ? i < count
          ? count - 1 - i
          : i - count
        : i;
      const v = values[src] ?? 0;
      const hold = this.peaks[src] ?? v;
      const x = i * (barW + gap) + gap * 0.5;
      const h = Math.max(2, v * maxH);
      const y = baseline - h;
      const t = count <= 1 ? 0 : (src ?? 0) / (count - 1);
      const color = paletteColor(settings.palette, t, 0.45 + v);

      if (bloom > 0.02) {
        ctx.shadowBlur = 6 + bloom * 28 * (0.35 + v);
        ctx.shadowColor = paletteGlow(settings.palette);
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.fillStyle = color;
      roundRect(ctx, x, y, barW, h, Math.min(barW / 2, 4));
      ctx.fill();

      const capY = baseline - hold * maxH - 3;
      ctx.shadowBlur = bloom * 12;
      ctx.fillStyle = paletteColor(settings.palette, t, 1);
      ctx.fillRect(x, capY, barW, 2);
    }

    ctx.restore();
    this.paintFloor(ctx, width, height, baseline, settings, snap);
  }

  private envelope(next: number[], settings: Settings): number[] {
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

  private paintBackground(
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

  private paintFloor(
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
}

function collectBars(snap: AudioSnapshot, barCount: number, now: number): number[] {
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

function roundRect(
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
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
