// Screen 2 — after Scan: mode-driven body (Chart / Files / Duplicates / Compare).
import { useAppStore } from "../store/useAppStore";
import CollectorTray from "./CollectorTray";
import CompareView from "./CompareView";
import ContextMenu from "./ContextMenu";
import DuplicatesView from "./DuplicatesView";
import FilesView from "./FilesView";
import ProgressOverlay from "./ProgressOverlay";
import Sidebar from "./Sidebar";
import SunburstCanvas from "./SunburstCanvas";
import Toolbar from "./Toolbar";

export default function ScanView() {
  const scanning = useAppStore((s) => s.scanning);
  const viewRoot = useAppStore((s) => s.viewRoot);
  const viewMode = useAppStore((s) => s.viewMode);

  // While scanning or before the first result, always show the chart area (with overlay).
  if (scanning || !viewRoot) {
    return (
      <div className="app">
        <Toolbar />
        <div className="scan-body">
          <div className="chart-area">
            {viewRoot ? (
              <SunburstCanvas />
            ) : (
              !scanning && (
                <div className="empty" style={{ margin: "auto" }}>
                  No data
                </div>
              )
            )}
            {scanning && <ProgressOverlay />}
          </div>
          {viewRoot && <Sidebar />}
        </div>
        <ContextMenu />
      </div>
    );
  }

  return (
    <div className="app">
      <Toolbar />
      {viewMode === "chart" ? (
        <div className="scan-body">
          <div className="chart-area">
            <SunburstCanvas />
            <CollectorTray />
          </div>
          <Sidebar />
        </div>
      ) : (
        <div className="scan-body">
          {viewMode === "files" && <FilesView />}
          {viewMode === "duplicates" && <DuplicatesView />}
          {viewMode === "compare" && <CompareView />}
        </div>
      )}
      <ContextMenu />
    </div>
  );
}
