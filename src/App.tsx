import { useEffect } from "react";
import { backend } from "./api/tauri";
import DriveSelector from "./components/DriveSelector";
import ScanView from "./components/ScanView";
import Toast from "./components/Toast";
import { useAppStore } from "./store/useAppStore";
import "./styles/global.css";

export default function App() {
  const screen = useAppStore((s) => s.screen);
  const error = useAppStore((s) => s.error);
  const clearError = useAppStore((s) => s.clearError);

  useEffect(() => {
    const store = useAppStore.getState();
    const unlisteners: Array<() => void> = [];
    let disposed = false;

    (async () => {
      const listeners = await Promise.all([
        backend.onScanProgress((prog) => useAppStore.getState().onProgress(prog)),
        backend.onScanComplete((comp) => useAppStore.getState().onComplete(comp.rootId)),
        backend.onScanError((err) => useAppStore.getState().onError(err.message)),
        backend.onDupProgress((prog) => useAppStore.getState().onDupProgress(prog)),
        backend.onDupComplete((comp) => useAppStore.getState().onDupComplete(comp)),
        backend.onDupError((err) => useAppStore.getState().onDupError(err.message)),
      ]);
      if (disposed) {
        listeners.forEach((u) => u());
      } else {
        unlisteners.push(...listeners);
      }
    })();

    store.loadVolumes();

    return () => {
      disposed = true;
      unlisteners.forEach((u) => u());
    };
  }, []);

  return (
    <>
      {screen === "drives" ? <DriveSelector /> : <ScanView />}
      {error && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <button onClick={clearError} aria-label="Close">
            Close
          </button>
        </div>
      )}
      <Toast />
    </>
  );
}
