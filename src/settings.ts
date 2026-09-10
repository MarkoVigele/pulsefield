import { DEFAULT_FPS_MODE, isFpsMode, type FpsMode } from "./loop";
import {
  PRESETS,
  isPreset,
  pickTune,
  presetDefaults,
  type PresetId,
  type Tune,
} from "./presets";
import { isMobileLab, type Quality } from "./quality";

export type { FpsMode } from "./loop";
export { DEFAULT_FPS_MODE, FPS_MODES, isFpsMode } from "./loop";

export const FFT_SIZES = [256, 512, 1024, 2048, 4096] as const;
export type FftSize = (typeof FFT_SIZES)[number];

export const PALETTES = ["signal", "ember", "chlorophyll", "plasma", "mono"] as const;
export type PaletteId = (typeof PALETTES)[number];

export const BACKGROUNDS = ["void", "lab", "grid", "dusk"] as const;
export type BackgroundId = (typeof BACKGROUNDS)[number];

export type Settings = Tune & {
  preset: PresetId;
  quality: Quality;
  fpsMode: FpsMode;
  sensitivityAuto: boolean;
};

export const STORAGE_KEY = "pulsefield.settings.v2";
export const LEGACY_STORAGE_KEY = "pulsefield.settings.v1";

type StoreV2 = {
  v: 2;
  preset: PresetId;
  quality: Quality;
  fpsMode: FpsMode;
  sensitivityAuto: boolean;
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
    fpsMode: DEFAULT_FPS_MODE,
    sensitivityAuto: false,
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
    fpsMode: isFpsMode(src.fpsMode) ? src.fpsMode : fallback.fpsMode,
    sensitivityAuto: Boolean(src.sensitivityAuto ?? fallback.sensitivityAuto),
  };
}

export function hydrateSettings(
  preset: PresetId,
  quality: Quality,
  override?: Partial<Tune>,
  mobile = isMobileLab(),
  extras: { fpsMode?: FpsMode; sensitivityAuto?: boolean } = {},
): Settings {
  const base = presetDefaults(preset, mobile);
  return sanitizeSettings({
    ...base,
    ...override,
    preset,
    quality,
    fpsMode: extras.fpsMode ?? DEFAULT_FPS_MODE,
    sensitivityAuto: extras.sensitivityAuto ?? false,
  });
}

function emptyStore(): StoreV2 {
  return {
    v: 2,
    preset: "bars",
    quality: defaultQuality(),
    fpsMode: DEFAULT_FPS_MODE,
    sensitivityAuto: false,
    overrides: {},
  };
}

