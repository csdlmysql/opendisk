// Small auto-dismissing toast (bottom-center), driven by store.toast.
import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";

const AUTO_DISMISS_MS = 3200;

export default function Toast() {
  const toast = useAppStore((s) => s.toast);
  const clearToast = useAppStore((s) => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clearToast, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  if (!toast) return null;

  return (
    <div className="toast" role="status" aria-live="polite" onClick={clearToast}>
      {toast}
    </div>
  );
}
