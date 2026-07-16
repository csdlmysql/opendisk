// Custom (dark) context menu — shared by sidebar rows & sunburst sectors.
// Driven by store.contextTarget. Closes on outside click / Escape. No native menu.
import { useEffect, useState } from "react";
import { useAppStore, type ContextTarget } from "../store/useAppStore";
import { formatBytes } from "../utils/format";
import ConfirmModal from "./ConfirmModal";

export default function ContextMenu() {
  const target = useAppStore((s) => s.contextTarget);
  const close = useAppStore((s) => s.closeContextMenu);
  const zoomTo = useAppStore((s) => s.zoomTo);
  const quickLook = useAppStore((s) => s.quickLook);
  const reveal = useAppStore((s) => s.reveal);
  const openInTerminal = useAppStore((s) => s.openInTerminal);
  const addToCollector = useAppStore((s) => s.addToCollector);
  const trash = useAppStore((s) => s.trash);

  const [pendingTrash, setPendingTrash] = useState<ContextTarget | null>(null);

  useEffect(() => {
    if (!target) return;
    const onDown = () => close();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    // use a timeout so we don't catch the very click that opened the menu
    const t = setTimeout(() => {
      window.addEventListener("mousedown", onDown);
      window.addEventListener("contextmenu", onDown);
    }, 0);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onDown);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("contextmenu", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onDown);
    };
  }, [target, close]);

  const run = (fn: () => void) => {
    fn();
    close();
  };

  return (
    <>
      {target && (
        <div
          className="context-menu"
          role="menu"
          style={{
            left: Math.min(target.x, window.innerWidth - 226),
            top: Math.min(target.y, window.innerHeight - 300),
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {target.kind === "dir" && (
            <button
              className="ctx-item"
              role="menuitem"
              onClick={() => run(() => zoomTo(target.id, target.name))}
            >
              Expand
            </button>
          )}
          <button
            className="ctx-item"
            role="menuitem"
            onClick={() => run(() => quickLook(target.id))}
          >
            Preview
          </button>
          <button
            className="ctx-item"
            role="menuitem"
            onClick={() => run(() => reveal(target.id))}
          >
            Show in Finder
          </button>
          <button
            className="ctx-item"
            role="menuitem"
            onClick={() => run(() => openInTerminal(target.id))}
          >
            Open in Terminal
          </button>
          <div className="ctx-sep" role="separator" />
          <button
            className="ctx-item"
            role="menuitem"
            onClick={() =>
              run(() =>
                addToCollector({
                  id: target.id,
                  name: target.name,
                  size: target.size,
                  kind: target.kind,
                }),
              )
            }
          >
            Move to Collector
          </button>
          <button
            className="ctx-item danger"
            role="menuitem"
            onClick={() => {
              setPendingTrash(target);
              close();
            }}
          >
            Move to Trash…
          </button>
        </div>
      )}

      {pendingTrash && (
        <ConfirmModal
          title="Move to Trash"
          message={`Are you sure you want to move “${pendingTrash.name}” (${formatBytes(
            pendingTrash.size,
          )}) to the Trash? You can restore it from there.`}
          confirmLabel="Move to Trash"
          danger
          onConfirm={() => {
            trash(pendingTrash.id);
            setPendingTrash(null);
          }}
          onCancel={() => setPendingTrash(null)}
        />
      )}
    </>
  );
}