function sanitizeStore(raw: unknown): StoreV2 {
  if (!raw || typeof raw !== "object") return emptyStore();
  const src = raw as Partial<StoreV2> & Partial<Settings> & { v?: unknown };
  if (src.v === 2) {
    const preset = isPreset(src.preset) ? src.preset : "bars";
    const quality = isQuality(src.quality) ? src.quality : defaultQuality();
    const fpsMode = isFpsMode(src.fpsMode) ? src.fpsMode : DEFAULT_FPS_MODE;
    const sensitivityAuto = Boolean(src.sensitivityAuto);
    const overrides: StoreV2["overrides"] = {};
    const incoming = src.overrides && typeof src.overrides === "object" ? src.overrides : {};
    for (const id of PRESETS) {
      const entry = incoming[id];
      if (entry && typeof entry === "object") {
        overrides[id] = sanitizeTune(entry, presetDefaults(id));
      }
    }
    return { v: 2, preset, quality, fpsMode, sensitivityAuto, overrides };
  }
  const legacy = sanitizeSettings(src, defaultSettings("bars"));
  return {
    v: 2,
    preset: "bars",
    quality: legacy.quality,
    fpsMode: legacy.fpsMode,
    sensitivityAuto: legacy.sensitivityAuto,
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

function extrasFrom(store: StoreV2): { fpsMode: FpsMode; sensitivityAuto: boolean } {
  return { fpsMode: store.fpsMode, sensitivityAuto: store.sensitivityAuto };
}

export function loadSettings(): Settings {
  const store = loadStore();
  return hydrateSettings(store.preset, store.quality, store.overrides[store.preset], isMobileLab(), extrasFrom(store));
}

export function saveSettings(settings: Settings): void {
  const store = loadStore();
  store.preset = settings.preset;
  store.quality = settings.quality;
  store.fpsMode = isFpsMode(settings.fpsMode) ? settings.fpsMode : DEFAULT_FPS_MODE;
  store.sensitivityAuto = Boolean(settings.sensitivityAuto);
  store.overrides[settings.preset] = pickTune(settings);
  saveStore(store);
}

export function commitSettings(prev: Settings, next: Settings): Settings {
  const store = loadStore();
  store.quality = next.quality;
  store.fpsMode = isFpsMode(next.fpsMode) ? next.fpsMode : store.fpsMode;
  store.sensitivityAuto = Boolean(next.sensitivityAuto);

  if (next.preset !== prev.preset) {
    const preset = isPreset(next.preset) ? next.preset : "bars";
    store.preset = preset;
    saveStore(store);
    return hydrateSettings(preset, store.quality, store.overrides[preset], isMobileLab(), extrasFrom(store));
  }

  const sanitized = sanitizeSettings({
    ...next,
    quality: store.quality,
    fpsMode: store.fpsMode,
    sensitivityAuto: store.sensitivityAuto,
    preset: prev.preset,
  });
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
  store.fpsMode = DEFAULT_FPS_MODE;
  store.sensitivityAuto = false;
  saveStore(store);
  return hydrateSettings(active, store.quality, undefined, isMobileLab(), extrasFrom(store));
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

export const PANEL_STORAGE_KEY = "pulsefield.panel.v1";

export type PanelPrefs = {
  x: number | null;
  y: number | null;
  collapsed: boolean;
};

export function defaultPanel(): PanelPrefs {
  return { x: null, y: null, collapsed: false };
}

export function sanitizePanel(raw: unknown): PanelPrefs {
  const src = raw && typeof raw === "object" ? (raw as Partial<PanelPrefs>) : {};
  const x = Number(src.x);
  const y = Number(src.y);
  return {
    x: Number.isFinite(x) ? x : null,
    y: Number.isFinite(y) ? y : null,
    collapsed: src.collapsed === true,
  };
}

export function loadPanel(): PanelPrefs {
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY);
    if (!raw) return defaultPanel();
    return sanitizePanel(JSON.parse(raw));
  } catch {
    return defaultPanel();
  }
}

export function savePanel(prefs: PanelPrefs): void {
  localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(sanitizePanel(prefs)));
}

export type SafeInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export const EMPTY_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export function sanitizeInsets(raw: unknown): SafeInsets {
  const src = raw && typeof raw === "object" ? (raw as Partial<SafeInsets>) : {};
  const n = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  return { top: n(src.top), right: n(src.right), bottom: n(src.bottom), left: n(src.left) };
}

/** Keep the header grab-able; allow the body to sit partly off-screen. */
export function clampPanelPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewW: number,
  viewH: number,
  pad = 8,
  insets: SafeInsets = EMPTY_INSETS,
): { x: number; y: number } {
  const safe = sanitizeInsets(insets);
  const minVisibleX = Math.min(72, Math.max(1, width));
  const minVisibleY = Math.min(44, Math.max(1, height));
  const minX = safe.left + pad - Math.max(0, width - minVisibleX);
  const minY = safe.top + pad;
  const maxX = Math.max(safe.left + pad, viewW - safe.right - minVisibleX);
  const maxY = Math.max(safe.top + pad, viewH - safe.bottom - minVisibleY);
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  };
}

export const ONBOARD_STORAGE_KEY = "pulsefield.onboard.v1";

export type OnboardPrefs = {
  seen: boolean;
};

export function defaultOnboard(): OnboardPrefs {
  return { seen: false };
}

export function sanitizeOnboard(raw: unknown): OnboardPrefs {
  const src = raw && typeof raw === "object" ? (raw as Partial<OnboardPrefs>) : {};
  return { seen: src.seen === true };
}

export function loadOnboard(): OnboardPrefs {
  try {
    const raw = localStorage.getItem(ONBOARD_STORAGE_KEY);
    if (raw) return sanitizeOnboard(JSON.parse(raw));
    if (localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY)) {
      return { seen: true };
    }
    return defaultOnboard();
  } catch {
    return defaultOnboard();
  }
}

export function saveOnboard(prefs: OnboardPrefs): void {
  localStorage.setItem(ONBOARD_STORAGE_KEY, JSON.stringify(sanitizeOnboard(prefs)));
}

export function shouldShowOnboard(seen: boolean, kind: string): boolean {
  return !seen && kind === "none";
}

export function sourceHudText(kind: string, label: string): string {
  if (kind === "tab") return "Tab / System";
  if (kind === "file") return label.trim() || "Datei";
  if (kind === "mic") return label.trim() || "Mikrofon";
  return "Kein Eingang";
}

