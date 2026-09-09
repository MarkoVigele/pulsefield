import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AGC_TARGET,
  SENSITIVITY_MAX,
  SENSITIVITY_MIN,
  createAgc,
  desiredGain,
  mixLevel,
  stepAgc,
} from "./agc.ts";

function run(opts: {
  rms: number;
  peak: number;
  enabled?: boolean;
  manual?: number;
  seconds: number;
  hz?: number;
  start?: number;
}): number {
  const state = createAgc(opts.start ?? opts.manual ?? 1.2);
  const hz = opts.hz ?? 60;
  const dt = 1 / hz;
  let gain = opts.start ?? opts.manual ?? 1.2;
  const ticks = Math.round(opts.seconds * hz);
  for (let i = 0; i < ticks; i += 1) {
    gain = stepAgc(state, {
      rms: opts.rms,
      peak: opts.peak,
      enabled: opts.enabled ?? true,
      manual: opts.manual ?? 1.2,
      dt,
    });
  }
  return gain;
}

test("Auto off returns the manual value and does not drift", () => {
  const state = createAgc(1.2);
  const first = stepAgc(state, { rms: 0.04, peak: 0.08, enabled: false, manual: 0.7, dt: 1 / 60 });
  const second = stepAgc(state, { rms: 0.5, peak: 0.9, enabled: false, manual: 0.7, dt: 1 / 60 });
  assert.equal(first, 0.7);
  assert.equal(second, 0.7);
  assert.equal(state.armed, false);
});

test("quiet Pegel raises sensitivity toward the ceiling", () => {
  const gain = run({ rms: 0.04, peak: 0.05, manual: 1.2, start: 1.2, seconds: 3 });
  assert.ok(gain > 2.2, `expected a boost, got ${gain}`);
  assert.ok(gain <= SENSITIVITY_MAX);
});

test("loud Pegel pulls sensitivity back", () => {
  const gain = run({ rms: 0.55, peak: 0.85, manual: 1.2, start: 2.4, seconds: 1 });
  assert.ok(gain < 1.2, `expected a pull-back, got ${gain}`);
  assert.ok(gain >= SENSITIVITY_MIN);
});

test("attack is faster than release", () => {
  const down = run({ rms: 0.7, peak: 0.95, start: 2.2, manual: 1.2, seconds: 0.2 });
  const up = run({ rms: 0.05, peak: 0.06, start: 0.6, manual: 1.2, seconds: 0.2 });
  const attackTravel = 2.2 - down;
  const releaseTravel = up - 0.6;
  assert.ok(attackTravel > releaseTravel, `attack ${attackTravel} vs release ${releaseTravel}`);
});

test("silence holds instead of slamming to max", () => {
  const state = createAgc(1.35);
  const gain = stepAgc(state, { rms: 0, peak: 0, enabled: true, manual: 1.35, dt: 1 / 60 });
  assert.equal(gain, 1.35);
  assert.equal(desiredGain(0), null);
});

test("desired gain stays inside the slider range", () => {
  assert.equal(desiredGain(mixLevel(0.01, 0.01)), null);
  assert.equal(desiredGain(AGC_TARGET), 1);
  assert.equal(desiredGain(2), SENSITIVITY_MIN);
  assert.equal(desiredGain(AGC_TARGET / 8), SENSITIVITY_MAX);
});

test("turning Auto off after adapting restores the stored manual value", () => {
  const state = createAgc(1.2);
  for (let i = 0; i < 90; i += 1) {
    stepAgc(state, { rms: 0.04, peak: 0.05, enabled: true, manual: 1.2, dt: 1 / 60 });
  }
  assert.ok(state.gain > 1.4);
  const back = stepAgc(state, { rms: 0.04, peak: 0.05, enabled: false, manual: 1.2, dt: 1 / 60 });
  assert.equal(back, 1.2);
});
