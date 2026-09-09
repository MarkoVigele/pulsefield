import { resetMemoryStorage } from "./test-storage.ts";
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { PRESET_LABEL, PRESETS, presetDefaults } from "./presets.ts";
import { particleBudget, scaledDensity } from "./quality.ts";
import {
  DEFAULT_FPS_MODE,
  HUD_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  PANEL_STORAGE_KEY,
  STORAGE_KEY,
  clampPanelPosition,
  commitSettings,
  defaultPanel,
  defaultSettings,
  hydrateSettings,
  loadHud,
  loadPanel,
  loadSettings,
  resetSettings,
  sanitizePanel,
  sanitizeSettings,
  saveHud,
  savePanel,
} from "./settings.ts";

beforeEach(() => {
  resetMemoryStorage();
});

test("six presets have German or established lab names", () => {
  assert.deepEqual([...PRESETS], ["bars", "ring", "ribbon", "particles", "bloom", "orb"]);
  assert.equal(PRESET_LABEL.bars, "Bars Classic");
  assert.equal(PRESET_LABEL.ring, "Radialring");
  assert.equal(PRESET_LABEL.ribbon, "Wellenband");
  assert.equal(PRESET_LABEL.particles, "Partikelfeld");
  assert.equal(PRESET_LABEL.bloom, "Bloomraster");
  assert.equal(PRESET_LABEL.orb, "Lichtinsel");
});

test("each preset ships distinct defaults", () => {
  const bars = presetDefaults("bars", false);
  const ring = presetDefaults("ring", false);
  const ribbon = presetDefaults("ribbon", false);
  const particles = presetDefaults("particles", false);
  const bloom = presetDefaults("bloom", false);
  const orb = presetDefaults("orb", false);
  assert.notEqual(bars.palette, ring.palette);
  assert.notEqual(ribbon.background, particles.background);
  assert.notEqual(bloom.bloom, bars.bloom);
  assert.equal(ring.mirror, true);
  assert.equal(particles.palette, "ember");
  assert.equal(orb.palette, "plasma");
  assert.equal(orb.background, "void");
});

test("hydrate uses preset defaults when no override exists", () => {
  const settings = hydrateSettings("ring", "medium", undefined, false);
  const defaults = presetDefaults("ring", false);
  assert.equal(settings.preset, "ring");
  assert.equal(settings.palette, defaults.palette);
  assert.equal(settings.mirror, defaults.mirror);
  assert.equal(settings.quality, "medium");
});

test("switching preset loads defaults unless that preset has overrides", () => {
  const start = defaultSettings("bars", false);
  const afterBloom = commitSettings(start, { ...start, bloom: 0.91 });
  assert.equal(afterBloom.bloom, 0.91);

  const ring = commitSettings(afterBloom, { ...afterBloom, preset: "ring" });
  assert.equal(ring.preset, "ring");
  assert.equal(ring.palette, presetDefaults("ring", false).palette);
  assert.notEqual(ring.bloom, 0.91);

  const back = commitSettings(ring, { ...ring, preset: "bars" });
  assert.equal(back.preset, "bars");
  assert.equal(back.bloom, 0.91);
});

test("reset restores active preset defaults and keeps other overrides", () => {
  let state = defaultSettings("bars", false);
  state = commitSettings(state, { ...state, bloom: 0.9 });
  state = commitSettings(state, { ...state, preset: "ribbon" });
  state = commitSettings(state, { ...state, palette: "mono" });
  assert.equal(state.palette, "mono");

  state = resetSettings("ribbon");
  assert.equal(state.preset, "ribbon");
  assert.equal(state.palette, presetDefaults("ribbon", false).palette);

  state = commitSettings(state, { ...state, preset: "bars" });
  assert.equal(state.bloom, 0.9);
});

test("legacy v1 settings migrate onto Bars Classic", () => {
  localStorage.setItem(
    LEGACY_STORAGE_KEY,
    JSON.stringify({
      sensitivity: 2,
      smoothing: 0.4,
      fftSize: 512,
      palette: "ember",
      bloom: 0.8,
      barCount: 40,
      mirror: true,
      speed: 1.5,
      background: "dusk",
      quality: "high",
    }),
  );
  const loaded = loadSettings();
  assert.equal(loaded.preset, "bars");
  assert.equal(loaded.palette, "ember");
  assert.equal(loaded.quality, "high");
  assert.equal(loaded.barCount, 40);
});

