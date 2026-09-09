import type { AudioSnapshot } from "../audio";
import { paletteColor, paletteGlow, paletteRgb, rgba } from "../palettes";
import type { PresetId } from "../presets";
import { particleBudget, profileFor } from "../quality";
import type { Settings } from "../settings";
import { TransientTracker, collectBars, glowAmount, paintBackground, resizeCanvas } from "./shared";
import type { Visualizer } from "./types";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  t: number;
  band: number;
};

function dead(): Particle {
  return { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, t: 0, band: 0 };
}

export class ParticleField implements Visualizer {
  readonly id: PresetId = "particles";
  private pool: Particle[] = [];
  private transients = new TransientTracker();

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

    const budget = particleBudget(settings.barCount, settings.quality);
    while (this.pool.length < budget) this.pool.push(dead());
    const { kick, pulse } = this.transients.step(snap, settings.speed);
    const bloom = glowAmount(settings);
    const bins = collectBars(snap, 24, now);
    const cx = width * 0.5;
    const cy = height * 0.52;

    const spawn = Math.min(
      18,
      1 + Math.floor(snap.rms * 10 + kick * 22 + pulse * 6),
    );
    for (let s = 0; s < spawn; s += 1) {
      const slot = this.pool.find((p) => p.life <= 0) ?? this.pool[Math.floor(Math.random() * budget)];
      if (!slot) continue;
      const bin = Math.floor(Math.random() * bins.length);
      const energy = bins[bin] ?? 0.05;
      const angle = Math.random() * Math.PI * 2;
      const burst = kick > 0.12;
      const radius = burst ? Math.random() * 24 : Math.random() * Math.min(width, height) * 0.18;
      const side = settings.mirror && Math.random() < 0.5 ? -1 : 1;
      slot.x = cx + Math.cos(angle) * radius * side;
      slot.y = cy + Math.sin(angle) * radius * 0.7;
      const speed = (0.4 + energy * 3.2 + kick * 4.5) * settings.speed;
      slot.vx = Math.cos(angle) * speed * side;
      slot.vy = Math.sin(angle) * speed - snap.low * 0.8;
      slot.max = 28 + energy * 50 + (burst ? 18 : 0);
      slot.life = slot.max;
      slot.size = 1.2 + energy * 5 + snap.low * 3;
      slot.t = (bin + 0.5) / bins.length;
      slot.band = energy;
    }

    ctx.save();
    if (bloom > 0.05 && profileFor(settings.quality).shadows) {
      ctx.shadowBlur = 6 + bloom * 16;
      ctx.shadowColor = paletteGlow(settings.palette);
    }

    for (let i = 0; i < budget; i += 1) {
      const p = this.pool[i];
      if (!p || p.life <= 0) continue;

      const attract = 0.0008 * settings.speed;
      p.vx += (cx - p.x) * attract * (0.4 - snap.low);
      p.vy += (cy - p.y) * attract * 0.5;
      p.vx *= 0.985;
      p.vy *= 0.985;
      if (kick > 0.1) {
        p.vx += (p.x - cx) * 0.004 * kick;
        p.vy += (p.y - cy) * 0.004 * kick;
      }
      p.x += p.vx * (1.2 + settings.speed * 0.6);
      p.y += p.vy * (1.2 + settings.speed * 0.6);
      p.life -= 1;

      if (p.x < -20 || p.x > width + 20 || p.y < -20 || p.y > height + 20) {
        p.life = 0;
        continue;
      }

      const age = p.life / p.max;
      const rgb = paletteRgb(settings.palette, p.t, 0.55 + p.band);
      ctx.fillStyle = rgba(rgb, 0.15 + age * 0.75);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.6 + age * 0.6 + kick * 0.3), 0, Math.PI * 2);
      ctx.fill();

      if (settings.quality === "high" && p.band > 0.35) {
        ctx.fillStyle = paletteColor(settings.palette, p.t, 1);
        ctx.globalAlpha = age * 0.5;
        ctx.fillRect(p.x - 0.6, p.y - 0.6, 1.2, 1.2);
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();
  }
}
