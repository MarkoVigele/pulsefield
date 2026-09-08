import type { AudioSnapshot } from "../audio";
import { paletteColor, paletteGlow } from "../palettes";
import type { PresetId } from "../presets";
import { scaledDensity } from "../quality";
import type { Settings } from "../settings";
import {
  Envelope,
  collectBars,
  glowAmount,
  paintBackground,
  paintFloor,
  resizeCanvas,
  roundRect,
} from "./shared";
import type { Visualizer } from "./types";

export class BarsClassic implements Visualizer {
  readonly id: PresetId = "bars";
  private envelope = new Envelope();

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

    const count = scaledDensity(settings.barCount, settings.quality, 8, 160);
    const values = this.envelope.step(collectBars(snap, count, now), settings);
    if (values.length === 0) return;

    const columns = settings.mirror ? values.length * 2 : values.length;
    const gap = Math.max(1, width / columns / 8);
    const barW = Math.max(2, width / columns - gap);
    const baseline = height * 0.78;
    const maxH = height * 0.62;
    const bloom = glowAmount(settings);

    ctx.save();
    ctx.lineCap = "round";

    for (let i = 0; i < columns; i += 1) {
      const src = settings.mirror
        ? i < values.length
          ? values.length - 1 - i
          : i - values.length
        : i;
      const v = values[src] ?? 0;
      const hold = this.envelope.peaks[src] ?? v;
      const x = i * (barW + gap) + gap * 0.5;
      const h = Math.max(2, v * maxH);
      const y = baseline - h;
      const t = values.length <= 1 ? 0 : (src ?? 0) / (values.length - 1);
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
    paintFloor(ctx, width, height, baseline, settings, snap);
  }
}
