import { AudioLab } from "./audio";
import {
  DENSITY_LABEL,
  PRESETS,
  PRESET_HINT,
  PRESET_LABEL,
  isPreset,
  type PresetId,
} from "./presets";
import { type Quality } from "./quality";
import {
  BACKGROUNDS,
  FFT_SIZES,
  FPS_MODES,
  PALETTES,
  type SafeInsets,
  type Settings,
  clampPanelPosition,
  commitSettings,
  loadHud,
  loadOnboard,
  loadPanel,
  loadSettings,
  resetSettings,
  saveHud,
  saveOnboard,
  savePanel,
  shouldShowOnboard,
  sourceHudText,
} from "./settings";
import {
  SCO_HINT,
  canUseMicrophone,
  listAudioInputs,
  microphonePermissionGranted,
  tabCaptureOffered,
  type LabAudioInput,
} from "./sources";

const PALETTE_LABEL: Record<(typeof PALETTES)[number], string> = {
  signal: "Signal",
  ember: "Glut",
  chlorophyll: "Chlorophyll",
  plasma: "Plasma",
  mono: "Mono",
};

const BG_LABEL: Record<(typeof BACKGROUNDS)[number], string> = {
  void: "Leere",
  lab: "Studio",
  grid: "Raster",
  dusk: "Dämmerung",
};

const FILE_ACCEPT = "audio/*,.mp3,.wav,.ogg,.oga,.m4a,.flac,.aac,.opus,.webm";
const DRAG_SLOP = 4;

export type UiHandles = {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  getSettings: () => Settings;
  setSettings: (next: Settings) => void;
  lab: AudioLab;
  fileInput: HTMLInputElement;
  toast: (message: string) => void;
  refreshHud: () => void;
  refreshMeters: () => void;
  setFps: (label: string) => void;
  paintSensitivity: (gain: number, auto: boolean) => void;
};

