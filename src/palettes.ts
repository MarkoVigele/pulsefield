import type { PaletteId } from "./settings";

export type Rgb = readonly [number, number, number];

const STOPS: Record<PaletteId, readonly Rgb[]> = {
  signal: [
    [18, 86, 110],
    [62, 224, 195],
    [210, 255, 244],
  ],
  ember: [
    [92, 28, 18],
    [232, 92, 36],
    [255, 214, 130],
  ],
  chlorophyll: [
    [14, 72, 42],
    [72, 214, 118],
    [220, 255, 186],
  ],
  plasma: [
    [58, 16, 92],
    [196, 64, 210],
    [255, 186, 246],
  ],
  mono: [
    [70, 76, 86],
    [188, 196, 208],
    [246, 248, 252],
  ],
};

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.min(1, Math.max(0, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

export function paletteColor(id: PaletteId, t: number, energy = 1): string {
  const stops = STOPS[id];
  const x = Math.min(1, Math.max(0, t));
  const scaled = x * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const a = stops[i] ?? stops[0];
  const b = stops[i + 1] ?? stops[stops.length - 1];
  const local = scaled - i;
  const [r, g, bl] = mix(a ?? [255, 255, 255], b ?? [255, 255, 255], local);
  const e = 0.35 + 0.65 * Math.min(1, Math.max(0, energy));
  return `rgb(${Math.round(r * e)}, ${Math.round(g * e)}, ${Math.round(bl * e)})`;
}

export function paletteGlow(id: PaletteId): string {
  const tip = STOPS[id][2] ?? STOPS[id][1] ?? [200, 200, 200];
  return `rgba(${tip[0]}, ${tip[1]}, ${tip[2]}, 0.85)`;
}
