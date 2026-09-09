import assert from "node:assert/strict";
import { test } from "node:test";
import {
  QUALITY_PROFILE,
  bloomScaleFor,
  countScaleFor,
  particleBudget,
  qualityCost,
  scaledDensity,
  threeDEnabled,
} from "./quality.ts";

test("quality cost rises from low to medium to high", () => {
  assert.ok(qualityCost("low") < qualityCost("medium"));
  assert.ok(qualityCost("medium") < qualityCost("high"));
});

test("3D is off on Low and on from Medium up", () => {
  assert.equal(threeDEnabled("low"), false);
  assert.equal(threeDEnabled("medium"), true);
  assert.equal(threeDEnabled("high"), true);
  assert.equal(QUALITY_PROFILE.low.orbPoints, 0);
  assert.ok(QUALITY_PROFILE.medium.orbPoints < QUALITY_PROFILE.high.orbPoints);
  assert.equal(QUALITY_PROFILE.medium.bloomPass, false);
  assert.equal(QUALITY_PROFILE.high.bloomPass, true);
});

test("particle counts, bloom and density follow quality", () => {
  assert.ok(scaledDensity(64, "low", 8, 160) < scaledDensity(64, "medium", 8, 160));
  assert.ok(scaledDensity(64, "medium", 8, 160) < scaledDensity(64, "high", 8, 160));
  assert.ok(particleBudget(64, "low") < particleBudget(64, "medium"));
  assert.ok(particleBudget(64, "medium") < particleBudget(64, "high"));
  assert.ok(particleBudget(80, "high") <= QUALITY_PROFILE.high.particleCap);
  assert.ok(bloomScaleFor("low") < bloomScaleFor("medium"));
  assert.ok(bloomScaleFor("medium") < bloomScaleFor("high"));
  assert.ok(countScaleFor("low") < countScaleFor("high"));
});

test("DPR caps stay below native and rise with quality", () => {
  assert.equal(QUALITY_PROFILE.low.dprCap, 1);
  assert.equal(QUALITY_PROFILE.medium.dprCap, 1.5);
  assert.equal(QUALITY_PROFILE.high.dprCap, 2.5);
});
