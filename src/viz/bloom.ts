import type { AudioSnapshot } from "../audio";
import { paletteColor, paletteGlow } from "../palettes";
import type { PresetId } from "../presets";
import { scaledDensity } from "../quality";
import type { Settings } from "../settings";
import {
  Envelope,
  TransientTracker,
  collectBars,
  glowAmount,
  paintBackground,
  resizeCanvas,
  roundRect,
} from "./shared";
import type { Visualizer } from "./types";

export class BloomGrid implements Visualizer {
  readonly id: PresetId = "bloom";
  private envelope = new Envelope();
  private transients = new TransientTracker();
  private ripple = 0;

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

    const cells = scaledDensity(settings.barCount, settings.quality, 12, 140);
    const aspect = width / Math.max(1, height);
    const cols = Math.max(4, Math.round(Math.sqrt(cells * aspect)));
    const rows = Math.max(3, Math.round(cells / cols));
    const values = this.envelope.step(collectBars(snap, cols, now), settings);
    const { kick, pulse } = this.transients.step(snap, settings.speed);
    if (kick > 0.14) this.ripple = Math.min(1, this.ripple + kick);
    this.ripple *= 0.9;

    const padX = width * 0.06;
    const padY = height * 0.14;
    const gridW = width - padX * 2;
    const gridH = height - padY * 2;
    const cw = gridW / cols;
    const ch = gridH / rows;
    const bloom = glowAmount(settings);
    const cx = width * 0.5;
    const cy = height * 0.52;

    ctx.save();
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const src = settings.mirror ? (x < cols / 2 ? cols - 1 - x : x) : x;
        const mapped = Math.min(values.length - 1, Math.floor((src / cols) * values.length));
        const bin = values[mapped] ?? 0;
        const rowT = rows <= 1 ? 0 : y / (rows - 1);
        const rowWeight = 0.55 + 0.45 * (1 - Math.abs(rowT - (1 - snap.low)));
        const dx = padX + x * cw + cw / 2 - cx;
        const dy = padY + y * ch + ch / 2 - cy;
        const dist = Math.hypot(dx, dy) / (Math.min(width, height) * 0.55);
        const wave = Math.max(0, this.ripple - dist * 0.85);
        const e = Math.min(1, bin * rowWeight + pulse * 0.15 + wave * 0.55 + snap.high * (1 - rowT) * 0.2);
        const inset = Math.min(cw, ch) * (0.18 - e * 0.08);
        const rx = padX + x * cw + inset;
        const ry = padY + y * ch + inset;
        const rw = Math.max(2, cw - inset * 2);
        const rh = Math.max(2, ch - inset * 2);
        const scale = 0.72 + e * 0.38 + kick * 0.08;
        const cxCell = rx + rw / 2;
        const cyCell = ry + rh / 2;
        const tw = rw * scale;
        const th = rh * scale;
        const t = cols <= 1 ? 0 : x / (cols - 1);

        if (bloom > 0.02 && e > 0.12 && settings.quality !== "low") {
          ctx.shadowBlur = 4 + bloom * 26 * e;
          ctx.shadowColor = paletteGlow(settings.palette);
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.fillStyle = paletteColor(settings.palette, t, 0.3 + e);
        ctx.globalAlpha = 0.22 + e * 0.75;
        roundRect(ctx, cxCell - tw / 2, cyCell - th / 2, tw, th, Math.min(tw, th) * 0.22);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
