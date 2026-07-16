//! Shared contract with the frontend — MUST match src/types/model.ts one-to-one.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Volume {
    pub name: String,
    pub mount_point: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub file_system: String,
    pub is_removable: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    Dir,
    File,
    Other,
}

/// A node in the pruned view tree. `id == -1` is the virtual "N smaller items" node.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeView {
    pub id: i64,
    pub name: String,
    pub size: u64,
    pub kind: NodeKind,
    pub child_count: u32,
    pub children: Option<Vec<NodeView>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub files_scanned: u64,
    pub dirs_scanned: u64,
    pub bytes_scanned: u64,
    pub current_path: String,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanComplete {
    pub root_id: i64,
    pub total_bytes: u64,
    pub files_scanned: u64,
    pub dirs_scanned: u64,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanError {
    pub message: String,
}

// ---------------------------------------------------------------------------
// P1 — File finder (large/old files) + export
// ---------------------------------------------------------------------------

/// High-level file category derived from the file extension.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileCategory {
    Image,
    Video,
    Audio,
    Archive,
    /// Disk images / VM images (dmg, iso, raw, qcow2, vmdk, ...).
    #[serde(rename = "diskimage")]
    DiskImage,
    Application,
    Document,
    Code,
    Other,
}

/// A single file matched by the finder.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHit {
    pub id: i64,
    pub name: String,
    pub path: String,
    pub size: u64,
    pub mtime_ms: u64,
    pub category: FileCategory,
}

// ---------------------------------------------------------------------------
// P2 — Snapshot + diff
// ---------------------------------------------------------------------------

/// Metadata describing a saved snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotMeta {
    pub id: String,
    pub root_path: String,
    pub volume_name: String,
    pub created_at_ms: u64,
    pub total_bytes: u64,
    pub file_count: u64,
}

/// A pruned tree node persisted inside a snapshot file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapNode {
    pub name: String,
    pub size: u64,
    pub kind: NodeKind,
    pub children: Vec<SnapNode>,
}

/// A node in the diff tree between the current scan and a snapshot.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffNode {
    pub name: String,
    pub size_now: u64,
    pub size_before: u64,
    pub delta: i64,
    pub kind: NodeKind,
    pub children: Option<Vec<DiffNode>>,
}

/// Result of diffing the current scan against a snapshot.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffResult {
    pub before: SnapshotMeta,
    pub total_delta: i64,
    pub root: DiffNode,
}

// ---------------------------------------------------------------------------
// P3 — Duplicate finder
// ---------------------------------------------------------------------------

/// One file inside a duplicate group.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DupFile {
    pub id: i64,
    pub name: String,
    pub path: String,
    pub mtime_ms: u64,
}

/// A group of files with identical size and content hash.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DupGroup {
    pub size: u64,
    pub count: u32,
    pub wasted_bytes: u64,
    pub files: Vec<DupFile>,
}

/// Progress of a running duplicate scan.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DupProgress {
    pub files_hashed: u64,
    pub bytes_hashed: u64,
    pub total_candidates: u64,
    pub total_candidate_bytes: u64,
    pub current_path: String,
}

/// Final result of a duplicate scan.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DupComplete {
    pub groups: Vec<DupGroup>,
    pub total_wasted: u64,
    pub duration_ms: u64,
}