export function mountUi(parent: HTMLElement, lab: AudioLab): UiHandles {
  let settings = loadSettings();
  let hudPrefs = loadHud();
  let panelPrefs = loadPanel();
  let onboard = loadOnboard();
  let toastTimer = 0;
  let inputs: LabAudioInput[] = [];
  let pickedDeviceId = "";
  const tabOk = tabCaptureOffered();
  const micOk = canUseMicrophone();
  const phone = !tabOk;

  const presetCards = PRESETS.map(
    (id) => `
      <button type="button" class="preset-btn" data-preset="${id}">
        <span>${PRESET_LABEL[id]}${id === "orb" ? ' <em class="badge">3D</em>' : ""}</span>
        <small>${PRESET_HINT[id]}</small>
      </button>`,
  ).join("");

  parent.innerHTML = `
    <canvas id="viz" class="viz" aria-label="Bars Classic Feld"></canvas>
    <div class="drop-veil" id="drop-veil" hidden>Audiodatei hier ablegen</div>
    <div class="chrome">
      <header class="hud" aria-label="Status">
        <span class="mark">PF</span>
        <div class="hud-status">
          <span class="hud-chip" id="fps-hud"${hudPrefs.showFps ? "" : " hidden"}>
            <span id="fps-readout">— fps</span>
          </span>
          <span class="hud-chip" id="source-line">Kein Eingang</span>
          <button type="button" class="hud-chip hud-chip--btn" id="preset-chip" data-act="presets" aria-haspopup="dialog" aria-controls="preset-switch" aria-expanded="false">
            Bars Classic
          </button>
        </div>
        <div class="meters" aria-hidden="true">
          <span data-meter="peak">PK <b id="m-peak">0.00</b></span>
          <span data-meter="rms">RMS <b id="m-rms">0.00</b></span>
          <span class="bands">
            <i id="b-low"></i><i id="b-mid"></i><i id="b-high"></i>
          </span>
        </div>
      </header>

      <section class="first-run" id="first-run" hidden role="dialog" aria-labelledby="first-run-title">
        <p class="first-run-kicker">Pulsefield</p>
        <h1 id="first-run-title">Eingang</h1>
        <p class="first-run-copy">Mikrofon, Datei oder Tab. Ohne Eingang bleibt das Feld still.</p>
        <div class="first-run-grid">
          <button type="button" class="start-btn${phone ? " start-btn--primary" : ""}" data-act="mic"${micOk ? "" : " disabled"}>
            Mikrofon
            <small>${micOk ? "Raumton vom Gerät" : "Nicht verfügbar"}</small>
          </button>
          <button type="button" class="start-btn${phone ? " start-btn--primary" : ""}" data-act="file">
            Datei
            <small>MP3, WAV, OGG</small>
          </button>
          <button type="button" class="start-btn${tabOk ? " start-btn--primary" : ""}" data-act="tab"${tabOk ? "" : " disabled"} title="${tabOk ? "Chrome-Dialog: Audio teilen aktivieren" : "Nur Desktop-Chrome"}">
            Tab / System
            <small>${tabOk ? "Audio teilen" : "Nur Desktop"}</small>
          </button>
        </div>
        <button type="button" class="text-btn first-run-skip" data-act="skip-onboard">Feld zuerst ansehen</button>
      </section>

      <div class="floor" id="floor" hidden>
        <nav class="dock" aria-label="Eingänge">
          <button type="button" class="dock-btn dock-btn--source${phone ? " dock-btn--primary" : ""}" data-act="mic"${micOk ? "" : " disabled"}>
            Mikrofon
            <small>${micOk ? "Nach Freigabe" : "Nicht verfügbar"}</small>
          </button>
          <button type="button" class="dock-btn dock-btn--source dock-btn--file${phone ? " dock-btn--primary" : ""}" data-act="file">
            Datei
            <small>MP3, WAV, OGG</small>
          </button>
          <button type="button" class="dock-btn dock-btn--source${tabOk ? " dock-btn--primary" : ""}" data-act="tab"${tabOk ? "" : " disabled"} title="${tabOk ? "Chrome-Dialog: Audio teilen aktivieren" : "Nur Desktop-Chrome"}">
            Tab / System
            <small>${tabOk ? "Audio teilen" : "Nur Desktop"}</small>
          </button>
          <button type="button" class="dock-btn dock-btn--quiet" data-act="stop">
            Stop
            <small>Trennen</small>
          </button>
          <button type="button" class="dock-btn dock-btn--settings" data-act="panel" aria-expanded="false" aria-controls="panel">
            Einstellungen
            <small id="dock-preset">Bars Classic</small>
          </button>
        </nav>
      </div>
    </div>

    <div class="preset-switch" id="preset-switch" hidden>
      <div class="preset-switch-card" role="dialog" aria-modal="true" aria-labelledby="preset-switch-title">
        <header class="preset-switch-head">
          <div>
            <p class="preset-switch-kicker">Feld</p>
            <h2 id="preset-switch-title">Preset</h2>
          </div>
          <button type="button" class="text-btn" data-act="close-presets">Schließen</button>
        </header>
        <div class="preset-chips" role="radiogroup" aria-label="Preset">
          ${presetCards}
        </div>
        <p class="preset-switch-hint" id="preset-switch-hint">${PRESET_HINT.bars}</p>
      </div>
    </div>

    <div class="panel-root" id="panel-root" hidden>
      <aside class="panel" id="panel" role="dialog" aria-modal="false" aria-labelledby="panel-title" tabindex="-1">
        <header class="panel-head" id="panel-head">
          <span class="panel-grip" aria-hidden="true"><i></i><i></i></span>
          <div class="panel-head-copy">
            <h2 id="panel-title">Einstellungen</h2>
            <p class="panel-sub" id="panel-sub">Bars Classic</p>
          </div>
          <div class="panel-head-actions">
            <button type="button" class="text-btn" data-act="collapse-panel" id="collapse-panel" aria-controls="panel-body">
              Zuklappen
            </button>
            <button type="button" class="text-btn" data-act="close-panel">Schließen</button>
          </div>
        </header>
        <div class="panel-body" id="panel-body">
          <button type="button" class="preset-launch" data-act="presets">
            <span>Preset</span>
            <strong id="panel-preset">Bars Classic</strong>
            <small>Öffnen</small>
          </button>

          <details class="group" open>
            <summary>Eingang</summary>
            <div class="group-body">
              <div class="field">
                <div class="field-label">
                  <span>Empfindlichkeit</span>
                  <b id="v-sensitivity"></b>
                </div>
                <div class="field-with-mode">
                  <input type="range" min="0.2" max="3" step="0.05" data-key="sensitivity" id="sensitivity-slider" aria-label="Empfindlichkeit" />
                  <button type="button" class="mode-btn" data-act="sensitivity-auto" aria-pressed="false">Auto</button>
                </div>
              </div>
              <p class="hint" id="sensitivity-hint">Von Hand, oder Auto folgt dem Pegel.</p>
              <label class="field" id="device-pick" hidden>
                <span class="field-label">Gerät</span>
                <select id="mic-device" aria-label="Mikrofon am Gerät"></select>
              </label>
            </div>
          </details>

          <details class="group" open>
            <summary>Bild</summary>
            <div class="group-body">
              <label class="field">
                <span class="field-label">Farbpalette</span>
                <select data-key="palette">
                  ${PALETTES.map((id) => `<option value="${id}">${PALETTE_LABEL[id]}</option>`).join("")}
                </select>
              </label>
              <label class="field">
                <div class="field-label">
                  <span>Leuchten</span>
                  <b id="v-bloom"></b>
                </div>
                <input type="range" min="0" max="1" step="0.01" data-key="bloom" />
              </label>
              <label class="field">
                <div class="field-label">
                  <span id="density-label">Balken</span>
                  <b id="v-barCount"></b>
                </div>
                <input type="range" min="8" max="160" step="1" data-key="barCount" />
              </label>
              <label class="field field--row">
                <span>Spiegeln</span>
                <input type="checkbox" data-key="mirror" />
              </label>
              <label class="field">
                <span class="field-label">Hintergrund</span>
                <select data-key="background">
                  ${BACKGROUNDS.map((id) => `<option value="${id}">${BG_LABEL[id]}</option>`).join("")}
                </select>
              </label>
              <label class="field">
                <div class="field-label">
                  <span>Tempo</span>
                  <b id="v-speed"></b>
                </div>
                <input type="range" min="0.25" max="2.5" step="0.05" data-key="speed" />
              </label>
              <label class="field">
                <div class="field-label">
                  <span>Glättung</span>
                  <b id="v-smoothing"></b>
                </div>
                <input type="range" min="0" max="0.95" step="0.01" data-key="smoothing" />
              </label>
            </div>
          </details>

          <details class="group" open>
            <summary>Bildrate</summary>
            <div class="group-body">
              <div class="field">
                <span class="field-label">Ziel</span>
                <div class="seg" role="radiogroup" aria-label="Bildrate">
                  ${FPS_MODES.map(
                    (mode) =>
                      `<button type="button" data-fps="${mode}">${mode === "auto" ? "Auto" : mode}</button>`,
                  ).join("")}
                </div>
              </div>
              <label class="field field--row">
                <span>FPS-Anzeige</span>
                <input type="checkbox" id="show-fps" />
              </label>
              <p class="hint">Höchstens 60 oder 120. Auto folgt dem Display bis 120. Der Chip zählt echte Frames.</p>
            </div>
          </details>

          <details class="group" open>
            <summary>Qualität</summary>
            <div class="group-body">
              <div class="field">
                <span class="field-label">Stufe</span>
                <div class="seg" role="radiogroup" aria-label="Qualität">
                  <button type="button" data-quality="low">Niedrig</button>
                  <button type="button" data-quality="medium">Mittel</button>
                  <button type="button" data-quality="high">Hoch</button>
                </div>
              </div>
              <p class="hint" id="quality-hint">Niedrig spart Dichte und Leuchten. Mobil startet auf Niedrig.</p>
              <p class="hint hint--note" id="orb-note" hidden>
                Lichtinsel in 3D braucht Mittel oder Hoch. Niedrig bleibt beim 2D-Stand-in.
              </p>
            </div>
          </details>

          <details class="group">
            <summary>Mehr</summary>
            <div class="group-body">
              <label class="field">
                <span class="field-label">FFT-Größe</span>
                <select data-key="fftSize">
                  ${FFT_SIZES.map((n) => `<option value="${n}">${n}</option>`).join("")}
                </select>
              </label>
              <details class="limits-fold">
                <summary>Eingänge und Grenzen</summary>
                <ul>
                  <li>Nur Mikrofone vom Gerät und Dateien. Tab/System nur Desktop-Chrome — im Teilen-Dialog den Haken „Audio teilen“ setzen.</li>
                  <li>Bluetooth-Wiedergabe (Spotify, A2DP) ist kein Eingang. Der Browser kann sie nicht anzapfen.</li>
                  <li>Headset-Mikrofon kann den Anrufmodus (SCO) erzwingen. Dann Telefonmikrofon wählen oder eine Datei nehmen.</li>
                </ul>
              </details>
              <button type="button" class="reset" data-act="reset">Auf Standard zurücksetzen</button>
            </div>
          </details>
        </div>
      </aside>
    </div>

    <input id="file" type="file" accept="${FILE_ACCEPT}" hidden />
    <div class="toast" id="toast" role="status" hidden></div>
  `;

  const canvas = must(parent, "#viz", HTMLCanvasElement);
  const fileInput = must(parent, "#file", HTMLInputElement);
  const panelRoot = must(parent, "#panel-root", HTMLElement);
  const panel = must(parent, "#panel", HTMLElement);
  const panelHead = must(parent, "#panel-head", HTMLElement);
  const collapseBtn = must(parent, "#collapse-panel", HTMLButtonElement);
  const toastEl = must(parent, "#toast", HTMLElement);
  const sourceLine = must(parent, "#source-line", HTMLElement);
  const devicePick = must(parent, "#device-pick", HTMLElement);
  const deviceSelect = must(parent, "#mic-device", HTMLSelectElement);
  const presetChip = must(parent, "#preset-chip", HTMLButtonElement);
  const presetSwitch = must(parent, "#preset-switch", HTMLElement);
  const firstRun = must(parent, "#first-run", HTMLElement);
  const floor = must(parent, "#floor", HTMLElement);
  const dropVeil = must(parent, "#drop-veil", HTMLElement);
  const fpsHud = must(parent, "#fps-hud", HTMLElement);
  const fpsReadout = must(parent, "#fps-readout", HTMLElement);
  const showFpsInput = must(parent, "#show-fps", HTMLInputElement);
  const sensitivitySlider = must(parent, "#sensitivity-slider", HTMLInputElement);
  const sensitivityAutoBtn = must(parent, "[data-act=sensitivity-auto]", HTMLButtonElement);
  const peakEl = must(parent, "#m-peak", HTMLElement);
  const rmsEl = must(parent, "#m-rms", HTMLElement);
  const lowEl = must(parent, "#b-low", HTMLElement);
  const midEl = must(parent, "#b-mid", HTMLElement);
  const highEl = must(parent, "#b-high", HTMLElement);
  let lastPeak = "";
  let lastRms = "";
  let lastFps = "";
  let lastSource = "";

  const toast = (message: string) => {
    toastEl.textContent = message;
    toastEl.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.hidden = true;
    }, 4800);
  };

  const paintDevices = () => {
    const named = inputs.filter((item) => item.deviceId);
    const visible = named.some((item) => item.rawLabel.length > 0);
    devicePick.hidden = !visible;
    if (!visible) return;

    const current = pickedDeviceId || lab.deviceId;
    deviceSelect.replaceChildren();
    for (const item of named) {
      const option = document.createElement("option");
      option.value = item.deviceId;
      option.textContent = item.label;
      deviceSelect.append(option);
    }
    if (current && named.some((item) => item.deviceId === current)) {
      deviceSelect.value = current;
      pickedDeviceId = current;
    } else {
      pickedDeviceId = named[0]?.deviceId ?? "";
      if (pickedDeviceId) deviceSelect.value = pickedDeviceId;
    }
  };

  const refreshDevices = async () => {
    try {
      inputs = await listAudioInputs();
      const granted = inputs.some((item) => item.rawLabel.length > 0) || (await microphonePermissionGranted());
      if (granted) paintDevices();
    } catch {
      /* enumerateDevices can fail before any gesture */
    }
  };

  const paintBand = (el: HTMLElement, unit: number) => {
    el.style.transform = `scaleX(${Math.min(1, Math.max(0.04, unit))})`;
  };

  const refreshMeters = () => {
    const { peak, rms, low, mid, high } = lab.metrics;
    const peakText = peak.toFixed(2);
    const rmsText = rms.toFixed(2);
    if (peakText !== lastPeak) {
      peakEl.textContent = peakText;
      lastPeak = peakText;
    }
    if (rmsText !== lastRms) {
      rmsEl.textContent = rmsText;
      lastRms = rmsText;
    }
    paintBand(lowEl, low);
    paintBand(midEl, mid);
    paintBand(highEl, high);
  };

  const refreshSource = () => {
    const text = sourceHudText(lab.kind, lab.label);
    if (text !== lastSource) {
      sourceLine.textContent = text;
      sourceLine.title = text;
      lastSource = text;
    }
    sourceLine.classList.toggle("is-idle", lab.kind === "none");
  };

  const refreshHud = () => {
    refreshMeters();
    refreshSource();
    paintChrome();
  };

  const setFps = (label: string) => {
    if (label === lastFps) return;
    lastFps = label;
    fpsReadout.textContent = label;
  };

  let lastSensText = "";
  const paintSensitivity = (gain: number, auto: boolean) => {
    const text = auto ? `${gain.toFixed(2)} · Auto` : gain.toFixed(2);
    if (text !== lastSensText) {
      lastSensText = text;
      setText(parent, "#v-sensitivity", text);
    }
  };

  const applyHud = (next: typeof hudPrefs) => {
    hudPrefs = next;
    saveHud(hudPrefs);
    fpsHud.hidden = !hudPrefs.showFps;
    showFpsInput.checked = hudPrefs.showFps;
  };

  const paintChrome = () => {
    const show = shouldShowOnboard(onboard.seen, lab.kind);
    firstRun.hidden = !show;
    floor.hidden = show;
    parent.classList.toggle("is-onboard", show);
    parent.classList.toggle("has-dock", !show);
  };

  const markOnboardSeen = () => {
    if (onboard.seen) {
      paintChrome();
      return;
    }
    onboard = { seen: true };
    saveOnboard(onboard);
    paintChrome();
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
    paintSensitivity(settings.sensitivity, settings.sensitivityAuto);
    setText(parent, "#v-smoothing", settings.smoothing.toFixed(2));
    setText(parent, "#v-bloom", settings.bloom.toFixed(2));
    setText(parent, "#v-barCount", String(settings.barCount));
    setText(parent, "#v-speed", settings.speed.toFixed(2));
    setText(parent, "#density-label", DENSITY_LABEL[settings.preset]);
    setText(parent, "#dock-preset", PRESET_LABEL[settings.preset]);
    setText(parent, "#panel-sub", PRESET_LABEL[settings.preset]);
    setText(parent, "#panel-preset", PRESET_LABEL[settings.preset]);
    setText(parent, "#preset-switch-hint", PRESET_HINT[settings.preset]);
    setText(parent, "#quality-hint", qualityHintFor(settings.quality, settings.preset));
    const orbNote = parent.querySelector<HTMLElement>("#orb-note");
    if (orbNote) {
      orbNote.hidden = settings.preset !== "orb" || settings.quality !== "low";
    }
    presetChip.textContent = PRESET_LABEL[settings.preset];
    canvas.setAttribute("aria-label", `${PRESET_LABEL[settings.preset]} Feld`);
    for (const btn of parent.querySelectorAll<HTMLButtonElement>("[data-quality]")) {
      btn.classList.toggle("is-on", btn.dataset.quality === settings.quality);
    }
    for (const btn of parent.querySelectorAll<HTMLButtonElement>("[data-preset]")) {
      btn.classList.toggle("is-on", btn.dataset.preset === settings.preset);
    }
    for (const btn of parent.querySelectorAll<HTMLButtonElement>("[data-fps]")) {
      btn.classList.toggle("is-on", btn.dataset.fps === settings.fpsMode);
    }
    sensitivitySlider.disabled = settings.sensitivityAuto;
    sensitivityAutoBtn.classList.toggle("is-on", settings.sensitivityAuto);
    sensitivityAutoBtn.setAttribute("aria-pressed", String(settings.sensitivityAuto));
    setText(
      parent,
      "#sensitivity-hint",
      settings.sensitivityAuto
        ? "Auto aktiv: leise anheben, laut zurücknehmen. Der Regler bleibt die Reserve."
        : "Von Hand, oder Auto folgt dem Pegel.",
    );
    showFpsInput.checked = hudPrefs.showFps;
    fpsHud.hidden = !hudPrefs.showFps;
  };

  const persist = (next: Settings) => {
    settings = commitSettings(settings, next);
    lab.applyTuning(settings.fftSize, settings.smoothing);
    syncForm();
  };

  const choosePreset = (preset: PresetId) => {
    if (preset === settings.preset) return;
    persist({ ...settings, preset });
  };

  const setPresetSwitch = (open: boolean) => {
    presetSwitch.hidden = !open;
    presetChip.setAttribute("aria-expanded", String(open));
    parent.classList.toggle("has-presets", open);
    if (open) {
      const current = presetSwitch.querySelector<HTMLButtonElement>("[data-preset].is-on");
      current?.focus({ preventScroll: true });
    }
  };

  const readInsets = (): SafeInsets => {
    const css = getComputedStyle(document.documentElement);
    const n = (name: string) => {
      const parsed = parseFloat(css.getPropertyValue(name));
      return Number.isFinite(parsed) ? parsed : 0;
    };
    return { top: n("--sat"), right: n("--sar"), bottom: n("--sab"), left: n("--sal") };
  };

  const applyPanelBox = (x: number, y: number, persistPos: boolean) => {
    const pos = clampPanelPosition(
      x,
      y,
      panel.offsetWidth,
      panel.offsetHeight,
      window.innerWidth,
      window.innerHeight,
      8,
      readInsets(),
    );
    panel.style.left = `${pos.x}px`;
    panel.style.top = `${pos.y}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    if (persistPos) {
      panelPrefs = { ...panelPrefs, x: pos.x, y: pos.y };
      savePanel(panelPrefs);
    }
  };

  const placePanel = (persistDefault = false) => {
    if (panelRoot.hidden) return;
    const savedX = panelPrefs.x;
    const savedY = panelPrefs.y;
    if (savedX == null || savedY == null) {
      const insets = readInsets();
      const pad = 12;
      applyPanelBox(
        window.innerWidth - panel.offsetWidth - pad - insets.right,
        pad + insets.top,
        persistDefault,
      );
      return;
    }
    applyPanelBox(savedX, savedY, false);
  };

  const applyCollapsed = (collapsed: boolean, persistPos = true) => {
    panelPrefs = { ...panelPrefs, collapsed };
    panel.classList.toggle("is-collapsed", collapsed);
    collapseBtn.setAttribute("aria-expanded", String(!collapsed));
    collapseBtn.textContent = collapsed ? "Aufklappen" : "Zuklappen";
    if (persistPos) savePanel(panelPrefs);
    placePanel();
  };

  const setPanel = (open: boolean) => {
    panelRoot.hidden = !open;
    const toggle = parent.querySelector("[data-act=panel]");
    toggle?.setAttribute("aria-expanded", String(open));
    parent.classList.toggle("has-panel", open);
    if (!open) return;
    applyCollapsed(false, true);
    placePanel();
    panel.focus({ preventScroll: true });
  };

  let dragging = false;
  let dragMoved = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOriginX = 0;
  let dragOriginY = 0;

  panelHead.addEventListener("pointerdown", (event) => {
    if ((event.target as HTMLElement).closest("button")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    dragging = true;
    dragMoved = false;
    panelHead.setPointerCapture(event.pointerId);
    const rect = panel.getBoundingClientRect();
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragOriginX = rect.left;
    dragOriginY = rect.top;
  });

  panelHead.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - dragStartX;
    const dy = event.clientY - dragStartY;
    if (!dragMoved && dx * dx + dy * dy < DRAG_SLOP * DRAG_SLOP) return;
    if (!dragMoved) {
      dragMoved = true;
      panel.classList.add("is-dragging");
    }
    applyPanelBox(dragOriginX + dx, dragOriginY + dy, false);
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove("is-dragging");
    if (!dragMoved) return;
    const rect = panel.getBoundingClientRect();
    applyPanelBox(rect.left, rect.top, true);
  };

  panelHead.addEventListener("pointerup", endDrag);
  panelHead.addEventListener("pointercancel", endDrag);

  panelHead.addEventListener("dblclick", (event) => {
    if ((event.target as HTMLElement).closest("button")) return;
    applyCollapsed(!panelPrefs.collapsed);
  });

  const onViewport = () => {
    placePanel();
  };
  window.addEventListener("resize", onViewport);
  window.visualViewport?.addEventListener("resize", onViewport);

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!presetSwitch.hidden) {
      setPresetSwitch(false);
      return;
    }
    if (!panelRoot.hidden) {
      setPanel(false);
      return;
    }
    if (!firstRun.hidden) {
      markOnboardSeen();
    }
  });

  const openFile = () => {
    fileInput.click();
  };

  const playFile = (file: File) => {
    void runInput(() => lab.startFile(file, settings.fftSize, settings.smoothing), `Datei: ${file.name}`);
  };

  parent.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-act], [data-quality], [data-preset], [data-fps]",
    );
    if (!btn) {
      if ((event.target as HTMLElement) === presetSwitch) {
        setPresetSwitch(false);
      }
      return;
    }
    const act = btn.dataset.act;
    const quality = btn.dataset.quality;
    const preset = btn.dataset.preset;
    const fpsMode = btn.dataset.fps;
    if (quality === "low" || quality === "medium" || quality === "high") {
      persist({ ...settings, quality });
      return;
    }
    if (fpsMode === "60" || fpsMode === "120" || fpsMode === "auto") {
      persist({ ...settings, fpsMode });
      return;
    }
    if (isPreset(preset)) {
      choosePreset(preset);
      setPresetSwitch(false);
      return;
    }
    if (act === "sensitivity-auto") {
      persist({ ...settings, sensitivityAuto: !settings.sensitivityAuto });
      return;
    }
    if (act === "presets") setPresetSwitch(presetSwitch.hidden);
    if (act === "close-presets") setPresetSwitch(false);
    if (act === "skip-onboard") markOnboardSeen();
    if (act === "panel") setPanel(panelRoot.hidden);
    if (act === "close-panel") setPanel(false);
    if (act === "collapse-panel") applyCollapsed(!panelPrefs.collapsed);
    if (act === "reset") {
      settings = resetSettings(settings.preset);
      lab.applyTuning(settings.fftSize, settings.smoothing);
      syncForm();
      toast(`Einstellungen auf Standard von ${PRESET_LABEL[settings.preset]} zurückgesetzt.`);
    }
    if (act === "stop") {
      lab.stop();
      refreshHud();
    }
    if (act === "file") openFile();
    if (act === "mic") {
      void startMic();
    }
    if (act === "tab") {
      if (!tabOk) {
        toast("Tab-/System-Audio gibt es nur auf Desktop-Chrome. Handy: Mikrofon oder Datei.");
        return;
      }
      toast("Chrome-Dialog: Tab oder Bildschirm wählen und „Tab-Audio teilen“ / „Systemaudio“ anhaken.");
      void runInput(
        () => lab.startTab(settings.fftSize, settings.smoothing),
        "Tab-/Systemton verbunden.",
        "Teilen abgebrochen oder verweigert.",
      );
    }
  });

  parent.addEventListener("input", (event) => {
    const el = event.target as HTMLInputElement | HTMLSelectElement;
    if (el === deviceSelect) {
      pickedDeviceId = deviceSelect.value;
      if (lab.kind === "mic" || lab.kind === "none") {
        void startMic();
      }
      return;
    }
    if (el === showFpsInput) {
      applyHud({ showFps: showFpsInput.checked });
      return;
    }
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
    playFile(file);
  });

  const setDrop = (on: boolean) => {
    dropVeil.hidden = !on;
  };

  parent.addEventListener("dragenter", (event) => {
    if (hasAudioFile(event.dataTransfer)) {
      event.preventDefault();
      setDrop(true);
    }
  });
  parent.addEventListener("dragover", (event) => {
    if (hasAudioFile(event.dataTransfer)) {
      event.preventDefault();
      setDrop(true);
    }
  });
  parent.addEventListener("dragleave", (event) => {
    if (event.target === parent || event.target === dropVeil) setDrop(false);
  });
  parent.addEventListener("drop", (event) => {
    event.preventDefault();
    setDrop(false);
    const file = [...(event.dataTransfer?.files ?? [])].find((item) => isAudioLike(item));
    if (file) playFile(file);
    else toast("Eine Audiodatei ablegen (MP3, WAV, OGG …).");
  });

  navigator.mediaDevices?.addEventListener("devicechange", () => {
    void refreshDevices();
  });

  async function startMic(): Promise<void> {
    const id = pickedDeviceId || undefined;
    await runInput(async () => {
      if (id) {
        await lab.startMic(settings.fftSize, settings.smoothing, id);
      } else {
        await lab.startMic(settings.fftSize, settings.smoothing);
      }
      pickedDeviceId = lab.deviceId || pickedDeviceId;
      await refreshDevices();
    }, "Mikrofon verbunden.");
    if (lab.kind === "mic" && lab.bluetoothLikely) {
      toast(SCO_HINT);
    }
  }

  async function runInput(fn: () => Promise<void>, ok: string, denied?: string): Promise<void> {
    try {
      await fn();
      if (lab.kind !== "none") {
        markOnboardSeen();
      }
      if (!(lab.kind === "mic" && lab.bluetoothLikely)) {
        toast(ok);
      }
    } catch (error) {
      toast(friendlyInputError(error, denied));
    }
    refreshHud();
  }

  syncForm();
  refreshHud();
  void refreshDevices();

  return {
    root: parent,
    canvas,
    getSettings: () => settings,
    setSettings: persist,
    lab,
    fileInput,
    toast,
    refreshHud,
    refreshMeters,
    setFps,
    paintSensitivity,
  };
}

function friendlyInputError(error: unknown, denied?: string): string {
  const name = error instanceof DOMException ? error.name : "";
  const message = error instanceof Error ? error.message : "Eingang fehlgeschlagen.";
  const lower = message.toLowerCase();
  if (name === "AbortError" || lower.includes("abort") || lower.includes("cancel")) {
    return denied ?? "Auswahl abgebrochen.";
  }
  if (name === "NotAllowedError" || lower.includes("denied") || lower.includes("notallowed")) {
    return denied ?? "Zugriff wurde verweigert.";
  }
  if (name === "NotFoundError" || lower.includes("not found") || lower.includes("notfound")) {
    return "Kein passendes Gerät gefunden.";
  }
  if (name === "NotReadableError" || lower.includes("not readable")) {
    return "Gerät ist belegt oder nicht lesbar.";
  }
  if (name === "OverconstrainedError") {
    return "Dieses Gerät erfüllt die Audio-Anforderungen nicht.";
  }
  if (name === "SecurityError") {
    return "Zugriff blockiert. HTTPS oder localhost nötig.";
  }
  return message;
}

function hasAudioFile(transfer: DataTransfer | null): boolean {
  if (!transfer) return false;
  if ([...transfer.items].some((item) => item.kind === "file" && item.type.startsWith("audio/"))) {
    return true;
  }
  return [...transfer.types].includes("Files");
}

function isAudioLike(file: File): boolean {
  return file.type.startsWith("audio/") || /\.(mp3|wav|ogg|oga|m4a|flac|aac|opus|webm)$/i.test(file.name);
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

function qualityHintFor(quality: Quality, preset: PresetId): string {
  if (preset === "orb") {
    if (quality === "low") {
      return "Niedrig: 2D-Stand-in, kein Three.js — Mobil bleibt damit nutzbar. Mittel oder Hoch schaltet die weiche 3D-Kugel ein.";
    }
    if (quality === "medium") {
      return "Mittel: 3D an, ohne schweren Bloom-Pass. Weniger Facetten und Punkte als Hoch.";
    }
    return "Hoch: volle 3D-Lichtinsel, Bloom-Pass, mehr Facetten und Punkte.";
  }
  if (quality === "low") {
    return "Niedrig: halbe Dichte, schwächeres Leuchten, Auflösung 1×. Mobil startet hier.";
  }
  if (quality === "medium") {
    return "Mittel: mehr Balken, Speichen, Partikel und Zellen, mittleres Leuchten.";
  }
  return "Hoch: volle Auflösung, Leuchten und Anzahlen.";
}
