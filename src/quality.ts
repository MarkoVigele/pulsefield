export type Quality = "low" | "medium" | "high";

export function isMobileLab(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;
}

export function pixelRatioFor(quality: Quality): number {
  const native = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  if (quality === "low") return 1;
  if (quality === "medium") return Math.min(native, 1.5);
  return Math.min(native, 2.5);
}

export function bloomScaleFor(quality: Quality): number {
  if (quality === "low") return 0.35;
  if (quality === "medium") return 0.75;
  return 1;
}

export function countScaleFor(quality: Quality): number {
  if (quality === "low") return 0.5;
  if (quality === "medium") return 0.78;
  return 1;
}

export function scaledDensity(base: number, quality: Quality, min: number, max: number): number {
  const n = Math.round(base * countScaleFor(quality));
  return Math.min(max, Math.max(min, n));
}

export function particleBudget(barCount: number, quality: Quality): number {
  const scale = quality === "low" ? 1.4 : quality === "medium" ? 3.1 : 5.2;
  const cap = quality === "low" ? 140 : quality === "medium" ? 300 : 480;
  return Math.round(Math.min(cap, Math.max(36, barCount * scale)));
}
