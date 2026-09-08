import { AudioLab } from "./audio";
import {
  DENSITY_LABEL,
  PRESETS,
  PRESET_HINT,
  PRESET_LABEL,
  type PresetId,
} from "./presets";
import { isMobileLab } from "./quality";
import {
  BACKGROUNDS,
  FFT_SIZES,
  PALETTES,
  type Settings,
  commitSettings,
  loadSettings,
  resetSettings,
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
  lab: "Labor",
  grid: "Raster",
  dusk: "Dämmerung",
};

const FILE_ACCEPT = "audio/*,.mp3,.wav,.ogg,.oga,.m4a,.flac,.aac,.opus,.webm";

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
  let inputs: LabAudioInput[] = [];
  let pickedDeviceId = "";
  const tabOk = tabCaptureOffered();
  const micOk = canUseMicrophone();
  const phone = !tabOk;

  const presetOptions = PRESETS.map(
    (id) => `<option value="${id}">${PRESET_LABEL[id]}</option>`,
  ).join("");
  const presetButtons = PRESETS.map(
    (id) => `
      <button type="button" class="preset-btn" data-preset="${id}">
        <span>${PRESET_LABEL[id]}</span>
        <small>${PRESET_HINT[id]}</small>
      </button>`,
  ).join("");

  parent.innerHTML = `
    <canvas id="viz" class="viz" aria-label="Bars Classic Visualizer"></canvas>
    <div class="drop-veil" id="drop-veil" hidden>Audiodatei hier ablegen</div>
    <div class="chrome">
      <header class="hud">
        <div class="brand">
          <span class="mark">PF</span>
          <div>
            <strong>Pulsefield</strong>
            <label class="preset-inline">
              <span>Preset</span>
              <select id="preset-select" aria-label="Preset">
                ${presetOptions}
              </select>
            </label>
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

      <div class="source-stack">
        <p class="source-line" id="source-line">Kein Eingang · Labor bereit</p>
        <label class="device-pick" id="device-pick" hidden>
          <span>Quellen am Gerät</span>
          <select id="mic-device" aria-label="Mikrofon am Gerät"></select>
        </label>
        <p class="route-hint" id="route-hint" hidden></p>
      </div>

      <div class="floor">
        <aside class="limits" id="limits" role="note">
          <strong>Grenzen</strong>
          <ul>
            <li>Handy kann Spotify oder Bluetooth-Wiedergabe nicht abfangen. A2DP ist kein Mikrofon.</li>
            <li>Tab-/System-Audio nur Desktop-Chrome. Im Teilen-Dialog den Haken „Tab-Audio teilen“ / „Systemaudio“ setzen.</li>
            <li>Bluetooth-Headset kann Anruf-/SCO-Routing auslösen. Der Browser verhindert das nicht zuverlässig.</li>
          </ul>
        </aside>

        <nav class="dock" aria-label="Eingänge">
          <button type="button" class="dock-btn${phone ? " dock-btn--primary" : ""}" data-act="mic"${micOk ? "" : " disabled"}>
            Mikrofon
            <small>${micOk ? "Geräteliste nach Freigabe" : "Nicht verfügbar"}</small>
          </button>
          <button type="button" class="dock-btn dock-btn--file${phone ? " dock-btn--primary" : ""}" data-act="file">
            Datei
            <small>MP3, WAV, OGG · vom Gerät</small>
          </button>
          <button type="button" class="dock-btn${tabOk ? " dock-btn--primary" : ""}" data-act="tab"${tabOk ? "" : " disabled"} title="${tabOk ? "Chrome-Dialog: Audio teilen aktivieren" : "Nur Desktop-Chrome"}">
            Tab / System
            <small>${tabOk ? "Haken „Audio teilen“" : "Nur Desktop"}</small>
          </button>
          <button type="button" class="dock-btn dock-btn--ghost" data-act="stop">
            Stop
            <small>Eingang trennen</small>
          </button>
          <button type="button" class="dock-btn dock-btn--lab" data-act="sheet" aria-expanded="false" aria-controls="sheet">
            Labor
            <small id="lab-preset">Bars Classic</small>
          </button>
        </nav>
      </div>
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
          <fieldset class="presets">
            <legend>Preset</legend>
            <div class="preset-grid" role="radiogroup" aria-label="Preset">
              ${presetButtons}
            </div>
          </fieldset>

          <section class="limits limits--sheet">
            <strong>Eingänge und Grenzen</strong>
            <ul>
              <li>Wir listen nur Quellen, die das Gerät selbst als <code>audioinput</code> oder per Datei hergibt. Systemklang nur, wenn der Browser ihn wirklich anbietet (Desktop-Chrome: Tab/System).</li>
              <li>Spotify über Bluetooth-Lautsprecher ist keine Eingangsquelle. Browser können A2DP-Wiedergabe nicht anzapfen.</li>
              <li>Tab-Audio: Desktop-Chrome, Teilen-Dialog, Haken „Tab-Audio teilen“ oder „Systemaudio“. Ohne Haken bleibt das Feld still.</li>
              <li>Mikrofon: nach der Freigabe Gerät wählen. echoCancellation, noiseSuppression, autoGainControl und voiceIsolation stehen auf aus — der Anrufmodus kann das Betriebssystem trotzdem erzwingen, sobald ein Bluetooth-Headset als Mic dient.</li>
              <li>Datei: MP3, WAV, OGG, M4A, FLAC, AAC. Button, Dateidialog oder Datei auf das Feld ziehen.</li>
            </ul>
          </section>

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
            <span><span id="density-label">Balken</span> <b id="v-barCount"></b></span>
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
            <p class="hint">Niedrig spart Speichen, Partikel und Zellen. Mobil startet auf Niedrig.</p>
          </fieldset>

          <button type="button" class="reset" data-act="reset">Auf Standard zurücksetzen</button>
        </div>
      </aside>
    </div>

    <input id="file" type="file" accept="${FILE_ACCEPT}" hidden />
    <div class="toast" id="toast" role="status" hidden></div>
  `;

  const canvas = must(parent, "#viz", HTMLCanvasElement);
  const fileInput = must(parent, "#file", HTMLInputElement);
  const sheetRoot = must(parent, "#sheet-root", HTMLElement);
  const toastEl = must(parent, "#toast", HTMLElement);
  const sourceLine = must(parent, "#source-line", HTMLElement);
  const devicePick = must(parent, "#device-pick", HTMLLabelElement);
  const deviceSelect = must(parent, "#mic-device", HTMLSelectElement);
  const presetSelect = must(parent, "#preset-select", HTMLSelectElement);
  const routeHint = must(parent, "#route-hint", HTMLElement);
  const dropVeil = must(parent, "#drop-veil", HTMLElement);

  const toast = (message: string) => {
    toastEl.textContent = message;
    toastEl.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.hidden = true;
    }, 4800);
  };

  const selectedInput = (): LabAudioInput | undefined =>
    inputs.find((item) => item.deviceId === pickedDeviceId) ?? inputs[0];

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
    syncRouteHint();
  };

  const syncRouteHint = () => {
    const choice = selectedInput();
    const fromLab = lab.kind === "mic" && lab.bluetoothLikely;
    const fromPick = Boolean(choice?.bluetoothLikely || choice?.communications);
    if (fromLab || fromPick) {
      routeHint.hidden = false;
      routeHint.textContent = SCO_HINT;
    } else {
      routeHint.hidden = true;
      routeHint.textContent = "";
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

  const refreshHud = () => {
    const { peak, rms, low, mid, high } = lab.metrics;
    setText(parent, "#m-peak", peak.toFixed(2));
    setText(parent, "#m-rms", rms.toFixed(2));
    setWidth(parent, "#b-low", low);
    setWidth(parent, "#b-mid", mid);
    setWidth(parent, "#b-high", high);
    const idle = lab.kind === "none";
    const mobileNote = isMobileLab() && idle ? " · Mobil: Qualität Niedrig" : "";
    const idleHint = idle ? " · Mic, Datei oder Tab (Desktop)" : "";
    sourceLine.textContent = `${lab.label}${idle && lab.label === "Kein Eingang" ? idleHint : ""}${mobileNote}`;
    syncRouteHint();
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
    setText(parent, "#density-label", DENSITY_LABEL[settings.preset]);
    setText(parent, "#lab-preset", PRESET_LABEL[settings.preset]);
    presetSelect.value = settings.preset;
    canvas.setAttribute("aria-label", `${PRESET_LABEL[settings.preset]} Visualizer`);
    for (const btn of parent.querySelectorAll<HTMLButtonElement>("[data-quality]")) {
      btn.classList.toggle("is-on", btn.dataset.quality === settings.quality);
    }
    for (const btn of parent.querySelectorAll<HTMLButtonElement>("[data-preset]")) {
      btn.classList.toggle("is-on", btn.dataset.preset === settings.preset);
    }
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

  const setSheet = (open: boolean) => {
    sheetRoot.hidden = !open;
    document.body.classList.toggle("sheet-open", open);
    const toggle = parent.querySelector("[data-act=sheet]");
    toggle?.setAttribute("aria-expanded", String(open));
  };

  const openFile = () => {
    fileInput.click();
  };

  const playFile = (file: File) => {
    void runInput(() => lab.startFile(file, settings.fftSize, settings.smoothing), `Datei: ${file.name}`);
  };

  parent.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-act], [data-quality], [data-preset]",
    );
    if (!btn) return;
    const act = btn.dataset.act;
    const quality = btn.dataset.quality;
    const preset = btn.dataset.preset;
    if (quality === "low" || quality === "medium" || quality === "high") {
      persist({ ...settings, quality });
      return;
    }
    if (preset === "bars" || preset === "ring" || preset === "ribbon" || preset === "particles" || preset === "bloom") {
      choosePreset(preset);
      return;
    }
    if (act === "sheet") setSheet(sheetRoot.hidden);
    if (act === "close-sheet") setSheet(false);
    if (act === "reset") {
      settings = resetSettings(settings.preset);
      lab.applyTuning(settings.fftSize, settings.smoothing);
      syncForm();
      toast(`Labor auf Standard von ${PRESET_LABEL[settings.preset]} zurückgesetzt.`);
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
      syncRouteHint();
      if (lab.kind === "mic" || lab.kind === "none") {
        void startMic();
      }
      return;
    }
    if (el === presetSelect) {
      const next = presetSelect.value as PresetId;
      if (next === "bars" || next === "ring" || next === "ribbon" || next === "particles" || next === "bloom") {
        choosePreset(next);
      }
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

function setWidth(root: ParentNode, sel: string, unit: number): void {
  const el = root.querySelector<HTMLElement>(sel);
  if (el) el.style.transform = `scaleX(${Math.min(1, Math.max(0.04, unit))})`;
}
