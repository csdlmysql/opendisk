// Right panel: current node (header) + child list, sorted by size descending.
import { useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import { depth1Colors } from "../sunburst/layout";
import type { NodeView } from "../types/model";
import { formatBytes, formatNumber, truncateMiddle } from "../utils/format";
import SidebarRow from "./SidebarRow";

export default function Sidebar() {
  const viewRoot = useAppStore((s) => s.viewRoot);
  const crumb = useAppStore((s) => s.viewStack[s.viewStack.length - 1]);
  const hoveredId = useAppStore((s) => s.hoveredId);
  const setHovered = useAppStore((s) => s.setHovered);
  const setSelected = useAppStore((s) => s.setSelected);
  const zoomTo = useAppStore((s) => s.zoomTo);
  const openContextMenu = useAppStore((s) => s.openContextMenu);

  const children = viewRoot?.children ?? [];
  const colors = useMemo(() => (viewRoot ? depth1Colors(viewRoot) : []), [viewRoot]);
  const maxSize = useMemo(
    () => children.reduce((m, c) => Math.max(m, c.size), 0),
    [children],
  );

  const onRowClick = (node: NodeView) => {
    setSelected(node.id);
    if (node.kind === "dir" && node.id !== -1) zoomTo(node.id, node.name);
  };

  return (
    <aside className="sidebar" aria-label="Contents">
      <div className="panel-current">
        <span className="dot-lg" style={{ background: "#c9cfdd" }} />
        <span className="pc-name" title={crumb?.name ?? viewRoot?.name ?? ""}>
          {truncateMiddle(crumb?.name ?? viewRoot?.name ?? "—", 22)}
        </span>
        <span className="pc-size tabnum">{formatBytes(viewRoot?.size ?? 0)}</span>
      </div>
      <div className="sidebar-head">
        <span>Contents</span>
        <span className="tabnum">{formatNumber(children.length)} items</span>
      </div>
      <div className="sidebar-list">
        {children.length === 0 ? (
          <div className="empty">No items</div>
        ) : (
          children.map((c, i) => (
            <SidebarRow
              key={c.id === -1 ? `virtual-${i}` : c.id}
              node={c}
              color={colors[i] ?? "#8b93a7"}
              maxSize={maxSize}
              hovered={hoveredId === c.id && c.id !== -1}
              onHover={setHovered}
              onClick={onRowClick}
              onContext={(node, x, y) =>
                openContextMenu({
                  id: node.id,
                  name: node.name,
                  kind: node.kind,
                  size: node.size,
                  x,
                  y,
                })
              }
            />
          ))
        )}
      </div>
    </aside>
  );
}
