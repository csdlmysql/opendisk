// Render the sunburst onto a 2D canvas. Two functions: renderBase (background, rarely redrawn) and renderOverlay (hover/selected).

import { formatBytes } from "../utils/format";
import type { Arc, Layout } from "./layout";

const BG = "#12151c";
const GAP_STROKE = "rgba(16,19,26,0.9)";
const TEXT_MAIN = "#e8eaf0";
const TEXT_SUB = "#8b93a7";

function annularPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  a0: number,
  a1: number,
): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r1, a0, a1, false);
  ctx.arc(cx, cy, r0, a1, a0, true);
  ctx.closePath();
}

export interface CenterInfo {
  name: string;
  size: number;
  line: string; // bottom line, e.g. "1,234 items" or "45%"
  emphasizeUp?: boolean; // add an ↑ arrow (has a parent node)
}

/** Draw all arcs + the center disc. Called when the view/size changes or during animation. */
export function renderBase(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  center: CenterInfo,
  dpr: number,
  width: number,
  height: number,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const { cx, cy } = layout;
  ctx.lineJoin = "round";

  for (const arc of layout.arcs) {
    annularPath(ctx, cx, cy, arc.innerR, arc.outerR, arc.a0, arc.a1);
    ctx.fillStyle = arc.color;
    ctx.fill();
    if (arc.a1 - arc.a0 > 0.01) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = GAP_STROKE;
      ctx.stroke();
    }
  }

  drawCenter(ctx, layout, center);
}

export function drawCenter(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  center: CenterInfo,
): void {
  const { cx, cy, centerR } = layout;
  ctx.beginPath();
  ctx.arc(cx, cy, centerR, 0, 2 * Math.PI);
  const grad = ctx.createRadialGradient(cx, cy, centerR * 0.2, cx, cy, centerR);
  grad.addColorStop(0, "#1c2130");
  grad.addColorStop(1, BG);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let name = center.name;
  const maxChars = Math.max(8, Math.floor(centerR / 4.2));
  if (name.length > maxChars) name = name.slice(0, maxChars - 1) + "…";

  ctx.fillStyle = TEXT_MAIN;
  ctx.font =
    "600 13px -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif";
  ctx.fillText(name, cx, cy - 14);

  ctx.fillStyle = "#eef1f7";
  ctx.font =
    "700 22px -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif";
  ctx.fillText(formatBytes(center.size), cx, cy + 8);

  ctx.fillStyle = TEXT_SUB;
  ctx.font =
    "500 11px -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif";
  ctx.fillText(center.emphasizeUp ? `↑ ${center.line}` : center.line, cx, cy + 28);
}

/**
 * Draw the overlay layer: hover + selected highlight + (optional) center override on hover.
 * Cheap, called whenever hover changes.
 */
export function renderOverlay(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  hovered: Arc | null,
  selectedId: number | null,
  centerOverride: CenterInfo | null,
  dpr: number,
  width: number,
  height: number,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const { cx, cy } = layout;

  if (selectedId != null && selectedId !== -1) {
    const sel = layout.byId.get(selectedId);
    if (sel && sel !== hovered) {
      annularPath(ctx, cx, cy, sel.innerR, sel.outerR, sel.a0, sel.a1);
      ctx.lineWidth = 2;
      ctx.strokeStyle = sel.edgeColor;
      ctx.stroke();
    }
  }

  if (hovered) {
    annularPath(ctx, cx, cy, hovered.innerR, hovered.outerR, hovered.a0, hovered.a1);
    ctx.fillStyle = hovered.hoverColor;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = hovered.edgeColor;
    ctx.stroke();
  }

  // on hover: the center shows the hovered arc's size (DaisyDisk behavior)
  if (centerOverride) {
    drawCenter(ctx, layout, centerOverride);
  }
}
