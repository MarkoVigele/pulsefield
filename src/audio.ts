import type { FftSize } from "./settings";

export type InputKind = "mic" | "tab" | "file" | "none";

export type AudioMetrics = {
  peak: number;
  rms: number;
  low: number;
  mid: number;
  high: number;
};

export type AudioSnapshot = AudioMetrics & {
  frequency: Uint8Array<ArrayBuffer>;
  time: Uint8Array<ArrayBuffer>;
  sampleRate: number;
  fftSize: number;
};

const EMPTY_METRICS: AudioMetrics = { peak: 0, rms: 0, low: 0, mid: 0, high: 0 };

export function canUseMicrophone(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function canCaptureTab(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);
}

export class AudioLab {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private inputGain: GainNode | null = null;
  private sourceNode: AudioNode | null = null;
  private stream: MediaStream | null = null;
  private mediaEl: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private freq = new Uint8Array(0);
  private wave = new Uint8Array(0);

  kind: InputKind = "none";
  label = "Kein Eingang";
  lastError: string | null = null;
  metrics: AudioMetrics = { ...EMPTY_METRICS };

  async ensureGraph(fftSize: FftSize, smoothing: number): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.inputGain = this.ctx.createGain();
      this.inputGain.gain.value = 1;
      this.inputGain.connect(this.analyser);
    }
    this.applyTuning(fftSize, smoothing);
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  applyTuning(fftSize: FftSize, smoothing: number): void {
    if (!this.analyser) return;
    if (this.analyser.fftSize !== fftSize) {
      this.analyser.fftSize = fftSize;
    }
    this.analyser.smoothingTimeConstant = smoothing;
    this.analyser.minDecibels = -90;
    this.analyser.maxDecibels = -18;
    if (this.freq.length !== this.analyser.frequencyBinCount) {
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
      this.wave = new Uint8Array(this.analyser.fftSize);
    }
  }

  get snapshot(): AudioSnapshot {
    return {
      ...this.metrics,
      frequency: this.freq,
      time: this.wave,
      sampleRate: this.ctx?.sampleRate ?? 44100,
      fftSize: this.analyser?.fftSize ?? 2048,
    };
  }

  sample(): AudioSnapshot {
    if (this.analyser && this.freq.length > 0) {
      this.analyser.getByteFrequencyData(this.freq);
      this.analyser.getByteTimeDomainData(this.wave);
      this.metrics = measure(this.freq, this.wave, this.ctx?.sampleRate ?? 44100);
    } else {
      this.metrics = { ...EMPTY_METRICS };
    }
    return this.snapshot;
  }

  async startMic(fftSize: FftSize, smoothing: number): Promise<void> {
    if (!canUseMicrophone()) {
      throw new Error("Mikrofon ist in diesem Browser nicht verfügbar.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
    await this.connectStream(stream, "mic", "Mikrofon", fftSize, smoothing, false);
  }

  async startTab(fftSize: FftSize, smoothing: number): Promise<void> {
    if (!canCaptureTab()) {
      throw new Error("Tab-/Systemton ist in diesem Browser nicht verfügbar.");
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 1, width: 16, height: 16 },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        // Chrome uses this extra flag in some versions
        suppressLocalAudioPlayback: false,
      } as MediaTrackConstraints,
    });

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error(
        "Kein Audio im geteilten Stream. Bitte einen Tab wählen und „Tab-Audio teilen“ aktivieren.",
      );
    }

    audioTracks[0]?.addEventListener("ended", () => {
      if (this.stream === stream) {
        this.stop();
        this.label = "Tab beendet";
      }
    });

    await this.connectStream(stream, "tab", "Tab / System", fftSize, smoothing, false);
  }

  async startFile(file: File, fftSize: FftSize, smoothing: number): Promise<void> {
    await this.ensureGraph(fftSize, smoothing);
    this.detachSource();

    const el = new Audio();
    el.preload = "auto";
    el.loop = true;
    el.crossOrigin = "anonymous";
    const url = URL.createObjectURL(file);
    el.src = url;

    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Die Datei ließ sich nicht lesen."));
      };
      const cleanup = () => {
        el.removeEventListener("canplay", onReady);
        el.removeEventListener("error", onError);
      };
      el.addEventListener("canplay", onReady, { once: true });
      el.addEventListener("error", onError, { once: true });
      void el.play().catch(() => {
        /* play may wait for canplay */
      });
    });

    if (!this.ctx || !this.inputGain) {
      throw new Error("Audiograph ist nicht bereit.");
    }

    const node = this.ctx.createMediaElementSource(el);
    node.connect(this.inputGain);
    node.connect(this.ctx.destination);

    this.sourceNode = node;
    this.mediaEl = el;
    this.objectUrl = url;
    this.kind = "file";
    this.label = file.name;
    this.lastError = null;
    await el.play();
  }

  stop(): void {
    this.detachSource();
    this.kind = "none";
    this.label = "Kein Eingang";
    this.metrics = { ...EMPTY_METRICS };
  }

  private async connectStream(
    stream: MediaStream,
    kind: InputKind,
    label: string,
    fftSize: FftSize,
    smoothing: number,
    hearThrough: boolean,
  ): Promise<void> {
    await this.ensureGraph(fftSize, smoothing);
    this.detachSource();
    if (!this.ctx || !this.inputGain) {
      throw new Error("Audiograph ist nicht bereit.");
    }
    const node = this.ctx.createMediaStreamSource(stream);
    node.connect(this.inputGain);
    if (hearThrough) {
      this.inputGain.connect(this.ctx.destination);
    }
    this.sourceNode = node;
    this.stream = stream;
    this.kind = kind;
    this.label = label;
    this.lastError = null;
  }

  private detachSource(): void {
    this.sourceNode?.disconnect();
    this.sourceNode = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.mediaEl) {
      this.mediaEl.pause();
      this.mediaEl.src = "";
      this.mediaEl = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}

function measure(
  frequency: Uint8Array,
  time: Uint8Array,
  sampleRate: number,
): AudioMetrics {
  let peak = 0;
  let sumSq = 0;
  for (let i = 0; i < time.length; i += 1) {
    const sample = ((time[i] ?? 128) - 128) / 128;
    peak = Math.max(peak, Math.abs(sample));
    sumSq += sample * sample;
  }
  const rms = time.length ? Math.sqrt(sumSq / time.length) : 0;

  const nyquist = sampleRate / 2;
  const binHz = frequency.length ? nyquist / frequency.length : 1;
  const low = bandMean(frequency, binHz, 20, 250);
  const mid = bandMean(frequency, binHz, 250, 2000);
  const high = bandMean(frequency, binHz, 2000, 16000);

  return { peak, rms, low, mid, high };
}

function bandMean(frequency: Uint8Array, binHz: number, fromHz: number, toHz: number): number {
  const start = Math.max(0, Math.floor(fromHz / binHz));
  const end = Math.min(frequency.length, Math.ceil(toHz / binHz));
  if (end <= start) return 0;
  let sum = 0;
  for (let i = start; i < end; i += 1) {
    sum += frequency[i] ?? 0;
  }
  return sum / (end - start) / 255;
}