test("unknown preset falls back to bars", () => {
  const settings = sanitizeSettings({ preset: "kugel", quality: "medium" }, defaultSettings("bars", false));
  assert.equal(settings.preset, "bars");
});

test("Lichtinsel persists as sixth preset", () => {
  let state = defaultSettings("orb", false);
  assert.equal(state.preset, "orb");
  assert.equal(state.palette, presetDefaults("orb", false).palette);
  state = commitSettings(state, { ...state, bloom: 0.88 });
  state = commitSettings(state, { ...state, preset: "bars" });
  state = commitSettings(state, { ...state, preset: "orb" });
  assert.equal(state.preset, "orb");
  assert.equal(state.bloom, 0.88);
});

test("quality scales density and particle budget", () => {
  assert.ok(scaledDensity(64, "low", 8, 160) < scaledDensity(64, "high", 8, 160));
  assert.ok(particleBudget(64, "low") < particleBudget(64, "high"));
  assert.ok(particleBudget(80, "high") <= 480);
});

test("FPS overlay defaults on and persists separately from presets", () => {
  assert.equal(loadHud().showFps, true);
  saveHud({ showFps: false });
  assert.equal(loadHud().showFps, false);
  assert.ok(localStorage.getItem(HUD_STORAGE_KEY));
  let state = defaultSettings("bars", false);
  state = commitSettings(state, { ...state, bloom: 0.4 });
  assert.equal(loadHud().showFps, false);
});

test("Bildrate defaults to 120 and Empfindlichkeit Auto stays off", () => {
  const settings = defaultSettings("bars", false);
  assert.equal(settings.fpsMode, "120");
  assert.equal(settings.fpsMode, DEFAULT_FPS_MODE);
  assert.equal(settings.sensitivityAuto, false);
});

test("fps mode and Auto persist across preset switches", () => {
  let state = defaultSettings("bars", false);
  state = commitSettings(state, { ...state, fpsMode: "60", sensitivityAuto: true });
  assert.equal(state.fpsMode, "60");
  assert.equal(state.sensitivityAuto, true);

  state = commitSettings(state, { ...state, preset: "ring" });
  assert.equal(state.preset, "ring");
  assert.equal(state.fpsMode, "60");
  assert.equal(state.sensitivityAuto, true);

  const reloaded = loadSettings();
  assert.equal(reloaded.fpsMode, "60");
  assert.equal(reloaded.sensitivityAuto, true);
});

test("reset restores 120 and turns Auto off without dropping other preset overrides", () => {
  let state = defaultSettings("bars", false);
  state = commitSettings(state, { ...state, bloom: 0.9, fpsMode: "auto", sensitivityAuto: true });
  state = resetSettings("bars");
  assert.equal(state.fpsMode, "120");
  assert.equal(state.sensitivityAuto, false);
  assert.equal(state.bloom, presetDefaults("bars", false).bloom);
});

test("unknown fps mode falls back to 120", () => {
  const settings = sanitizeSettings({ fpsMode: "240", sensitivityAuto: 1 }, defaultSettings("bars", false));
  assert.equal(settings.fpsMode, "120");
  assert.equal(settings.sensitivityAuto, true);
});

test("settings panel position persists and rejects junk", () => {
  assert.deepEqual(loadPanel(), defaultPanel());
  savePanel({ x: 120, y: 40, collapsed: true });
  assert.deepEqual(loadPanel(), { x: 120, y: 40, collapsed: true });
  assert.ok(localStorage.getItem(PANEL_STORAGE_KEY));
  assert.deepEqual(sanitizePanel({ x: "nope", y: 12, collapsed: 1 }), { x: null, y: 12, collapsed: false });
  assert.deepEqual(sanitizePanel(null), defaultPanel());
});

test("panel clamp keeps a grab strip on screen", () => {
  const pos = clampPanelPosition(-400, -20, 360, 480, 390, 700, 8);
  assert.ok(pos.x + 360 > 8);
  assert.equal(pos.y, 8);
  const right = clampPanelPosition(2000, 2000, 360, 80, 390, 700, 8);
  assert.ok(right.x < 390);
  assert.ok(right.y < 700);
});

test("existing v2 store without the new fields gets 120 and Auto off", () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      v: 2,
      preset: "ribbon",
      quality: "high",
      overrides: { ribbon: { palette: "mono" } },
    }),
  );
  const loaded = loadSettings();
  assert.equal(loaded.preset, "ribbon");
  assert.equal(loaded.palette, "mono");
  assert.equal(loaded.fpsMode, "120");
  assert.equal(loaded.sensitivityAuto, false);
});
