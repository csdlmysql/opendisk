// DaisyDisk-style sunburst color palette.
// Hue is distributed by the start angle of the top-level sector (around the color wheel).
// Deeper levels: same hue, higher lightness + lower saturation.

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Hue by the start angle (radians, 0..2π) of a top-level sector.
 * Starts at purple (270°) and goes around: purple → blue → green → yellow → orange → red → pink.
 */
export function baseHueForAngle(a0: number): number {
  const frac = (a0 % (2 * Math.PI)) / (2 * Math.PI);
  // go counter-clockwise around the wheel: purple->blue->green->yellow->orange->red
  return (270 - frac * 320 + 360) % 360;
}

/** HSL color of an arc by level/type. */
export function arcHsl(
  hue: number,
  depth: number,
  isFile: boolean,
  isVirtual: boolean,
): Hsl {
  if (isVirtual) return { h: 220, s: 8, l: 30 };
  if (isFile) return { h: 214, s: 16, l: 58 };
  const d = depth - 1; // depth starts at 1 for the first ring
  const l = clamp(44 + d * 7, 40, 78);
  const s = clamp(60 - d * 8, 24, 72);
  return { h: hue, s, l };
}

export function hslString({ h, s, l }: Hsl): string {
  return `hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%)`;
}

/** Lighter variant used on hover. */
export function hoverHsl(c: Hsl): Hsl {
  return { h: c.h, s: clamp(c.s + 6, 0, 100), l: clamp(c.l + 12, 0, 90) };
}

/** Bright border on hover/selected. */
export function edgeHsl(c: Hsl): string {
  return `hsl(${c.h.toFixed(0)}, ${clamp(c.s + 10, 0, 100).toFixed(0)}%, ${clamp(
    c.l + 26,
    0,
    95,
  ).toFixed(0)}%)`;
}
