// Snapshot Compare (P2): pick a baseline snapshot and diff it against the current scan.
import { useState } from "react";
import { useAppStore } from "../store/useAppStore";
import type { DiffNode } from "../types/model";
import { formatBytes, formatDateTime, formatDelta } from "../utils/format";
import { ChevronDownIcon, ChevronRightIcon, TrashIcon } from "./icons";

function deltaClass(delta: number): string {
  if (delta > 0) return "delta-up";
  if (delta < 0) return "delta-down";
  return "delta-zero";
}

function DiffRow({ node, depth }: { node: DiffNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = !!node.children && node.children.length > 0;

  return (
    <>
      <div
        className="diff-row"
        style={{ paddingLeft: 10 + depth * 18 }}
        onClick={() => hasChildren && setOpen(!open)}
        role={hasChildren ? "button" : undefined}
      >
        <span className="diff-caret">
          {hasChildren ? (
            open ? (
              <ChevronDownIcon size={13} />
            ) : (
              <ChevronRightIcon size={13} />
            )
          ) : null}
        </span>
        <span className="diff-name" title={node.name}>
          {node.name}
        </span>
        <span className={`diff-badge tabnum ${deltaClass(node.delta)}`}>
          {formatDelta(node.delta)}
        </span>
        <span className="diff-size tabnum">{formatBytes(node.sizeNow)}</span>
      </div>
      {open &&
        hasChildren &&
        node.children!.map((c, i) => (
          <DiffRow key={`${c.name}-${i}`} node={c} depth={depth + 1} />
        ))}
    </>
  );
}

export default function CompareView() {
  const snapshots = useAppStore((s) => s.snapshots);
  const selectedId = useAppStore((s) => s.selectedSnapshotId);
  const diffResult = useAppStore((s) => s.diffResult);
  const loading = useAppStore((s) => s.compareLoading);
  const currentVolume = useAppStore((s) => s.currentVolume);
  const setSelected = useAppStore((s) => s.setSelectedSnapshot);
  const runCompare = useAppStore((s) => s.runCompare);
  const deleteSnapshot = useAppStore((s) => s.deleteSnapshot);

  const rootPath = currentVolume?.mountPoint;

  // Aggregate added/removed bytes from the top-level children for the header line.
  let added = 0;
  let removed = 0;
  if (diffResult?.root.children) {
    for (const c of diffResult.root.children) {
      if (c.delta > 0) added += c.delta;
      else removed += -c.delta;
    }
  }

  const selectable = snapshots.filter((s) => s.rootPath === rootPath);
  const canCompare = !!selectedId && selectable.some((s) => s.id === selectedId);

  return (
    <div className="panel-full compare-view">
      <div className="compare-picker">
        <div className="compare-picker-head">Baseline snapshot</div>
        {snapshots.length === 0 ? (
          <div className="empty">No snapshots yet. A snapshot is saved after each scan.</div>
        ) : (
          <div className="snapshot-list">
            {snapshots.map((snap) => {
              const sameRoot = snap.rootPath === rootPath;
              const active = snap.id === selectedId;
              return (
                <div
                  key={snap.id}
                  className={`snapshot-row${active ? " active" : ""}${sameRoot ? "" : " disabled"}`}
                  onClick={() => sameRoot && setSelected(snap.id)}
                  title={sameRoot ? undefined : "Different root path — cannot compare"}
                >
                  <span className="snapshot-radio" aria-hidden="true" />
                  <div className="snapshot-info">
                    <span className="snapshot-name">{snap.volumeName}</span>
                    <span className="snapshot-meta tabnum">
                      {formatDateTime(snap.createdAtMs)} · {formatBytes(snap.totalBytes)}
                    </span>
                  </div>
                  <button
                    className="icon-btn snapshot-del"
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteSnapshot(snap.id);
                    }}
                    title="Delete snapshot"
                    aria-label={`Delete snapshot from ${snap.volumeName}`}
                  >
                    <TrashIcon size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <button
          className="btn-primary compare-btn"
          onClick={runCompare}
          disabled={!canCompare || loading}
        >
          {loading ? "Comparing…" : "Compare"}
        </button>
      </div>

      <div className="compare-result">
        {!diffResult ? (
          <div className="empty">
            Select a snapshot and click “Compare” to see what changed.
          </div>
        ) : (
          <>
            <div className="compare-summary">
              <div className="compare-net">
                Net change since {formatDateTime(diffResult.before.createdAtMs)}
              </div>
              <div className="compare-breakdown">
                <span className="diff-badge delta-up tabnum">{formatDelta(added)}</span>
                <span className="diff-badge delta-down tabnum">{formatDelta(-removed)}</span>
                <span className="compare-net-total tabnum">
                  Net {formatDelta(diffResult.totalDelta)}
                </span>
              </div>
            </div>
            <div className="diff-tree">
              {(diffResult.root.children ?? []).map((c, i) => (
                <DiffRow key={`${c.name}-${i}`} node={c} depth={0} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
