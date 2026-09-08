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
