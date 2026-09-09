/** Manual Empfindlichkeit range — Auto stays inside the same bounds. */
export const SENSITIVITY_MIN = 0.2;
export const SENSITIVITY_MAX = 3;

/** Time-domain level the adapter aims for (mix of RMS and peak). */
export const AGC_TARGET = 0.18;
/** Below this the input is idle; we hold instead of slamming to max. */
export const AGC_FLOOR = 0.014;
/** Fast pull-back when the signal is too hot. */
export const AGC_ATTACK_S = 0.14;
/** Slow boost when the room or the track is quiet. */
export const AGC_RELEASE_S = 1.05;

export type AgcState = {
  gain: number;
  armed: boolean;
};

export function clampSensitivity(n: number): number {
  if (!Number.isFinite(n)) return 1.2;
  return Math.min(SENSITIVITY_MAX, Math.max(SENSITIVITY_MIN, n));
}

export function createAgc(manual = 1.2): AgcState {
  return { gain: clampSensitivity(manual), armed: false };
}

/** Peak catches transients; RMS is the sustained Pegel. */
export function mixLevel(rms: number, peak: number): number {
  const r = Math.max(0, Number.isFinite(rms) ? rms : 0);
  const p = Math.max(0, Number.isFinite(peak) ? peak : 0);
  return Math.max(r, r * 0.62 + p * 0.38);
}

export function desiredGain(level: number): number | null {
  if (!(level >= AGC_FLOOR)) return null;
  return clampSensitivity(AGC_TARGET / level);
}

export function stepAgc(
  state: AgcState,
  opts: {
    rms: number;
    peak: number;
    enabled: boolean;
    manual: number;
    dt: number;
  },
): number {
  const manual = clampSensitivity(opts.manual);
  if (!opts.enabled) {
    state.gain = manual;
    state.armed = false;
    return manual;
  }

  if (!state.armed) {
    state.gain = manual;
    state.armed = true;
  }

  const dt = Number.isFinite(opts.dt) ? Math.min(0.25, Math.max(0, opts.dt)) : 0;
  const want = desiredGain(mixLevel(opts.rms, opts.peak));
  if (want == null || dt <= 0) {
    return state.gain;
  }

  const tau = want < state.gain ? AGC_ATTACK_S : AGC_RELEASE_S;
  const alpha = 1 - Math.exp(-dt / tau);
  state.gain = clampSensitivity(state.gain + (want - state.gain) * alpha);
  return state.gain;
}
