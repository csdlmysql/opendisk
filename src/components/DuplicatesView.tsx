// Duplicate finder (P3): scan controls + live progress + grouped results with batch trash.
import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { formatBytes, formatNumber, truncatePath } from "../utils/format";
import ConfirmModal from "./ConfirmModal";
import { ChevronDownIcon, ChevronRightIcon, RevealIcon } from "./icons";

const MIN_SIZE_OPTIONS: { label: string; value: number }[] = [
  { label: "10 MB", value: 10e6 },
  { label: "50 MB", value: 50e6 },
  { label: "100 MB", value: 100e6 },
  { label: "500 MB", value: 500e6 },
];

export default function DuplicatesView() {
  const status = useAppStore((s) => s.dupStatus);
  const minSize = useAppStore((s) => s.dupMinSize);
  const progress = useAppStore((s) => s.dupProgress);
  const groups = useAppStore((s) => s.dupGroups);
  const totalWasted = useAppStore((s) => s.dupTotalWasted);
  const setMinSize = useAppStore((s) => s.setDupMinSize);
  const findDuplicates = useAppStore((s) => s.findDuplicates);
  const cancelDuplicates = useAppStore((s) => s.cancelDuplicates);
  const reveal = useAppStore((s) => s.reveal);
  const trashDupFiles = useAppStore((s) => s.trashDupFiles);

  // Local UI state: expanded groups + checked file ids.
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);

  // When new results arrive: expand all, check every file except the first in each group.
  useEffect(() => {
    if (status !== "done") return;
    const nextChecked = new Set<number>();
    const nextExpanded = new Set<number>();
    groups.forEach((g, gi) => {
      nextExpanded.add(gi);
      g.files.forEach((f, fi) => {
        if (fi > 0) nextChecked.add(f.id);
      });
    });
    setChecked(nextChecked);
    setExpanded(nextExpanded);
  }, [status, groups]);

  const checkedIds = useMemo(() => [...checked], [checked]);
  const selectedSize = useMemo(() => {
    let sum = 0;
    for (const g of groups) for (const f of g.files) if (checked.has(f.id)) sum += g.size;
    return sum;
  }, [groups, checked]);

  const toggleGroup = (gi: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(gi) ? next.delete(gi) : next.add(gi);
      return next;
    });
  };

  const toggleFile = (id: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const runningPct =
    progress && progress.totalCandidateBytes > 0
      ? (progress.bytesHashed / progress.totalCandidateBytes) * 100
      : 0;

  return (
    <div className="panel-full dup-view">
      <div className="dup-header">
        <label className="filter-field">
          <span>Min size</span>
          <select
            value={minSize}
            onChange={(e) => setMinSize(Number(e.target.value))}
            disabled={status === "running"}
          >
            {MIN_SIZE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {status === "running" ? (
          <button className="btn-danger" onClick={cancelDuplicates}>
            Cancel
          </button>
        ) : (
          <button className="btn-primary" onClick={findDuplicates}>
            Find Duplicates
          </button>
        )}
      </div>

      {status === "running" && (
        <div className="dup-progress">
          <div className="dup-progress-bar">
            <div className="dup-progress-fill" style={{ width: `${runningPct}%` }} />
          </div>
          <div className="dup-progress-text tabnum">
            Hashing {formatNumber(progress?.filesHashed ?? 0)} of{" "}
            {formatNumber(progress?.totalCandidates ?? 0)} files…
          </div>
          <div className="progress-path">
            {progress?.currentPath ? truncatePath(progress.currentPath, 5) : ""}
          </div>
        </div>
      )}

      {status === "idle" && groups.length === 0 && (
        <div className="empty">
          Choose a minimum size and click “Find Duplicates” to scan for identical files.
        </div>
      )}

      {status === "done" && groups.length === 0 && (
        <div className="empty">No duplicate files found.</div>
      )}

      {groups.length > 0 && (
        <>
          <div className="dup-summary">
            <strong className="tabnum">{formatBytes(totalWasted)}</strong> wasted in{" "}
            {groups.length} groups
          </div>

          <div className="dup-list">
            {groups.map((g, gi) => {
              const isOpen = expanded.has(gi);
              return (
                <div className="dup-group" key={gi}>
                  <button className="dup-group-head" onClick={() => toggleGroup(gi)}>
                    {isOpen ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
                    <span className="dup-group-title">
                      {g.count} copies · {formatBytes(g.size)} each
                    </span>
                    <span className="dup-group-wasted tabnum">
                      {formatBytes(g.wastedBytes)} wasted
                    </span>
                  </button>
                  {isOpen && (
                    <div className="dup-files">
                      {g.files.map((f) => (
                        <div className="dup-file" key={f.id}>
                          <input
                            type="checkbox"
                            checked={checked.has(f.id)}
                            onChange={() => toggleFile(f.id)}
                            aria-label={`Select ${f.path}`}
                          />
                          <span className="dup-file-path" title={f.path}>
                            {truncatePath(f.path, 6)}
                          </span>
                          <button
                            className="icon-btn dup-reveal"
                            onClick={() => reveal(f.id)}
                            title="Show in Finder"
                            aria-label="Show in Finder"
                          >
                            <RevealIcon size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="dup-footer">
            <span className="tabnum">
              {checkedIds.length} selected · {formatBytes(selectedSize)}
            </span>
            <button
              className="btn-danger"
              onClick={() => setConfirming(true)}
              disabled={checkedIds.length === 0}
            >
              Move selected to Trash…
            </button>
          </div>
        </>
      )}

      {confirming && (
        <ConfirmModal
          title="Move to Trash"
          message={`Are you sure you want to move ${checkedIds.length} files (${formatBytes(
            selectedSize,
          )}) to the Trash? You can restore them from there.`}
          confirmLabel="Move to Trash"
          danger
          onConfirm={() => {
            setConfirming(false);
            void trashDupFiles(checkedIds);
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
