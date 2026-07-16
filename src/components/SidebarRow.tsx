// A single sidebar row: color dot, icon, name, size, percent bar.
import { memo } from "react";
import type { NodeView } from "../types/model";
import { formatBytes, formatPercent, truncateMiddle } from "../utils/format";
import { FileIcon, FolderIcon } from "./icons";

interface Props {
  node: NodeView;
  color: string;
  maxSize: number;
  hovered: boolean;
  onHover: (id: number | null) => void;
  onClick: (node: NodeView) => void;
  onContext: (node: NodeView, x: number, y: number) => void;
}

function SidebarRow({ node, color, maxSize, hovered, onHover, onClick, onContext }: Props) {
  const isVirtual = node.id === -1;
  const isDir = node.kind === "dir";
  const pctOfMax = maxSize > 0 ? (node.size / maxSize) * 100 : 0;

  return (
    <div
      className={`row${hovered ? " hovered" : ""}${isVirtual ? " virtual" : ""}`}
      draggable={!isVirtual}
      onDragStart={(e) => {
        if (isVirtual) return;
        e.dataTransfer.setData(
          "application/x-opendisk-node",
          JSON.stringify({ id: node.id, name: node.name, size: node.size, kind: node.kind }),
        );
        e.dataTransfer.effectAllowed = "copy";
      }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(node)}
      onContextMenu={(e) => {
        if (isVirtual) return;
        e.preventDefault();
        onContext(node, e.clientX, e.clientY);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(node);
        }
      }}
      title={node.name}
    >
      <span className="dot" style={{ background: color }} />
      <span className="r-icon">
        {isVirtual ? null : isDir ? <FolderIcon size={15} /> : <FileIcon size={15} />}
      </span>
      <span className="r-name">{truncateMiddle(node.name, 30)}</span>
      <span className="r-size tabnum" title={`${formatPercent(node.size, maxSize)} of the largest item`}>
        {formatBytes(node.size)}
      </span>
      <div className="row-bar">
        <div
          className="row-bar-fill"
          style={{ width: `${Math.max(2, pctOfMax)}%`, background: color }}
        />
      </div>
    </div>
  );
}

export default memo(SidebarRow);
