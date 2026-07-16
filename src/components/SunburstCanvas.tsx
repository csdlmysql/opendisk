// SunburstCanvas: only wires together the pure modules in src/sunburst.
// Two canvas layers: base (redrawn when view/size changes) + overlay (hover/selected, cheap).
// Hover/selected handled imperatively via store.subscribe — no React re-render on hover.

import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { useAppStore } from "../store/useAppStore";
import { animateZoom, type ZoomHandle } from "../sunburst/animate";
import { hitTest, isCenter } from "../sunburst/hitTest";
import { buildLayout, type Layout } from "../sunburst/layout";
import { renderBase, renderOverlay, type CenterInfo } from "../sunburst/render";
import { formatBytes, formatNumber, formatPercent } from "../utils/format";
import Tooltip, { type TooltipHandle } from "./Tooltip";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

export default function SunburstCanvas() {
  const viewRoot = useAppStore((s) => s.viewRoot);

  const wrapRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<TooltipHandle>(null);

  const layoutRef = useRef<Layout | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const zoomRef = useRef<ZoomHandle | null>(null);
  const rootIdRef = useRef<number | null>(null);

  const viewRootRef = useRef(viewRoot);
  viewRootRef.current = viewRoot;

  // Default center info (total of the node being viewed)
  const centerInfo = (): CenterInfo => {
    const st = useAppStore.getState();
    const root = st.viewRoot;
    const crumb = st.viewStack[st.viewStack.length - 1];
    return {
      name: crumb?.name ?? root?.name ?? "",
      size: root?.size ?? 0,
      line: `${formatNumber(root?.childCount ?? 0)} items`,
      emphasizeUp: st.viewStack.length > 1,
    };
  };

  const drawOverlay = () => {
    const layout = layoutRef.current;
    const ctx = overlayRef.current?.getContext("2d");
    if (!layout || !ctx) return;
    const { w, h, dpr } = sizeRef.current;
    const st = useAppStore.getState();
    const hovered =
      st.hoveredId != null ? layout.byId.get(st.hoveredId) ?? null : null;
    // When hovering an arc: the center shows that arc's size (DaisyDisk behavior)
    const centerOverride: CenterInfo | null = hovered
      ? {
          name: hovered.name,
          size: hovered.size,
          line: formatPercent(hovered.size, layout.root.size || 1),
        }
      : null;
    renderOverlay(ctx, layout, hovered, st.selectedId, centerOverride, dpr, w, h);
  };

  // BUG FIX: only set canvas.width/height when the size ACTUALLY changes.
  // Assigning width/height clears the canvas; ResizeObserver always fires once right after
  // observe with an unchanged size -> re-setting would permanently clear the base (only overlay/hover left).
  const applySize = (): boolean => {
    const wrap = wrapRef.current;
    const base = baseRef.current;
    const overlay = overlayRef.current;
    if (!wrap || !base || !overlay) return false;
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    const changed =
      w !== sizeRef.current.w || h !== sizeRef.current.h || dpr !== sizeRef.current.dpr;
    if (!changed) return false; // do NOT touch the canvas -> avoid clearing it
    sizeRef.current = { w, h, dpr };
    for (const c of [base, overlay]) {
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    }
    return true;
  };

  const rebuild = (animate: boolean) => {
    const root = viewRootRef.current;
    const base = baseRef.current;
    const ctx = base?.getContext("2d");
    if (!root || !ctx) return;
    const { w, h, dpr } = sizeRef.current;
    if (w === 0 || h === 0) return;

    const newLayout = buildLayout(root, w, h);
    const prev = layoutRef.current;
    layoutRef.current = newLayout;

    zoomRef.current?.cancel();

    if (animate && prev) {
      zoomRef.current = animateZoom(
        ctx,
        prev,
        newLayout,
        centerInfo(),
        dpr,
        w,
        h,
        prefersReducedMotion(),
        () => {
          zoomRef.current = null;
          drawOverlay();
        },
      );
    } else {
      renderBase(ctx, newLayout, centerInfo(), dpr, w, h);
      drawOverlay();
    }
  };

  // Mount: size + ResizeObserver
  useEffect(() => {
    applySize(); // first run sizeRef=0 -> changed=true -> set dims
    rebuild(false); // draw base
    const ro = new ResizeObserver(() => {
      // fires once right after observe with an UNCHANGED size -> applySize()=false -> skip
      if (applySize()) rebuild(false);
    });
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // viewRoot changed -> rebuild (animate if zooming between two different-node views)
  useEffect(() => {
    if (!viewRoot) {
      layoutRef.current = null;
      rootIdRef.current = null;
      return;
    }
    const prevRootId = rootIdRef.current;
    rootIdRef.current = viewRoot.id;
    const animate =
      layoutRef.current != null && prevRootId != null && prevRootId !== viewRoot.id;
    rebuild(animate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRoot]);

  // Subscribe to hover/selected -> only draw the overlay (no React re-render)
  useEffect(() => {
    let lastHover: number | null = useAppStore.getState().hoveredId;
    let lastSel: number | null = useAppStore.getState().selectedId;
    return useAppStore.subscribe((s) => {
      if (s.hoveredId !== lastHover || s.selectedId !== lastSel) {
        lastHover = s.hoveredId;
        lastSel = s.selectedId;
        drawOverlay();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const localXY = (e: ReactMouseEvent) => {
    const rect = overlayRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onMouseMove = (e: ReactMouseEvent) => {
    const layout = layoutRef.current;
    if (!layout || zoomRef.current) return;
    const { x, y } = localXY(e);
    const overlay = overlayRef.current!;

    if (isCenter(layout, x, y)) {
      overlay.style.cursor = centerInfo().emphasizeUp ? "pointer" : "default";
      useAppStore.getState().setHovered(null);
      tooltipRef.current?.hide();
      return;
    }
    const arc = hitTest(layout, x, y);
    useAppStore.getState().setHovered(arc?.nodeId ?? null);
    if (arc && arc.nodeId !== -1) {
      overlay.style.cursor = arc.kind === "dir" ? "pointer" : "default";
      const pct = formatPercent(arc.size, layout.root.size);
      tooltipRef.current?.show(x, y, arc.name, `${formatBytes(arc.size)} · ${pct}`);
    } else if (arc && arc.nodeId === -1) {
      overlay.style.cursor = "default";
      tooltipRef.current?.show(x, y, arc.name, formatBytes(arc.size));
    } else {
      overlay.style.cursor = "default";
      tooltipRef.current?.hide();
    }
  };

  const onMouseLeave = () => {
    useAppStore.getState().setHovered(null);
    tooltipRef.current?.hide();
  };

  const onClick = (e: ReactMouseEvent) => {
    const layout = layoutRef.current;
    if (!layout || zoomRef.current) return;
    const { x, y } = localXY(e);
    const st = useAppStore.getState();

    if (isCenter(layout, x, y)) {
      if (st.viewStack.length > 1) st.goUp();
      return;
    }
    const arc = hitTest(layout, x, y);
    if (!arc || arc.nodeId === -1) return;
    st.setSelected(arc.nodeId);
    if (arc.kind === "dir") {
      tooltipRef.current?.hide();
      st.zoomTo(arc.nodeId, arc.name);
    }
  };

  const onContextMenu = (e: ReactMouseEvent) => {
    const layout = layoutRef.current;
    if (!layout) return;
    const { x, y } = localXY(e);
    if (isCenter(layout, x, y)) return;
    const arc = hitTest(layout, x, y);
    if (!arc || arc.nodeId === -1) return;
    e.preventDefault();
    tooltipRef.current?.hide();
    const st = useAppStore.getState();
    st.setSelected(arc.nodeId);
    st.openContextMenu({
      id: arc.nodeId,
      name: arc.name,
      kind: arc.kind,
      size: arc.size,
      x: e.clientX,
      y: e.clientY,
    });
  };

  return (
    <div className="sunburst-wrap" ref={wrapRef}>
      <canvas className="base" ref={baseRef} aria-hidden="true" />
      <canvas
        className="overlay"
        ref={overlayRef}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        onContextMenu={onContextMenu}
        role="img"
        aria-label={
          viewRoot
            ? `Sunburst chart of ${viewRoot.name}, ${formatNumber(
                viewRoot.childCount,
              )} items`
            : "Sunburst chart"
        }
      />
      <Tooltip ref={tooltipRef} />
    </div>
  );
}
