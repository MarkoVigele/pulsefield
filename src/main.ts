import { AudioLab } from "./audio";
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

function frame(now: number): void {
  const settings = ui.getSettings();
  if (renderer.id !== settings.preset) {
    renderer = createVisualizer(settings.preset);
  }
  lab.applyTuning(settings.fftSize, settings.smoothing);
  const snap = lab.sample();
  const boosted = {
    ...snap,
    frequency: scaleBins(snap.frequency, settings.sensitivity),
  };
  const ctx = renderer.resize(ui.canvas, settings.quality);
  if (ctx) {
    renderer.draw(ctx, ui.canvas, boosted, settings, now);
  }
  ui.refreshHud();
  requestAnimationFrame(frame);
}

function scaleBins(source: Uint8Array, sensitivity: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(source.length);
  const k = sensitivity;
  for (let i = 0; i < source.length; i += 1) {
    out[i] = Math.min(255, Math.round((source[i] ?? 0) * k));
  }
  return out;
}

requestAnimationFrame(frame);
