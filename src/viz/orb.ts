import type { AudioSnapshot } from "../audio";
import { paletteColor, paletteGlow, paletteRgb, rgba } from "../palettes";
import type { PresetId } from "../presets";
import { threeDEnabled } from "../quality";
import type { Settings } from "../settings";
import {
  Envelope,
  TransientTracker,
  collectBars,
  glowAmount,
  paintBackground,
  resizeCanvas,
} from "./shared";
import type { OrbScene } from "./orb3d";
import type { Visualizer, VisualizerHost } from "./types";

export class LightIsland implements Visualizer {
  readonly id: PresetId = "orb";
  private host: VisualizerHost | null = null;
  private scene: OrbScene | null = null;
  private loading: Promise<void> | null = null;
  private failed = false;
  private envelope = new Envelope();
  private transients = new TransientTracker();

  mount(host: VisualizerHost): void {
    this.host = host;
  }

  dispose(): void {
    this.teardown();
    this.host = null;
    this.failed = false;
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
      .then(({ canCreateOrbScene, createOrbScene }) => {
        if (this.host !== host) return;
        if (!canCreateOrbScene()) {
          this.failed = true;
          return;
        }
        this.scene = createOrbScene(host.root, host.canvas);
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

    const values = this.envelope.step(collectBars(snap, 28, now), settings);
    const { kick, pulse } = this.transients.step(snap, settings.speed);
    const bloom = glowAmount(settings);
    const cx = width * 0.5;
    const cy = height * 0.44;
    const islandY = height * 0.7;
    const maxR = Math.min(width, height);
    const radius = maxR * (0.15 + snap.rms * 0.05 + kick * 0.03);
    const rgb = paletteRgb(settings.palette, 0.55, 0.7 + snap.rms);

    ctx.save();

    const island = ctx.createRadialGradient(cx, islandY, 8, cx, islandY, maxR * 0.42);
    island.addColorStop(0, rgba(rgb, 0.22 + snap.low * 0.28 + kick * 0.15));
    island.addColorStop(0.45, rgba(rgb, 0.08));
    island.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = island;
    ctx.beginPath();
    ctx.ellipse(cx, islandY, maxR * (0.34 + snap.low * 0.05), maxR * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = paletteGlow(settings.palette);
    ctx.globalAlpha = 0.22 + snap.low * 0.35 + kick * 0.2;
    ctx.lineWidth = 2 + kick * 4;
    ctx.beginPath();
    ctx.ellipse(cx, islandY, maxR * (0.3 + kick * 0.04), maxR * 0.055, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const reflection = ctx.createRadialGradient(cx, islandY - 6, 4, cx, islandY, radius * 1.4);
    reflection.addColorStop(0, rgba(rgb, 0.18 + pulse * 0.12));
    reflection.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = reflection;
    ctx.beginPath();
    ctx.ellipse(cx, islandY - 4, radius * 0.95, radius * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    if (bloom > 0.02) {
      ctx.shadowBlur = 18 + bloom * 46;
      ctx.shadowColor = paletteGlow(settings.palette);
    }
    const body = ctx.createRadialGradient(cx - radius * 0.25, cy - radius * 0.3, radius * 0.08, cx, cy, radius);
    body.addColorStop(0, paletteColor(settings.palette, 0.85, 1));
    body.addColorStop(0.45, paletteColor(settings.palette, 0.5, 0.75 + snap.rms));
    body.addColorStop(1, rgba(rgb, 0.05));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.beginPath();
    ctx.ellipse(cx - radius * 0.28, cy - radius * 0.32, radius * 0.18, radius * 0.1, -0.4, 0, Math.PI * 2);
    ctx.fill();

    const span = settings.mirror ? Math.PI * 2 : Math.PI * 1.5;
    const start = settings.mirror ? 0 : -Math.PI * 0.75;
    for (let i = 0; i < values.length; i += 1) {
      const v = values[i] ?? 0;
      if (v < 0.06) continue;
      const t = values.length <= 1 ? 0 : i / (values.length - 1);
      const a = start + t * span;
      const inner = radius * (0.72 + pulse * 0.04);
      const outer = inner + v * radius * 0.85;
      ctx.strokeStyle = paletteColor(settings.palette, t, 0.4 + v);
      ctx.globalAlpha = 0.18 + v * 0.45;
      ctx.lineWidth = 1.4 + v * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner * 0.92);
      ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer * 0.92);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }
}
