export const FPS_MODES = ["60", "120", "auto"] as const;
export type FpsMode = (typeof FPS_MODES)[number];
export const DEFAULT_FPS_MODE: FpsMode = "120";
/** Hard cap for 120 and Auto — never invent frames above the panel. */
export const FPS_CAP = 120;
export const FPS_WINDOW_MS = 500;
export const DISPLAY_WINDOW_MS = 500;
/** Slack so 60 Hz vsync (≈16.6 ms) still hits a 16.666… deadline. */
const SLACK_MS = 0.75;

export function isFpsMode(value: unknown): value is FpsMode {
  return value === "60" || value === "120" || value === "auto";
}

export function targetHzFor(mode: FpsMode, displayHz = FPS_CAP): number {
  if (mode === "60") return 60;
  if (mode === "120") return FPS_CAP;
  const hz = Number.isFinite(displayHz) && displayHz > 0 ? displayHz : FPS_CAP;
  return Math.min(FPS_CAP, Math.max(1, hz));
}

export function frameMsFor(mode: FpsMode, displayHz = FPS_CAP): number {
  return 1000 / targetHzFor(mode, displayHz);
}

export type PaceState = {
  next: number;
  renders: number;
  windowStart: number;
  fps: number;
  rafs: number;
  rafWindowStart: number;
  displayHz: number;
  mode: FpsMode;
  frameMs: number;
};

export function createPace(now = 0, mode: FpsMode = DEFAULT_FPS_MODE, displayHz = FPS_CAP): PaceState {
  const frameMs = frameMsFor(mode, displayHz);
  return {
    next: now + frameMs,
    renders: 0,
    windowStart: now,
    fps: 0,
    rafs: 0,
    rafWindowStart: now,
    displayHz,
    mode,
    frameMs,
  };
}

/**
 * Advance with a vsync timestamp.
 * Returns true when a frame should be drawn. At most one draw per callback —
 * we never catch up with extra work after a hitch. HUD fps counts draws only.
 */
export function stepPace(state: PaceState, now: number, mode: FpsMode = state.mode): boolean {
  if (!Number.isFinite(now)) return false;

  state.rafs += 1;
  const rafElapsed = now - state.rafWindowStart;
  if (rafElapsed >= DISPLAY_WINDOW_MS) {
    state.displayHz = (state.rafs * 1000) / rafElapsed;
    state.rafs = 0;
    state.rafWindowStart = now;
  }

  const nextMs = frameMsFor(mode, state.displayHz);
  if (mode !== state.mode) {
    state.mode = mode;
    state.frameMs = nextMs;
    state.next = now;
  } else {
    state.frameMs = nextMs;
  }

  let rendered = false;
  if (now + SLACK_MS >= state.next) {
    state.next += state.frameMs;
    if (state.next < now - state.frameMs) {
      state.next = now + state.frameMs;
    }
    state.renders += 1;
    rendered = true;
  }

  const elapsed = now - state.windowStart;
  if (elapsed >= FPS_WINDOW_MS) {
    state.fps = (state.renders * 1000) / elapsed;
    state.renders = 0;
    state.windowStart = now;
  }

  return rendered;
}

export function formatFps(fps: number): string {
  if (!(fps > 0)) return "— fps";
  return `${Math.round(fps)} fps`;
}
