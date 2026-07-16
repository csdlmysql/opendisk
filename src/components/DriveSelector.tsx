// Screen 1 — disk selection. DaisyDisk-style vertical list of drive rows.
import { useEffect, useState } from "react";
import { backend } from "../api/tauri";
import { useAppStore } from "../store/useAppStore";
import { formatBytes } from "../utils/format";
import type { Volume } from "../types/model";
import { DiskIcon } from "./icons";

function usageColor(pct: number): string {
  if (pct >= 90) return "linear-gradient(90deg,#ff7a5c,#ff4d4d)";
  if (pct >= 70) return "linear-gradient(90deg,#ffcf5c,#ff9f43)";
  return "linear-gradient(90deg,#4f8cff,#43d1a0)";
}

/** Hide technical mount points (APFS Data volume) from regular users. */
function subtitle(volume: Volume): string {
  const fs = volume.fileSystem.toUpperCase();
  if (volume.mountPoint === "/System/Volumes/Data" || volume.mountPoint === "/") {
    return fs;
  }
  return `${fs} · ${volume.mountPoint}`;
}

function DriveRow({ volume }: { volume: Volume }) {
  const startScan = useAppStore((s) => s.startScan);
  const used = volume.totalBytes - volume.availableBytes;
  const pct = volume.totalBytes > 0 ? (used / volume.totalBytes) * 100 : 0;

  return (
    <div className="drive-card" onDoubleClick={() => startScan(volume)}>
      <DiskIcon size={44} className="disk-icon" />
      <div className="drive-body">
        <div className="drive-head">
          <span className="drive-name">
            {volume.name}
            {volume.isRemovable && <span className="drive-tag">external</span>}
          </span>
          <span className="drive-sub">{subtitle(volume)}</span>
        </div>
        <div
          className="usage-bar"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="usage-fill"
            style={{ width: `${pct}%`, background: usageColor(pct) }}
          />
        </div>
        <div className="drive-usage-text tabnum">
          {formatBytes(volume.availableBytes)} free of {formatBytes(volume.totalBytes)}
        </div>
      </div>
      <button className="btn-primary drive-scan" onClick={() => startScan(volume)}>
        Scan
      </button>
    </div>
  );
}

export default function DriveSelector() {
  const volumes = useAppStore((s) => s.volumes);
  const loading = useAppStore((s) => s.volumesLoading);
  const loadVolumes = useAppStore((s) => s.loadVolumes);
  const startScan = useAppStore((s) => s.startScan);
  const [canPick, setCanPick] = useState(false);

  useEffect(() => {
    loadVolumes();
    // pick_folder is always available in the backend (both Rust and mock) — do NOT
    // call pickFolder() here: it opens a real native dialog and blocks the app on startup.
    setCanPick(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPick = async () => {
    try {
      const path = await backend.pickFolder();
      if (!path) return;
      startScan({
        name: path.split("/").filter(Boolean).pop() || path,
        mountPoint: path,
        totalBytes: 0,
        availableBytes: 0,
        fileSystem: "Folder",
        isRemovable: false,
      });
    } catch {
      setCanPick(false);
    }
  };

  return (
    <div className="drives">
      <div className="drives-header">
        <h1>OpenDisk</h1>
        <div className="sub">Select a disk or folder to analyze</div>
      </div>

      {loading && volumes.length === 0 ? (
        <div className="empty">Loading disks…</div>
      ) : (
        <div className="drive-list">
          {volumes.map((v) => (
            <DriveRow key={v.mountPoint} volume={v} />
          ))}
        </div>
      )}

      {canPick && (
        <button className="btn-ghost" onClick={onPick}>
          Choose Folder…
        </button>
      )}
    </div>
  );
}
