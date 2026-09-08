import {
  PRESETS,
  isPreset,
  pickTune,
  presetDefaults,
  type PresetId,
  type Tune,
} from "./presets";
import { isMobileLab, type Quality } from "./quality";

export const FFT_SIZES = [256, 512, 1024, 2048, 4096] as const;
export type FftSize = (typeof FFT_SIZES)[number];

export const PALETTES = ["signal", "ember", "chlorophyll", "plasma", "mono"] as const;
export type PaletteId = (typeof PALETTES)[number];

export const BACKGROUNDS = ["void", "lab", "grid", "dusk"] as const;
export type BackgroundId = (typeof BACKGROUNDS)[number];

export type Settings = Tune & {
  preset: PresetId;
  quality: Quality;
};

export const STORAGE_KEY = "pulsefield.settings.v2";
export const LEGACY_STORAGE_KEY = "pulsefield.settings.v1";

type StoreV2 = {
  v: 2;
  preset: PresetId;
  quality: Quality;
  overrides: Partial<Record<PresetId, Partial<Tune>>>;
};

export function defaultQuality(mobile = isMobileLab()): Quality {
  return mobile ? "low" : "medium";
}

export function defaultSettings(preset: PresetId = "bars", mobile = isMobileLab()): Settings {
  return {
    ...presetDefaults(preset, mobile),
    preset,
    quality: defaultQuality(mobile),
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

export function sanitizeTune(raw: unknown, fallback: Tune): Tune {
  const src = raw && typeof raw === "object" ? (raw as Partial<Tune>) : {};
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
  };
}

export function sanitizeSettings(raw: unknown, fallback = defaultSettings()): Settings {
  const src = raw && typeof raw === "object" ? (raw as Partial<Settings>) : {};
  const preset = isPreset(src.preset) ? src.preset : fallback.preset;
  const quality = isQuality(src.quality) ? src.quality : fallback.quality;
  return {
    ...sanitizeTune(src, fallback),
    preset,
    quality,
  };
}

export function hydrateSettings(
  preset: PresetId,
  quality: Quality,
  override?: Partial<Tune>,
  mobile = isMobileLab(),
): Settings {
  const base = presetDefaults(preset, mobile);
  return sanitizeSettings({
    ...base,
    ...override,
    preset,
    quality,
  });
}

function emptyStore(): StoreV2 {
  return {
    v: 2,
    preset: "bars",
    quality: defaultQuality(),
    overrides: {},
  };
}

function sanitizeStore(raw: unknown): StoreV2 {
  if (!raw || typeof raw !== "object") return emptyStore();
  const src = raw as Partial<StoreV2> & Partial<Settings> & { v?: unknown };
  if (src.v === 2) {
    const preset = isPreset(src.preset) ? src.preset : "bars";
    const quality = isQuality(src.quality) ? src.quality : defaultQuality();
    const overrides: StoreV2["overrides"] = {};
    const incoming = src.overrides && typeof src.overrides === "object" ? src.overrides : {};
    for (const id of PRESETS) {
      const entry = incoming[id];
      if (entry && typeof entry === "object") {
        overrides[id] = sanitizeTune(entry, presetDefaults(id));
      }
    }
    return { v: 2, preset, quality, overrides };
  }
  const legacy = sanitizeSettings(src, defaultSettings("bars"));
  return {
    v: 2,
    preset: "bars",
    quality: legacy.quality,
    overrides: { bars: pickTune(legacy) },
  };
}

function readRaw(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function loadStore(): StoreV2 {
  const current = readRaw(STORAGE_KEY);
  if (current) return sanitizeStore(current);
  const legacy = readRaw(LEGACY_STORAGE_KEY);
  if (legacy) return sanitizeStore(legacy);
  return emptyStore();
}

export function saveStore(store: StoreV2): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadSettings(): Settings {
  const store = loadStore();
  return hydrateSettings(store.preset, store.quality, store.overrides[store.preset]);
}

export function saveSettings(settings: Settings): void {
  const store = loadStore();
  store.preset = settings.preset;
  store.quality = settings.quality;
  store.overrides[settings.preset] = pickTune(settings);
  saveStore(store);
}

export function commitSettings(prev: Settings, next: Settings): Settings {
  const store = loadStore();
  store.quality = next.quality;

  if (next.preset !== prev.preset) {
    const preset = isPreset(next.preset) ? next.preset : "bars";
    store.preset = preset;
    saveStore(store);
    return hydrateSettings(preset, store.quality, store.overrides[preset]);
  }

  const sanitized = sanitizeSettings({ ...next, quality: store.quality, preset: prev.preset });
  if (!tuneEqualsSafe(pickTune(prev), pickTune(sanitized))) {
    store.overrides[prev.preset] = pickTune(sanitized);
  }
  store.preset = prev.preset;
  saveStore(store);
  return sanitized;
}

function tuneEqualsSafe(a: Tune, b: Tune): boolean {
  return (
    a.sensitivity === b.sensitivity &&
    a.smoothing === b.smoothing &&
    a.fftSize === b.fftSize &&
    a.palette === b.palette &&
    a.bloom === b.bloom &&
    a.barCount === b.barCount &&
    a.mirror === b.mirror &&
    a.speed === b.speed &&
    a.background === b.background
  );
}

export function resetSettings(preset?: PresetId): Settings {
  const store = loadStore();
  const active = preset ?? store.preset;
  delete store.overrides[active];
  store.preset = active;
  store.quality = defaultQuality();
  saveStore(store);
  return hydrateSettings(active, store.quality);
}

export const HUD_STORAGE_KEY = "pulsefield.hud.v1";

export type HudPrefs = {
  showFps: boolean;
};

export function defaultHud(): HudPrefs {
  return { showFps: true };
}

export function loadHud(): HudPrefs {
  try {
    const raw = localStorage.getItem(HUD_STORAGE_KEY);
    if (!raw) return defaultHud();
    const parsed = JSON.parse(raw) as Partial<HudPrefs>;
    return { showFps: parsed.showFps !== false };
  } catch {
    return defaultHud();
  }
}

export function saveHud(prefs: HudPrefs): void {
  localStorage.setItem(HUD_STORAGE_KEY, JSON.stringify(prefs));
}

