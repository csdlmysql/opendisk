// Zoom animation: interpolate angle/radius from the old layout -> new one by nodeId.
// Only runs rAF while animating, then stops. Respects prefers-reduced-motion.

import { renderBase, type CenterInfo } from "./render";
import type { Arc, Layout } from "./layout";

const DURATION = 350;
const GAP_STROKE = "rgba(16,19,26,0.9)";

interface Geom {
  a0: number;
  a1: number;
  innerR: number;
  outerR: number;
}

interface FrameItem {
  from: Geom;
  to: Geom;
  color: string;
  fadeIn: boolean; // alpha 0->1
  fadeOut: boolean; // alpha 1->0
}

function easeInOutCubic(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function geomOf(a: Arc): Geom {
  return { a0: a.a0, a1: a.a1, innerR: a.innerR, outerR: a.outerR };
}

function collapsedFrom(arc: Arc, oldLayout: Layout, newLayout: Layout): Geom {
  // find the nearest ancestor present in the old layout -> expand from its outer edge
  let p = arc.parentId;
  while (p !== -1) {
    const anc = oldLayout.byId.get(p);
    if (anc) {
      return { a0: arc.a0, a1: arc.a1, innerR: anc.outerR, outerR: anc.outerR };
    }
    const parentArc = newLayout.byId.get(p);
    if (!parentArc) break;
    p = parentArc.parentId;
  }
  return { a0: arc.a0, a1: arc.a1, innerR: oldLayout.centerR, outerR: oldLayout.centerR };
}

function annular(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  g: Geom,
): void {
  ctx.beginPath();
  ctx.arc(cx, cy, g.outerR, g.a0, g.a1, false);
  ctx.arc(cx, cy, g.innerR, g.a1, g.a0, true);
  ctx.closePath();
}

export interface ZoomHandle {
  cancel(): void;
}

/**
 * Animate from oldLayout -> newLayout. Returns a handle to cancel.
 * If reducedMotion, draw the new layout directly.
 */
export function animateZoom(
  ctx: CanvasRenderingContext2D,
  oldLayout: Layout | null,
  newLayout: Layout,
  center: CenterInfo,
  dpr: number,
  width: number,
  height: number,
  reducedMotion: boolean,
  onDone: () => void,
): ZoomHandle {
  if (reducedMotion || !oldLayout) {
    renderBase(ctx, newLayout, center, dpr, width, height);
    onDone();
    return { cancel: () => {} };
  }

  const items: FrameItem[] = [];
  // arcs of the new layout: movers (present in the old) or appearing
  for (const arc of newLayout.arcs) {
    const old = arc.nodeId !== -1 ? oldLayout.byId.get(arc.nodeId) : undefined;
    if (old) {
      items.push({ from: geomOf(old), to: geomOf(arc), color: arc.color, fadeIn: false, fadeOut: false });
    } else {
      items.push({
        from: collapsedFrom(arc, oldLayout, newLayout),
        to: geomOf(arc),
        color: arc.color,
        fadeIn: true,
        fadeOut: false,
      });
    }
  }
  // old arcs that disappear -> fade out in place
  for (const arc of oldLayout.arcs) {
    if (arc.nodeId === -1 || !newLayout.byId.has(arc.nodeId)) {
      const g = geomOf(arc);
      items.push({ from: g, to: g, color: arc.color, fadeIn: false, fadeOut: true });
    }
  }

  const cx = newLayout.cx;
  const cy = newLayout.cy;
  const start = performance.now();
  let raf = 0;
  let cancelled = false;

  const frame = (now: number) => {
    if (cancelled) return;
    const t = Math.min(1, (now - start) / DURATION);
    const e = easeInOutCubic(t);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineJoin = "round";

    for (const it of items) {
      const g: Geom = {
        a0: lerp(it.from.a0, it.to.a0, e),
        a1: lerp(it.from.a1, it.to.a1, e),
        innerR: lerp(it.from.innerR, it.to.innerR, e),
        outerR: lerp(it.from.outerR, it.to.outerR, e),
      };
      let alpha = 1;
      if (it.fadeIn) alpha = e;
      else if (it.fadeOut) alpha = 1 - e;
      if (alpha <= 0.01 || g.outerR - g.innerR < 0.5) continue;
      ctx.globalAlpha = alpha;
      annular(ctx, cx, cy, g);
      ctx.fillStyle = it.color;
      ctx.fill();
      if (g.a1 - g.a0 > 0.01) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = GAP_STROKE;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    if (t >= 1) {
      renderBase(ctx, newLayout, center, dpr, width, height);
      onDone();
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    cancel: () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    },
  };
}
