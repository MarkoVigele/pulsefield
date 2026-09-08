/** Device-listed audio inputs and honest platform limits. */

export type LabAudioInput = {
  deviceId: string;
  label: string;
  rawLabel: string;
  bluetoothLikely: boolean;
  communications: boolean;
};

export type DisplayMediaOptions = MediaStreamConstraints & {
  systemAudio?: "include" | "exclude";
  selfBrowserSurface?: "include" | "exclude";
  monitorTypeSurfaces?: "include" | "exclude";
  preferCurrentTab?: boolean;
};

const BT_RE =
  /bluetooth|\bbt\b|airpods|airpod|galaxy buds|pixel buds|hands.?free|\bhfp\b|\bsco\b|le-audio|headset/i;
const COMM_RE = /communication|kommunikations?gerät|\banruf\b/i;

export function looksLikeBluetooth(label: string): boolean {
  return BT_RE.test(label);
}

export function looksLikeCommunications(label: string, deviceId = ""): boolean {
  return deviceId === "communications" || COMM_RE.test(label);
}

/** Phones and tablets: Tab-Audio is not a real capture path. */
export function isPhoneLikeLab(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return true;
  if (/iPhone|iPod|iPad/i.test(ua)) return true;
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
  return false;
}

export function canUseMicrophone(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function canCaptureTabApi(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);
}

/** Offer Tab/System only where getDisplayMedia can actually carry audio. */
export function tabCaptureOffered(): boolean {
  return canCaptureTabApi() && !isPhoneLikeLab();
}

export function humanizeInputLabel(
  info: Pick<MediaDeviceInfo, "deviceId" | "label">,
  index: number,
): string {
  const raw = info.label.trim();
  if (info.deviceId === "default" || /^default\b/i.test(raw)) {
    const rest = raw.replace(/^default\s*[—–\-:]*\s*/i, "").trim();
    return rest && !/^default$/i.test(rest) ? `Standard · ${rest}` : "Standardmikrofon";
  }
  if (looksLikeCommunications(raw, info.deviceId)) {
    return raw ? `${raw} · Anrufprofil` : "Kommunikation · Anrufprofil";
  }
  if (raw) return raw;
  return `Mikrofon ${index + 1}`;
}

export function softMicConstraints(deviceId?: string): MediaTrackConstraints {
  const audio: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: { ideal: 2 },
    sampleRate: { ideal: 48000 },
  };
  Object.assign(audio, { voiceIsolation: false });
  if (deviceId) {
    audio.deviceId = { exact: deviceId };
  }
  return audio;
}

export function fallbackMicConstraints(deviceId?: string): MediaTrackConstraints {
  const audio: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
  if (deviceId) {
    audio.deviceId = { ideal: deviceId };
  }
  return audio;
}

export function displayMediaAttempts(): DisplayMediaOptions[] {
  const processedOff = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
  return [
    {
      video: { frameRate: 1, width: 16, height: 16 },
      audio: { ...processedOff, suppressLocalAudioPlayback: false } as MediaTrackConstraints,
      systemAudio: "include",
      monitorTypeSurfaces: "include",
      selfBrowserSurface: "exclude",
      preferCurrentTab: false,
    },
    {
      video: true,
      audio: processedOff,
      systemAudio: "include",
    },
    {
      video: true,
      audio: true,
    },
  ];
}

export function isUserGestureCancel(error: unknown): boolean {
  if (!(error instanceof DOMException)) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    return message.includes("abort") || message.includes("cancel") || message.includes("denied");
  }
  return error.name === "AbortError" || error.name === "NotAllowedError";
}

export function isOverconstrained(error: unknown): boolean {
  return error instanceof DOMException && error.name === "OverconstrainedError";
}

export async function listAudioInputs(): Promise<LabAudioInput[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all
    .filter((device) => device.kind === "audioinput")
    .map((device, index) => {
      const rawLabel = device.label;
      return {
        deviceId: device.deviceId,
        rawLabel,
        label: humanizeInputLabel(device, index),
        bluetoothLikely: looksLikeBluetooth(rawLabel),
        communications: looksLikeCommunications(rawLabel, device.deviceId),
      };
    });
}

export async function microphonePermissionGranted(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return status.state === "granted";
  } catch {
    const inputs = await listAudioInputs();
    return inputs.some((device) => device.rawLabel.length > 0);
  }
}

export const SCO_HINT =
  "Bluetooth-Headset als Mikrofon kann den Ton auf Anrufmodus (SCO/HFP) legen. Das System macht das, nicht Pulsefield. Telefonmikrofon wählen, wenn der Musikweg bleiben soll.";
