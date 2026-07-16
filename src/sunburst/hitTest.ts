// Polar-coordinate hit-test: (x,y) -> arc. Binary search by angle within the ring, no full loop.

import type { Arc, Layout } from "./layout";

/** True if the point is inside the center disc. */
export function isCenter(layout: Layout, x: number, y: number): boolean {
  const dx = x - layout.cx;
  const dy = y - layout.cy;
  return dx * dx + dy * dy <= layout.centerR * layout.centerR;
}

/** Find the arc under the cursor. Returns null if outside, or in the center/gap. */
export function hitTest(layout: Layout, x: number, y: number): Arc | null {
  const dx = x - layout.cx;
  const dy = y - layout.cy;
  const r = Math.hypot(dx, dy);
  if (r <= layout.centerR || r > layout.radius) return null;

  const ring = Math.floor((r - layout.centerR) / layout.ringW) + 1;
  const arcs = layout.ringArcs[ring];
  if (!arcs || arcs.length === 0) return null;

  let theta = Math.atan2(dy, dx);
  if (theta < 0) theta += 2 * Math.PI;

  // binary search: the largest arc with a0 <= theta
  let lo = 0;
  let hi = arcs.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arcs[mid].a0 <= theta) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (idx < 0) return null;
  const arc = arcs[idx];
  return theta >= arc.a0 && theta < arc.a1 ? arc : null;
}
