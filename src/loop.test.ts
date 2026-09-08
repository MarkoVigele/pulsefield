import assert from "node:assert/strict";
import { test } from "node:test";
import { FRAME_MS, createPace, formatFps, stepPace } from "./loop.ts";

function runTicks(hz: number, seconds: number): { renders: number; fps: number } {
  const state = createPace(0);
  let renders = 0;
  const ticks = Math.round(hz * seconds);
  const step = 1000 / hz;
  for (let i = 1; i <= ticks; i += 1) {
    if (stepPace(state, i * step)) renders += 1;
  }
  return { renders, fps: state.fps };
}

test("120 Hz callbacks draw at most 60 frames per second", () => {
  const { renders } = runTicks(120, 1);
  assert.equal(renders, 60);
});

test("60 Hz callbacks draw every tick", () => {
  const { renders } = runTicks(60, 1);
  assert.equal(renders, 60);
});

test("30 Hz vsync cannot invent extra frames", () => {
  const { renders } = runTicks(30, 1);
  assert.equal(renders, 30);
});

test("a long hitch draws once instead of catching up", () => {
  const state = createPace(0);
  assert.equal(stepPace(state, FRAME_MS), true);
  assert.equal(stepPace(state, FRAME_MS + 800), true);
  assert.equal(stepPace(state, FRAME_MS + 800 + FRAME_MS), true);
});

test("fps is measured from drawn frames, not rAF callbacks", () => {
  const { fps } = runTicks(120, 1);
  assert.ok(fps >= 59 && fps <= 61, `expected ~60, got ${fps}`);
});

test("formatFps uses lab wording", () => {
  assert.equal(formatFps(0), "— fps");
  assert.equal(formatFps(59.6), "60 fps");
  assert.equal(formatFps(29.2), "29 fps");
});
