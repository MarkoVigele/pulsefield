import type { AudioSnapshot } from "../audio";
import type { PresetId } from "../presets";
import type { Settings } from "../settings";

export type Visualizer = {
  readonly id: PresetId;
  resize(canvas: HTMLCanvasElement, quality: Settings["quality"]): CanvasRenderingContext2D | null;
  draw(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    snap: AudioSnapshot,
    settings: Settings,
    now: number,
  ): void;
};
