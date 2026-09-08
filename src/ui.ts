import { AudioLab, canCaptureTab, canUseMicrophone } from "./audio";
import {
  BACKGROUNDS,
  FFT_SIZES,
  PALETTES,
  type Settings,
  loadSettings,
  resetSettings,
  saveSettings,
} from "./settings";
import { isMobileLab } from "./quality";

const PALETTE_LABEL: Record<(typeof PALETTES)[number], string> = {
  signal: "Signal",
  ember: "Glut",
  chlorophyll: "Chlorophyll",
  plasma: "Plasma",
  mono: "Mono",
};

const BG_LABEL: Record<(typeof BACKGROUNDS)[number], string> = {
  void: "Leere",
  lab: "Labor",
  grid: "Raster",
  dusk: "Dämmerung",
};

export type UiHandles = {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  getSettings: () => Settings;
  setSettings: (next: Settings) => void;
  lab: AudioLab;
  fileInput: HTMLInputElement;
  toast: (message: string) => void;
  refreshHud: () => void;
};

export function mountUi(parent: HTMLElement, lab: AudioLab): UiHandles {
  let settings = loadSettings();
  let toastTimer = 0;

  parent.innerHTML = `
    <canvas id="viz" class="viz" aria-label="Bars Classic Visualizer"></canvas>
    <div class="chrome">
      <header class="hud">
        <div class="brand">
          <span class="mark">PF</span>
          <div>
            <strong>Pulsefield</strong>
            <small id="preset-label">Preset · Bars Classic</small>
          </div>
        </div>
        <div class="meters" aria-hidden="true">
          <span data-meter="peak">PK <b id="m-peak">0.00</b></span>
          <span data-meter="rms">RMS <b id="m-rms">0.00</b></span>
          <span class="bands">
            <i id="b-low"></i><i id="b-mid"></i><i id="b-high"></i>
          </span>
        </div>
      </header>

      <p class="source-line" id="source-line">Kein Eingang · Labor bereit</p>

      <nav class="dock" aria-label="Eingänge">
        <button type="button" class="dock-btn" data-act="mic"${canUseMicrophone() ? "" : " disabled"}>
          Mikrofon
        </button>
        <button type="button" class="dock-btn" data-act="tab"${canCaptureTab() ? "" : " disabled"}>
          Tab / System
        </button>
        <button type="button" class="dock-btn" data-act="file">Datei</button>
        <button type="button" class="dock-btn dock-btn--ghost" data-act="stop">Stop</button>
        <button type="button" class="dock-btn dock-btn--lab" data-act="sheet" aria-expanded="false" aria-controls="sheet">
          Labor
        </button>
      </nav>
    </div>

    <div class="sheet-root" id="sheet-root" hidden>
      <button type="button" class="backdrop" data-act="close-sheet" aria-label="Einstellungen schließen"></button>
      <aside class="sheet" id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div class="sheet-handle" aria-hidden="true"></div>
        <header class="sheet-head">
          <h2 id="sheet-title">Labor</h2>
          <button type="button" class="text-btn" data-act="close-sheet">Schließen</button>
        </header>
        <div class="sheet-body">
          <p class="hint" id="tab-hint"></p>

          <label class="field">
            <span>Empfindlichkeit <b id="v-sensitivity"></b></span>
            <input type="range" min="0.2" max="3" step="0.05" data-key="sensitivity" />
          </label>
          <label class="field">
            <span>Glättung <b id="v-smoothing"></b></span>
            <input type="range" min="0" max="0.95" step="0.01" data-key="smoothing" />
          </label>
          <label class="field">
            <span>FFT-Größe</span>
            <select data-key="fftSize">
              ${FFT_SIZES.map((n) => `<option value="${n}">${n}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Farbpalette</span>
            <select data-key="palette">
              ${PALETTES.map((id) => `<option value="${id}">${PALETTE_LABEL[id]}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Bloom / Glow <b id="v-bloom"></b></span>
            <input type="range" min="0" max="1" step="0.01" data-key="bloom" />
          </label>
          <label class="field">
            <span>Balken <b id="v-barCount"></b></span>
            <input type="range" min="8" max="160" step="1" data-key="barCount" />
          </label>
          <label class="field field--row">
            <span>Spiegeln</span>
            <input type="checkbox" data-key="mirror" />
          </label>
          <label class="field">
            <span>Tempo <b id="v-speed"></b></span>
            <input type="range" min="0.25" max="2.5" step="0.05" data-key="speed" />
          </label>
          <label class="field">
            <span>Hintergrund</span>
            <select data-key="background">
              ${BACKGROUNDS.map((id) => `<option value="${id}">${BG_LABEL[id]}</option>`).join("")}
            </select>
          </label>

          <fieldset class="quality">
            <legend>Qualität</legend>
            <div class="seg" role="radiogroup" aria-label="Qualität">
              <button type="button" data-quality="low">Niedrig</button>
              <button type="button" data-quality="medium">Mittel</button>
              <button type="button" data-quality="high">Hoch</button>
            </div>
            <p class="hint">Platzhalter für spätere Stufen. Mobil startet auf Niedrig.</p>
          </fieldset>

          <button type="button" class="reset" data-act="reset">Auf Standard zurücksetzen</button>
        </div>
      </aside>
    </div>

    <input id="file" type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac" hidden />
    <div class="toast" id="toast" role="status" hidden></div>
  `;

  const canvas = must(parent, "#viz", HTMLCanvasElement);
  const fileInput = must(parent, "#file", HTMLInputElement);
  const sheetRoot = must(parent, "#sheet-root", HTMLElement);
  const toastEl = must(parent, "#toast", HTMLElement);
  const sourceLine = must(parent, "#source-line", HTMLElement);
  const tabHint = must(parent, "#tab-hint", HTMLElement);

  tabHint.textContent = isMobileLab()
    ? "Hinweis: Auf dem Handy ist Tab-/Systemton oft gesperrt oder ohne Audio. Mikrofon oder Datei sind der verlässliche Weg."
    : "Für Tab-/Systemton einen Tab oder Bildschirm teilen und „Tab-Audio teilen“ aktivieren. Ohne diesen Haken bleibt das Feld still.";

  const toast = (message: string) => {
    toastEl.textContent = message;
    toastEl.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.hidden = true;
    }, 4200);
  };

  const refreshHud = () => {
    const { peak, rms, low, mid, high } = lab.metrics;
    setText(parent, "#m-peak", peak.toFixed(2));
    setText(parent, "#m-rms", rms.toFixed(2));
    setWidth(parent, "#b-low", low);
    setWidth(parent, "#b-mid", mid);
    setWidth(parent, "#b-high", high);
    const mobileNote = isMobileLab() && lab.kind === "none" ? " · Mobil: Qualität Niedrig" : "";
    sourceLine.textContent = `${lab.label}${mobileNote}`;
  };

  const syncForm = () => {
    for (const input of parent.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-key]")) {
      const key = input.dataset.key as keyof Settings;
      const value = settings[key];
      if (input instanceof HTMLInputElement && input.type === "checkbox") {
        input.checked = Boolean(value);
      } else {
        input.value = String(value);
      }
    }
    setText(parent, "#v-sensitivity", settings.sensitivity.toFixed(2));
    setText(parent, "#v-smoothing", settings.smoothing.toFixed(2));
    setText(parent, "#v-bloom", settings.bloom.toFixed(2));
    setText(parent, "#v-barCount", String(settings.barCount));
    setText(parent, "#v-speed", settings.speed.toFixed(2));
    for (const btn of parent.querySelectorAll<HTMLButtonElement>("[data-quality]")) {
      btn.classList.toggle("is-on", btn.dataset.quality === settings.quality);
    }
  };

  const persist = (next: Settings) => {
    settings = next;
    saveSettings(settings);
    lab.applyTuning(settings.fftSize, settings.smoothing);
    syncForm();
  };

  const setSheet = (open: boolean) => {
    sheetRoot.hidden = !open;
    document.body.classList.toggle("sheet-open", open);
    const toggle = parent.querySelector("[data-act=sheet]");
    toggle?.setAttribute("aria-expanded", String(open));
  };

  parent.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-act], [data-quality]");
    if (!btn) return;
    const act = btn.dataset.act;
    const quality = btn.dataset.quality;
    if (quality === "low" || quality === "medium" || quality === "high") {
      persist({ ...settings, quality });
      return;
    }
    if (act === "sheet") setSheet(sheetRoot.hidden);
    if (act === "close-sheet") setSheet(false);
    if (act === "reset") {
      persist(resetSettings());
      toast("Labor auf Standard zurückgesetzt.");
    }
    if (act === "stop") {
      lab.stop();
      refreshHud();
    }
    if (act === "file") fileInput.click();
    if (act === "mic") {
      void runInput(() => lab.startMic(settings.fftSize, settings.smoothing), "Mikrofon verbunden.");
    }
    if (act === "tab") {
      void runInput(() => lab.startTab(settings.fftSize, settings.smoothing), "Tab-/Systemton verbunden.");
    }
  });

  parent.addEventListener("input", (event) => {
    const el = event.target as HTMLInputElement | HTMLSelectElement;
    const key = el.dataset.key as keyof Settings | undefined;
    if (!key) return;
    const next = { ...settings };
    if (key === "mirror" && el instanceof HTMLInputElement) {
      next.mirror = el.checked;
    } else if (key === "fftSize") {
      next.fftSize = Number(el.value) as Settings["fftSize"];
    } else if (key === "palette") {
      next.palette = el.value as Settings["palette"];
    } else if (key === "background") {
      next.background = el.value as Settings["background"];
    } else if (key === "sensitivity" || key === "smoothing" || key === "bloom" || key === "speed") {
      next[key] = Number(el.value);
    } else if (key === "barCount") {
      next.barCount = Math.round(Number(el.value));
    }
    persist(next);
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    void runInput(() => lab.startFile(file, settings.fftSize, settings.smoothing), `Datei: ${file.name}`);
  });

  async function runInput(fn: () => Promise<void>, ok: string): Promise<void> {
    try {
      await fn();
      toast(ok);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Eingang fehlgeschlagen.";
      if (message.toLowerCase().includes("denied") || message.toLowerCase().includes("notallowed")) {
        toast("Zugriff wurde verweigert.");
      } else if (message.toLowerCase().includes("abort") || message.toLowerCase().includes("cancel")) {
        toast("Auswahl abgebrochen.");
      } else {
        toast(message);
      }
    }
    refreshHud();
  }

  syncForm();
  refreshHud();

  return {
    root: parent,
    canvas,
    getSettings: () => settings,
    setSettings: persist,
    lab,
    fileInput,
    toast,
    refreshHud,
  };
}

function must<T extends Element>(root: ParentNode, sel: string, ctor: new () => T): T {
  const el = root.querySelector(sel);
  if (!(el instanceof ctor)) {
    throw new Error(`Element fehlt: ${sel}`);
  }
  return el;
}

function setText(root: ParentNode, sel: string, value: string): void {
  const el = root.querySelector(sel);
  if (el) el.textContent = value;
}

function setWidth(root: ParentNode, sel: string, unit: number): void {
  const el = root.querySelector<HTMLElement>(sel);
  if (el) el.style.transform = `scaleX(${Math.min(1, Math.max(0.04, unit))})`;
}
