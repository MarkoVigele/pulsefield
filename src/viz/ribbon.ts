import type { AudioSnapshot } from "../audio";
import { paletteColor, paletteGlow, paletteRgb, rgba } from "../palettes";
import type { PresetId } from "../presets";
import { profileFor, scaledDensity } from "../quality";
import type { Settings } from "../settings";
import { TransientTracker, glowAmount, paintBackground, resizeCanvas, sampleWave } from "./shared";
import type { Visualizer } from "./types";

export class WaveformRibbon implements Visualizer {
  readonly id: PresetId = "ribbon";
  private transients = new TransientTracker();
  private trails: number[][] = [];

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
    const { width, height } = canvas;
    paintBackground(ctx, width, height, settings, snap, now);

    const points = scaledDensity(Math.max(24, settings.barCount * 2), settings.quality, 24, 220);
    const { kick, pulse } = this.transients.step(snap, settings.speed);
    const bloom = glowAmount(settings);
    const midY = height * 0.52;
    const amp = height * (0.16 + snap.rms * 0.22 + kick * 0.12);
    const breath = 0.04 * Math.sin(now / 640);

    const samples = new Array<number>(points);
    for (let i = 0; i < points; i += 1) {
      const wave = sampleWave(snap, i, points);
      const idle = breath * Math.sin((i / points) * Math.PI * 4 + now / 500);
      samples[i] = snap.time.length ? wave : idle;
    }

    const trailDepth = profileFor(settings.quality).trails;
    this.trails.unshift(samples);
    if (this.trails.length > trailDepth) this.trails.length = trailDepth;

    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    for (let t = this.trails.length - 1; t >= 0; t -= 1) {
      const row = this.trails[t];
      if (!row) continue;
      const fade = 1 - t / trailDepth;
      const lift = t * height * 0.028;
      const scale = 1 - t * 0.07;
      drawRibbon(ctx, row, width, midY - lift, amp * scale, settings, fade * (0.22 + pulse * 0.15), bloom * 0.45, true);
    }

    const thick = 2.2 + snap.peak * 16 + kick * 18;
    drawRibbon(ctx, samples, width, midY, amp, settings, 0.92, bloom, false, thick);

    if (settings.mirror) {
      drawRibbon(ctx, samples, width, midY, -amp * 0.72, settings, 0.45, bloom * 0.6, false, thick * 0.7);
    }

    ctx.restore();
  }
}

function drawRibbon(
  ctx: CanvasRenderingContext2D,
  samples: number[],
  width: number,
  midY: number,
  amp: number,
  settings: Settings,
  alpha: number,
  bloom: number,
  ghost: boolean,
  strokeW = 2,
): void {
  const n = samples.length;
  if (n < 2) return;

  const upper: { x: number; y: number }[] = [];
  const lower: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * width;
    const s = samples[i] ?? 0;
    const half = (0.55 + Math.abs(s) * 0.9) * Math.abs(amp) * 0.18 + strokeW;
    const y = midY - s * amp;
    upper.push({ x, y: y - half });
    lower.push({ x, y: y + half });
  }

  ctx.beginPath();
  const first = upper[0];
  if (!first) return;
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < upper.length; i += 1) {
    const p = upper[i];
    const prev = upper[i - 1];
    if (!p || !prev) continue;
    const cx = (prev.x + p.x) / 2;
    ctx.quadraticCurveTo(prev.x, prev.y, cx, (prev.y + p.y) / 2);
  }
  for (let i = lower.length - 1; i >= 0; i -= 1) {
    const p = lower[i];
    if (!p) continue;
    const next = lower[i - 1] ?? p;
    const cx = (p.x + next.x) / 2;
    ctx.quadraticCurveTo(p.x, p.y, cx, (p.y + next.y) / 2);
  }
  ctx.closePath();

  const rgb = paletteRgb(settings.palette, 0.45, 0.8);
  ctx.fillStyle = rgba(rgb, ghost ? alpha * 0.35 : alpha * 0.22);
  if (bloom > 0.02 && !ghost) {
    ctx.shadowBlur = 8 + bloom * 28;
    ctx.shadowColor = paletteGlow(settings.palette);
  }
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.beginPath();
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * width;
    const y = midY - (samples[i] ?? 0) * amp;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = ghost
    ? paletteColor(settings.palette, 0.4, 0.5)
    : paletteColor(settings.palette, 0.65, 1);
  ctx.globalAlpha = alpha;
  ctx.lineWidth = ghost ? 1.2 : strokeW;
  ctx.stroke();
  ctx.globalAlpha = 1;
}
