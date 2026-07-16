// Collector — a tray to gather files for deletion (a DaisyDisk signature feature).
// Circular drop-target at the bottom-left of the sunburst area; add via drag-and-drop rows or the context menu.
import { useState, type DragEvent } from "react";
import { useAppStore } from "../store/useAppStore";
import { formatBytes } from "../utils/format";
import ConfirmModal from "./ConfirmModal";
import { TrashIcon } from "./icons";

export default function CollectorTray() {
  const items = useAppStore((s) => s.collector);
  const open = useAppStore((s) => s.collectorOpen);
  const setOpen = useAppStore((s) => s.setCollectorOpen);
  const addToCollector = useAppStore((s) => s.addToCollector);
  const removeFromCollector = useAppStore((s) => s.removeFromCollector);
  const trashCollector = useAppStore((s) => s.trashCollector);

  const [dragOver, setDragOver] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const total = items.reduce((s, i) => s + i.size, 0);
  const hasItems = items.length > 0;

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const raw = e.dataTransfer.getData("application/x-opendisk-node");
    if (!raw) return;
    try {
      const node = JSON.parse(raw);
      addToCollector(node);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="collector">
      {open && hasItems && (
        <div className="collector-panel" role="dialog" aria-label="Collector">
          <div className="collector-panel-head">
            <span>Collector · {formatBytes(total)}</span>
            <button
              className="icon-btn"
              style={{ width: 24, height: 24 }}
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="collector-items">
            {items.map((it) => (
              <div className="collector-item" key={it.id}>
                <span className="ci-name" title={it.name}>
                  {it.name}
                </span>
                <span className="ci-size tabnum">{formatBytes(it.size)}</span>
                <button
                  className="ci-remove"
                  onClick={() => removeFromCollector(it.id)}
                  aria-label={`Remove ${it.name}`}
                  title="Remove from tray"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="collector-panel-foot">
            <button className="btn-danger" onClick={() => setConfirming(true)}>
              <TrashIcon size={14} /> Move All to Trash…
            </button>
          </div>
        </div>
      )}

      <div
        className={`collector-drop${dragOver ? " dragover" : ""}${
          hasItems ? " has-items" : ""
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => hasItems && setOpen(!open)}
        role="button"
        aria-label={
          hasItems
            ? `Collector: ${items.length} items, ${formatBytes(total)}`
            : "Drag and drop items here to collect them"
        }
        title={hasItems ? "Open the Collector tray" : "Drag and drop items here to collect them"}
      >
        {hasItems ? (
          <>
            <span className="collector-count tabnum">{items.length}</span>
            <span className="collector-total tabnum">{formatBytes(total)}</span>
          </>
        ) : (
          <span>Drag and drop items here to collect them</span>
        )}
      </div>

      {confirming && (
        <ConfirmModal
          title="Move All to Trash"
          message={`Are you sure you want to move ${items.length} items (${formatBytes(
            total,
          )}) to the Trash? You can restore them from there.`}
          confirmLabel="Move to Trash"
          danger
          onConfirm={() => {
            setConfirming(false);
            trashCollector();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
