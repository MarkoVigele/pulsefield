export type Quality = "low" | "medium" | "high";

export type QualityProfile = {
  dprCap: number;
  bloom: number;
  density: number;
  particleScale: number;
  particleCap: number;
  trails: number;
  shadows: boolean;
  threeD: boolean;
  bloomPass: boolean;
  orbSegments: number;
  orbPoints: number;
};

/** Single source for cost: DPR, glow, counts, 3D. */
export const QUALITY_PROFILE: Record<Quality, QualityProfile> = {
  low: {
    dprCap: 1,
    bloom: 0.35,
    density: 0.5,
    particleScale: 1.4,
    particleCap: 140,
    trails: 3,
    shadows: false,
    threeD: false,
    bloomPass: false,
    orbSegments: 16,
    orbPoints: 0,
  },
  medium: {
    dprCap: 1.5,
    bloom: 0.75,
    density: 0.78,
    particleScale: 3.1,
    particleCap: 300,
    trails: 5,
    shadows: true,
    threeD: true,
    bloomPass: false,
    orbSegments: 32,
    orbPoints: 280,
  },
  high: {
    dprCap: 2.5,
    bloom: 1,
    density: 1,
    particleScale: 5.2,
    particleCap: 480,
    trails: 7,
    shadows: true,
    threeD: true,
    bloomPass: true,
    orbSegments: 56,
    orbPoints: 900,
  },
};

export function isMobileLab(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;
}

export function profileFor(quality: Quality): QualityProfile {
  return QUALITY_PROFILE[quality];
}

export function threeDEnabled(quality: Quality): boolean {
  return QUALITY_PROFILE[quality].threeD;
}

export function pixelRatioFor(quality: Quality): number {
  const native = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  return Math.min(native, QUALITY_PROFILE[quality].dprCap);
}

export function bloomScaleFor(quality: Quality): number {
  return QUALITY_PROFILE[quality].bloom;
}

export function countScaleFor(quality: Quality): number {
  return QUALITY_PROFILE[quality].density;
}

export function scaledDensity(base: number, quality: Quality, min: number, max: number): number {
  const n = Math.round(base * countScaleFor(quality));
  return Math.min(max, Math.max(min, n));
}

export function particleBudget(barCount: number, quality: Quality): number {
  const { particleScale, particleCap } = QUALITY_PROFILE[quality];
  return Math.round(Math.min(particleCap, Math.max(36, barCount * particleScale)));
}

/** Comparable draw cost — tests that Low/Med/High actually diverge. */
export function qualityCost(quality: Quality): number {
  const p = QUALITY_PROFILE[quality];
  return (
    p.dprCap * 12 +
    p.bloom * 40 +
    p.density * 80 +
    p.particleCap +
    p.trails * 8 +
    p.orbSegments * 2 +
    p.orbPoints +
    (p.threeD ? 220 : 0) +
    (p.bloomPass ? 160 : 0) +
    (p.shadows ? 24 : 0)
  );
}
