import type { AudioSnapshot } from "../audio";
import { paletteColor, paletteGlow } from "../palettes";
import type { PresetId } from "../presets";
import { scaledDensity } from "../quality";
import type { Settings } from "../settings";
import { Envelope, TransientTracker, collectBars, glowAmount, paintBackground, resizeCanvas } from "./shared";
import type { Visualizer } from "./types";

type Shock = { r: number; a: number };

export class RingRadial implements Visualizer {
  readonly id: PresetId = "ring";
  private envelope = new Envelope();
  private transients = new TransientTracker();
  private shocks: Shock[] = [];

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

    const count = scaledDensity(settings.barCount, settings.quality, 16, 160);
    const values = this.envelope.step(collectBars(snap, count, now), settings);
    const { kick, pulse } = this.transients.step(snap, settings.speed);
    const bloom = glowAmount(settings);
    const cx = width * 0.5;
    const cy = height * 0.52;
    const maxR = Math.min(width, height) * 0.42;
    const inner = maxR * (0.16 + snap.low * 0.08 + kick * 0.06);
    const spin = (now * 0.00012 * settings.speed + snap.mid * 0.4) % (Math.PI * 2);

    if (kick > 0.16) {
      this.shocks.push({ r: inner + 8, a: Math.min(0.85, 0.35 + kick) });
      if (this.shocks.length > 8) this.shocks.shift();
    }

    ctx.save();
    ctx.translate(cx, cy);

    ctx.beginPath();
    ctx.arc(0, 0, inner * (0.72 + snap.rms * 0.35), 0, Math.PI * 2);
    ctx.fillStyle = paletteColor(settings.palette, 0.15, 0.35 + snap.rms);
    ctx.globalAlpha = 0.28 + snap.rms * 0.35;
    if (bloom > 0.02) {
      ctx.shadowBlur = 10 + bloom * 36 * (0.4 + kick);
      ctx.shadowColor = paletteGlow(settings.palette);
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    const bands = [
      { t: 0.2, e: snap.low, w: 5 },
      { t: 0.55, e: snap.mid, w: 3.5 },
      { t: 0.85, e: snap.high, w: 2.2 },
    ];
    for (const band of bands) {
      const r = inner + (maxR - inner) * (0.18 + band.t * 0.7) + band.e * 10 + pulse * 8;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = paletteColor(settings.palette, band.t, 0.5 + band.e);
      ctx.globalAlpha = 0.22 + band.e * 0.55 + kick * 0.2;
      ctx.lineWidth = band.w + band.e * 6 + kick * 4;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const span = settings.mirror ? Math.PI * 2 : Math.PI * 1.35;
    const start = settings.mirror ? -Math.PI / 2 + spin * 0.15 : -Math.PI * 0.67 + spin * 0.1;
    const spokeW = Math.max(2, (span * maxR) / values.length / 2.1);

    for (let i = 0; i < values.length; i += 1) {
      const v = values[i] ?? 0;
      const t = values.length <= 1 ? 0 : i / (values.length - 1);
      const angle = start + (i + 0.5) * (span / values.length);
      const len = inner + v * (maxR - inner);
      ctx.save();
      ctx.rotate(angle);
      if (bloom > 0.02) {
        ctx.shadowBlur = 4 + bloom * 22 * v;
        ctx.shadowColor = paletteGlow(settings.palette);
      }
      ctx.strokeStyle = paletteColor(settings.palette, t, 0.45 + v);
      ctx.lineWidth = spokeW;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(inner, 0);
      ctx.lineTo(len, 0);
      ctx.stroke();
      ctx.restore();
    }

    for (const shock of this.shocks) {
      ctx.beginPath();
      ctx.arc(0, 0, shock.r, 0, Math.PI * 2);
      ctx.strokeStyle = paletteGlow(settings.palette);
      ctx.globalAlpha = shock.a;
      ctx.lineWidth = 2 + kick * 6;
      ctx.stroke();
      shock.r += (2.8 + settings.speed * 2.2) * (1 + snap.rms);
      shock.a *= 0.94;
    }
    this.shocks = this.shocks.filter((s) => s.a > 0.03 && s.r < maxR * 1.7);

    ctx.restore();
  }
}
