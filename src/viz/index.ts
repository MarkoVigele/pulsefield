import type { PresetId } from "../presets";
import { BarsClassic } from "./bars";
import { BloomGrid } from "./bloom";
import { ParticleField } from "./particles";
import { WaveformRibbon } from "./ribbon";
import { RingRadial } from "./ring";
import type { Visualizer } from "./types";

export type { Visualizer } from "./types";

export function createVisualizer(id: PresetId): Visualizer {
  switch (id) {
    case "ring":
      return new RingRadial();
    case "ribbon":
      return new WaveformRibbon();
    case "particles":
      return new ParticleField();
    case "bloom":
      return new BloomGrid();
    default:
      return new BarsClassic();
  }
}
