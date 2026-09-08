import { isMobileLab, type Quality } from "./quality";

export const FFT_SIZES = [256, 512, 1024, 2048, 4096] as const;
export type FftSize = (typeof FFT_SIZES)[number];

export const PALETTES = ["signal", "ember", "chlorophyll", "plasma", "mono"] as const;
export type PaletteId = (typeof PALETTES)[number];

export const BACKGROUNDS = ["void", "lab", "grid", "dusk"] as const;
export type BackgroundId = (typeof BACKGROUNDS)[number];

export type Settings = {
  sensitivity: number;
  smoothing: number;
  fftSize: FftSize;
  palette: PaletteId;
  bloom: number;
  barCount: number;
  mirror: boolean;
  speed: number;
  background: BackgroundId;
  quality: Quality;
};

export const STORAGE_KEY = "pulsefield.settings.v1";

export function defaultSettings(mobile = isMobileLab()): Settings {
  return {
    sensitivity: mobile ? 1.35 : 1.2,
    smoothing: 0.72,
    fftSize: mobile ? 1024 : 2048,
    palette: "signal",
    bloom: mobile ? 0.28 : 0.55,
    barCount: mobile ? 32 : 64,
    mirror: false,
    speed: 1,
    background: "lab",
    quality: mobile ? "low" : "medium",
  };
}

function isFftSize(value: unknown): value is FftSize {
  return typeof value === "number" && (FFT_SIZES as readonly number[]).includes(value);
}

function isPalette(value: unknown): value is PaletteId {
  return typeof value === "string" && (PALETTES as readonly string[]).includes(value);
}

function isBackground(value: unknown): value is BackgroundId {
  return typeof value === "string" && (BACKGROUNDS as readonly string[]).includes(value);
}

function isQuality(value: unknown): value is Quality {
  return value === "low" || value === "medium" || value === "high";
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function sanitizeSettings(raw: unknown, fallback = defaultSettings()): Settings {
  const src = raw && typeof raw === "object" ? (raw as Partial<Settings>) : {};
  return {
    sensitivity: clamp(Number(src.sensitivity ?? fallback.sensitivity), 0.2, 3),
    smoothing: clamp(Number(src.smoothing ?? fallback.smoothing), 0, 0.95),
    fftSize: isFftSize(src.fftSize) ? src.fftSize : fallback.fftSize,
    palette: isPalette(src.palette) ? src.palette : fallback.palette,
    bloom: clamp(Number(src.bloom ?? fallback.bloom), 0, 1),
    barCount: Math.round(clamp(Number(src.barCount ?? fallback.barCount), 8, 160)),
    mirror: Boolean(src.mirror ?? fallback.mirror),
    speed: clamp(Number(src.speed ?? fallback.speed), 0.25, 2.5),
    background: isBackground(src.background) ? src.background : fallback.background,
    quality: isQuality(src.quality) ? src.quality : fallback.quality,
  };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings();
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function resetSettings(): Settings {
  localStorage.removeItem(STORAGE_KEY);
  const next = defaultSettings();
  saveSettings(next);
  return next;
}
