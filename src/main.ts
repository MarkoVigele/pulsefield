import { createAgc, stepAgc } from "./agc";
import { AudioLab } from "./audio";
import { createPace, formatFps, stepPace } from "./loop";
import { mountUi } from "./ui";
import { createVisualizer } from "./viz";
import "./styles.css";

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("App-Wurzel fehlt.");
}

const lab = new AudioLab();
const ui = mountUi(root, lab);
let renderer = createVisualizer(ui.getSettings().preset);
renderer.mount?.({ root: ui.root, canvas: ui.canvas });
let binScratch = new Uint8Array(0);
const pace = createPace(performance.now(), ui.getSettings().fpsMode);
const agc = createAgc(ui.getSettings().sensitivity);
let lastNow = performance.now();
let raf = 0;

function frame(now: number): void {
  raf = requestAnimationFrame(frame);
  if (document.visibilityState === "hidden") return;
  const settings = ui.getSettings();
  if (!stepPace(pace, now, settings.fpsMode)) return;

  const dt = Math.max(0, (now - lastNow) / 1000);
  lastNow = now;

  if (renderer.id !== settings.preset) {
    renderer.dispose?.();
    renderer = createVisualizer(settings.preset);
    renderer.mount?.({ root: ui.root, canvas: ui.canvas });
  }
  lab.applyTuning(settings.fftSize, settings.smoothing);
  const snap = lab.sample();
  const sensitivity = stepAgc(agc, {
    rms: snap.rms,
    peak: snap.peak,
    enabled: settings.sensitivityAuto,
    manual: settings.sensitivity,
    dt,
  });
  ui.paintSensitivity(sensitivity, settings.sensitivityAuto);
  const boosted = {
    ...snap,
    frequency: scaleBins(snap.frequency, sensitivity),
  };
  const drawSettings = sensitivity === settings.sensitivity ? settings : { ...settings, sensitivity };
  const ctx = renderer.resize(ui.canvas, settings.quality);
  if (ctx) {
    renderer.draw(ctx, ui.canvas, boosted, drawSettings, now);
  }
  ui.refreshMeters();
  ui.setFps(formatFps(pace.fps));
}

function scaleBins(source: Uint8Array, sensitivity: number): Uint8Array<ArrayBuffer> {
  if (binScratch.length !== source.length) {
    binScratch = new Uint8Array(source.length);
  }
  const k = sensitivity;
  for (let i = 0; i < source.length; i += 1) {
    binScratch[i] = Math.min(255, Math.round((source[i] ?? 0) * k));
  }
  return binScratch;
}

function startLoop(): void {
  if (raf) return;
  lastNow = performance.now();
  Object.assign(pace, createPace(lastNow, ui.getSettings().fpsMode, pace.displayHz));
  raf = requestAnimationFrame(frame);
}

function stopLoop(): void {
  cancelAnimationFrame(raf);
  raf = 0;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    stopLoop();
    return;
  }
  startLoop();
});

startLoop();
