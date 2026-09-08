/** Target draw rate. Quality High may raise this later; default stays 60. */
export const TARGET_FPS = 60;
export const FRAME_MS = 1000 / TARGET_FPS;
export const FPS_WINDOW_MS = 500;
/** Slack so 60 Hz vsync (≈16.6 ms) still hits a 16.666… deadline. */
const SLACK_MS = 0.75;

export type PaceState = {
  next: number;
  renders: number;
  windowStart: number;
  fps: number;
};

export function createPace(now = 0): PaceState {
  return { next: now + FRAME_MS, renders: 0, windowStart: now, fps: 0 };
}

/**
 * Advance with a vsync timestamp.
 * Returns true when a frame should be drawn. At most one draw per callback —
 * we cap at 60 and never catch up with extra work after a hitch.
 */
export function stepPace(state: PaceState, now: number): boolean {
  if (!Number.isFinite(now)) return false;

  let rendered = false;
  if (now + SLACK_MS >= state.next) {
    state.next += FRAME_MS;
    if (state.next < now - FRAME_MS) {
      state.next = now + FRAME_MS;
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
