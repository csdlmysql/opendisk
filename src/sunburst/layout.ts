// Compute the sunburst layout from a NodeView (already pruned to depth 5) into a flat Arc[].
// Fully pure logic, no React/DOM dependency.

import type { NodeKind, NodeView } from "../types/model";
import { arcHsl, baseHueForAngle, edgeHsl, hoverHsl, hslString, type Hsl } from "./colors";

export interface Arc {
  nodeId: number;
  depth: number; // ring index, 1 = innermost ring (direct children of the center)
  a0: number;
  a1: number;
  innerR: number;
  outerR: number;
  hue: number;
  hsl: Hsl;
  color: string;
  hoverColor: string;
  edgeColor: string;
  name: string;
  size: number;
  kind: NodeKind;
  isVirtual: boolean;
  parentId: number;
}

export interface Layout {
  arcs: Arc[];
  ringArcs: Arc[][]; // ringArcs[depth] = arcs of that ring, sorted by a0
  byId: Map<number, Arc>;
  cx: number;
  cy: number;
  centerR: number;
  radius: number;
  ringW: number;
  maxRings: number;
  root: NodeView;
}

const PADDING = 24;
const MIN_ARC_RAD = (0.2 * Math.PI) / 180; // drop arcs < 0.2°
const CENTER_RATIO = 0.2;
const MAX_RINGS = 5;

/**
 * Colors of the direct children (ring depth 1) using the exact layout algorithm,
 * so the sidebar can show color dots matching the sectors. Returns an array aligned with root.children.
 */
export function depth1Colors(root: NodeView): string[] {
  if (!root.children) return [];
  const total = root.size || 1;
  const full = 2 * Math.PI;
  let ang = 0;
  return root.children.map((child) => {
    const a0 = ang;
    ang += ((child.size || 0) / total) * full;
    const isVirtual = child.id === -1;
    const isFile = child.kind === "file";
    const hue = baseHueForAngle(a0);
    return hslString(arcHsl(hue, 1, isFile, isVirtual));
  });
}

export function buildLayout(root: NodeView, w: number, h: number): Layout {
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.max(40, Math.min(w, h) / 2 - PADDING);
  const centerR = radius * CENTER_RATIO;
  const ringW = (radius - centerR) / MAX_RINGS;

  const arcs: Arc[] = [];
  const byId = new Map<number, Arc>();

  const recurse = (node: NodeView, depth: number, a0: number, a1: number, hue: number): void => {
    if (depth > MAX_RINGS || !node.children) return;
    const span = a1 - a0;
    const nodeSize = node.size || 1;
    let ang = a0;
    for (const child of node.children) {
      const frac = (child.size || 0) / nodeSize;
      const ca0 = ang;
      const ca1 = ang + frac * span;
      ang = ca1;
      if (ca1 - ca0 < MIN_ARC_RAD) continue;
      const childHue = depth === 1 ? baseHueForAngle(ca0) : hue;
      const isVirtual = child.id === -1;
      const isFile = child.kind === "file";
      const hsl = arcHsl(childHue, depth, isFile, isVirtual);
      const innerR = centerR + (depth - 1) * ringW;
      const arc: Arc = {
        nodeId: child.id,
        depth,
        a0: ca0,
        a1: ca1,
        innerR,
        outerR: innerR + ringW,
        hue: childHue,
        hsl,
        color: hslString(hsl),
        hoverColor: hslString(hoverHsl(hsl)),
        edgeColor: edgeHsl(hsl),
        name: child.name,
        size: child.size,
        kind: child.kind,
        isVirtual,
        parentId: node.id,
      };
      arcs.push(arc);
      if (arc.nodeId !== -1) byId.set(arc.nodeId, arc);
      recurse(child, depth + 1, ca0, ca1, childHue);
    }
  };

  recurse(root, 1, 0, 2 * Math.PI, 0);

  // group by ring, preserving order (already ascending by a0 within each ring)
  const ringArcs: Arc[][] = Array.from({ length: MAX_RINGS + 1 }, () => []);
  for (const a of arcs) ringArcs[a.depth].push(a);

  return {
    arcs,
    ringArcs,
    byId,
    cx,
    cy,
    centerR,
    radius,
    ringW,
    maxRings: MAX_RINGS,
    root,
  };
}
