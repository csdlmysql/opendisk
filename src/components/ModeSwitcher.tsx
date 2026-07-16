// Segmented pill control to switch between Chart / Files / Duplicates / Compare.
import { useAppStore, type ViewMode } from "../store/useAppStore";

const MODES: { id: ViewMode; label: string }[] = [
  { id: "chart", label: "Chart" },
  { id: "files", label: "Files" },
  { id: "duplicates", label: "Duplicates" },
  { id: "compare", label: "Compare" },
];

export default function ModeSwitcher() {
  const viewMode = useAppStore((s) => s.viewMode);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const scanning = useAppStore((s) => s.scanning);
  const viewRoot = useAppStore((s) => s.viewRoot);

  const disabled = scanning || !viewRoot;

  return (
    <div className="mode-switcher" role="tablist" aria-label="View mode">
      {MODES.map((m) => (
        <button
          key={m.id}
          role="tab"
          aria-selected={viewMode === m.id}
          className={`mode-seg${viewMode === m.id ? " active" : ""}`}
          onClick={() => setViewMode(m.id)}
          disabled={disabled}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
