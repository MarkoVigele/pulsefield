import { isMobileLab } from "./quality";
import type { BackgroundId, FftSize, PaletteId, Settings } from "./settings";

export const PRESETS = ["bars", "ring", "ribbon", "particles", "bloom", "orb"] as const;
export type PresetId = (typeof PRESETS)[number];

export type Tune = {
  sensitivity: number;
  smoothing: number;
  fftSize: FftSize;
  palette: PaletteId;
  bloom: number;
  barCount: number;
  mirror: boolean;
  speed: number;
  background: BackgroundId;
};

export const PRESET_LABEL: Record<PresetId, string> = {
  bars: "Bars Classic",
  ring: "Radialring",
  ribbon: "Wellenband",
  particles: "Partikelfeld",
  bloom: "Bloomraster",
  orb: "Lichtinsel",
};

export const PRESET_HINT: Record<PresetId, string> = {
  bars: "Spektrum als Balken",
  ring: "Ringe und Speichen",
  ribbon: "Zeitwelle als Band",
  particles: "Schwarm aus Transienten",
  bloom: "Leuchtendes Zellenraster",
  orb: "Weiche 3D-Kugel",
};

export const DENSITY_LABEL: Record<PresetId, string> = {
  bars: "Balken",
  ring: "Speichen",
  ribbon: "Segmente",
  particles: "Partikel",
  bloom: "Zellen",
  orb: "Facetten",
};

export const TUNE_KEYS = [
  "sensitivity",
  "smoothing",
  "fftSize",
  "palette",
  "bloom",
  "barCount",
  "mirror",
  "speed",
  "background",
] as const satisfies readonly (keyof Tune)[];

export function isPreset(value: unknown): value is PresetId {
  return typeof value === "string" && (PRESETS as readonly string[]).includes(value);
}

export function pickTune(settings: Settings): Tune {
  return {
    sensitivity: settings.sensitivity,
    smoothing: settings.smoothing,
    fftSize: settings.fftSize,
    palette: settings.palette,
    bloom: settings.bloom,
    barCount: settings.barCount,
    mirror: settings.mirror,
    speed: settings.speed,
    background: settings.background,
  };
}

export function tuneEquals(a: Tune, b: Tune): boolean {
  return TUNE_KEYS.every((key) => a[key] === b[key]);
}

export function presetDefaults(preset: PresetId, mobile = isMobileLab()): Tune {
  const shared = {
    sensitivity: mobile ? 1.35 : 1.2,
    smoothing: 0.72,
    fftSize: (mobile ? 1024 : 2048) as FftSize,
    bloom: mobile ? 0.28 : 0.55,
    barCount: mobile ? 32 : 64,
    mirror: false,
    speed: 1,
    background: "lab" as BackgroundId,
    palette: "signal" as PaletteId,
  };

  switch (preset) {
    case "ring":
      return {
        ...shared,
        palette: "plasma",
        bloom: mobile ? 0.4 : 0.7,
        barCount: mobile ? 40 : 72,
        mirror: true,
        speed: 0.9,
        background: "void",
        sensitivity: mobile ? 1.4 : 1.3,
        smoothing: 0.68,
      };
    case "ribbon":
      return {
        ...shared,
        palette: "chlorophyll",
        bloom: mobile ? 0.25 : 0.45,
        barCount: mobile ? 24 : 48,
        speed: 1.15,
        background: "dusk",
        sensitivity: mobile ? 1.25 : 1.15,
        smoothing: 0.55,
      };
    case "particles":
      return {
        ...shared,
        palette: "ember",
        bloom: mobile ? 0.3 : 0.6,
        barCount: mobile ? 40 : 80,
        speed: 1.2,
        background: "void",
        sensitivity: mobile ? 1.5 : 1.4,
        smoothing: 0.6,
        fftSize: 1024,
      };
    case "bloom":
      return {
        ...shared,
        palette: "signal",
        bloom: mobile ? 0.5 : 0.85,
        barCount: mobile ? 24 : 48,
        speed: 0.85,
        background: "grid",
        sensitivity: mobile ? 1.35 : 1.25,
        smoothing: 0.75,
      };
    case "orb":
      return {
        ...shared,
        palette: "plasma",
        bloom: mobile ? 0.45 : 0.8,
        barCount: mobile ? 36 : 64,
        speed: 0.8,
        background: "void",
        sensitivity: mobile ? 1.4 : 1.25,
        smoothing: 0.7,
      };
    default:
      return shared;
  }
}
