import type { AudioSnapshot } from "../audio";
import type { PresetId } from "../presets";
import type { Settings } from "../settings";

export type VisualizerHost = {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
};

export type Visualizer = {
  readonly id: PresetId;
  mount?(host: VisualizerHost): void;
  dispose?(): void;
  resize(canvas: HTMLCanvasElement, quality: Settings["quality"]): CanvasRenderingContext2D | null;
  draw(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    snap: AudioSnapshot,
    settings: Settings,
    now: number,
  ): void;
};
