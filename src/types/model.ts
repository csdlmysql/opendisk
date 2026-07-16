// Shared contract between the Rust backend and the frontend.
// MUST match src-tauri/src/model.rs one-to-one (serde camelCase).

export interface Volume {
  name: string;
  mountPoint: string;
  totalBytes: number;
  availableBytes: number;
  fileSystem: string;
  isRemovable: boolean;
}

export type NodeKind = "dir" | "file" | "other";

/**
 * A node in the view tree already pruned by Rust.
 * `id` is the index into the Rust-side arena — used to lazy-load on zoom.
 * `id === -1` means a virtual "N smaller items" node (not zoomable).
 */
export interface NodeView {
  id: number;
  name: string;
  size: number;
  kind: NodeKind;
  childCount: number;
  children: NodeView[] | null;
}

export interface ScanProgress {
  filesScanned: number;
  dirsScanned: number;
  bytesScanned: number;
  currentPath: string;
  elapsedMs: number;
}

export interface ScanComplete {
  rootId: number;
  totalBytes: number;
  filesScanned: number;
  dirsScanned: number;
  durationMs: number;
}

export interface ScanError {
  message: string;
}

// ===== Large Files finder (P1) =====
export type FileCategory =
  | "image"
  | "video"
  | "audio"
  | "archive"
  | "diskimage"
  | "application"
  | "document"
  | "code"
  | "other";

export interface FileHit {
  id: number;
  name: string;
  path: string;
  size: number;
  mtimeMs: number;
  category: FileCategory;
}

// ===== Snapshot / Compare (P2) =====
export interface SnapshotMeta {
  id: string;
  rootPath: string;
  volumeName: string;
  createdAtMs: number;
  totalBytes: number;
  fileCount: number;
}

export interface DiffNode {
  name: string;
  sizeNow: number;
  sizeBefore: number;
  delta: number;
  kind: NodeKind;
  children: DiffNode[] | null;
}

export interface DiffResult {
  before: SnapshotMeta;
  totalDelta: number;
  root: DiffNode;
}

// ===== Duplicate finder (P3) =====
export interface DupFile {
  id: number;
  name: string;
  path: string;
  mtimeMs: number;
}

export interface DupGroup {
  size: number;
  count: number;
  wastedBytes: number;
  files: DupFile[];
}

export interface DupProgress {
  filesHashed: number;
  bytesHashed: number;
  totalCandidates: number;
  totalCandidateBytes: number;
  currentPath: string;
}

export interface DupComplete {
  groups: DupGroup[];
  totalWasted: number;
  durationMs: number;
}

export interface DupError {
  message: string;
}

// ===== Tauri commands (invoke) =====
// list_volumes(): Volume[]
// start_scan({ path: string }): void        — runs in the background, results via events
// cancel_scan(): void
// get_view({ nodeId, depth, maxChildren, minFraction }): NodeView
//   - nodeId: root node id of the view (scan root = rootId from scan-complete)
//   - depth: number of child levels returned (sunburst uses 5)
//   - maxChildren: top-N children per node by size (e.g. 50), the rest merge into a virtual node
//   - minFraction: children smaller than this fraction of the view-root are merged (e.g. 0.002)
// get_node_path({ nodeId }): string          — absolute path of the node
// reveal_in_finder({ nodeId }): void
// move_to_trash({ nodeId }): void            — move to Trash (not a hard delete)
//
// ===== Tauri events (listen) =====
// "scan-progress": ScanProgress   — throttled ~10fps while scanning
// "scan-complete": ScanComplete
// "scan-error":    ScanError
