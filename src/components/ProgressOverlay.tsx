// Overlay shown while scanning: spinner + realtime stats.
import { useAppStore } from "../store/useAppStore";
import { formatBytes, formatNumber, truncatePath } from "../utils/format";

export default function ProgressOverlay() {
  const progress = useAppStore((s) => s.progress);
  const cancelScan = useAppStore((s) => s.cancelScan);

  return (
    <div className="progress-overlay" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <div className="progress-stats">
        <div className="progress-bytes tabnum">
          {formatBytes(progress?.bytesScanned ?? 0)}
        </div>
        <div className="progress-line tabnum">
          {formatNumber(progress?.filesScanned ?? 0)} files ·{" "}
          {formatNumber(progress?.dirsScanned ?? 0)} folders
        </div>
      </div>
      <div className="progress-path">
        {progress?.currentPath ? truncatePath(progress.currentPath, 5) : "Preparing…"}
      </div>
      <div className="progress-actions">
        <button onClick={cancelScan}>Cancel</button>
      </div>
    </div>
  );
}
