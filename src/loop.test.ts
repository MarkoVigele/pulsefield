import assert from "node:assert/strict";
import { test } from "node:test";
import { createPace, formatFps, frameMsFor, stepPace, type FpsMode } from "./loop.ts";

function runTicks(hz: number, seconds: number, mode: FpsMode, displayHz?: number): { renders: number; fps: number } {
  const state = createPace(0, mode, displayHz ?? hz);
  let renders = 0;
  const ticks = Math.round(hz * seconds);
  const step = 1000 / hz;
  for (let i = 1; i <= ticks; i += 1) {
    if (stepPace(state, i * step, mode)) renders += 1;
  }
  return { renders, fps: state.fps };
}

test("120 Hz callbacks with mode 60 draw at most 60 frames per second", () => {
  const { renders } = runTicks(120, 1, "60");
  assert.equal(renders, 60);
});

test("120 Hz callbacks with mode 120 draw every tick", () => {
  const { renders } = runTicks(120, 1, "120");
  assert.equal(renders, 120);
});

test("60 Hz callbacks with mode 120 still draw only 60 — no fake frames", () => {
  const { renders } = runTicks(60, 1, "120");
  assert.equal(renders, 60);
});

test("30 Hz vsync cannot invent extra frames", () => {
  const { renders } = runTicks(30, 1, "120");
  assert.equal(renders, 30);
});

test("Auto follows a 60 Hz panel", () => {
  const { renders } = runTicks(60, 1, "auto", 60);
  assert.equal(renders, 60);
});

test("Auto follows a 120 Hz panel", () => {
  const { renders } = runTicks(120, 1, "auto", 120);
  assert.equal(renders, 120);
});

test("Auto caps a 144 Hz panel at 120", () => {
  const { renders } = runTicks(144, 1, "auto", 144);
  assert.equal(renders, 120);
});

test("a long hitch draws once instead of catching up", () => {
  const frameMs = frameMsFor("60");
  const state = createPace(0, "60");
  assert.equal(stepPace(state, frameMs, "60"), true);
  assert.equal(stepPace(state, frameMs + 800, "60"), true);
  assert.equal(stepPace(state, frameMs + 800 + frameMs, "60"), true);
});

test("fps is measured from drawn frames, not rAF callbacks", () => {
  const { fps } = runTicks(120, 1, "60");
  assert.ok(fps >= 59 && fps <= 61, `expected ~60, got ${fps}`);
});

test("mode 120 reports ~120 drawn fps on a 120 Hz cadence", () => {
  const { fps } = runTicks(120, 1, "120");
  assert.ok(fps >= 118 && fps <= 122, `expected ~120, got ${fps}`);
});

test("formatFps uses lab wording", () => {
  assert.equal(formatFps(0), "— fps");
  assert.equal(formatFps(59.6), "60 fps");
  assert.equal(formatFps(119.4), "119 fps");
  assert.equal(formatFps(29.2), "29 fps");
});
