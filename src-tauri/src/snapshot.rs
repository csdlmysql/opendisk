//! P2 — Save pruned snapshots of a scan and diff the current scan against them.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::commands::AppState;
use crate::model::{DiffNode, DiffResult, NodeKind, SnapNode, SnapshotMeta};
use crate::scanner::arena::Arena;
use crate::util;

/// Minimum node size kept in a snapshot / diff tree (256 KiB).
const PRUNE_MIN_SIZE: u64 = 262_144;
/// Maximum depth kept in a snapshot / diff tree.
const PRUNE_MAX_DEPTH: u32 = 12;
/// Minimum absolute delta kept as a distinct diff child (1 MiB).
const DIFF_MIN_DELTA: i64 = 1_048_576;
/// Snapshot filename suffix.
const SNAP_SUFFIX: &str = ".odsnap.json";

/// On-disk snapshot file layout.
#[derive(Serialize, Deserialize)]
struct SnapshotFile {
    meta: SnapshotMeta,
    root: SnapNode,
}

/// Only the meta portion, for cheap listing.
#[derive(Deserialize)]
struct MetaOnly {
    meta: SnapshotMeta,
}

/// Directory holding snapshots (created on demand).
fn snap_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("No app data directory: {e}"))?
        .join("snapshots");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create snapshots directory: {e}"))?;
    Ok(dir)
}

/// Reject ids that could escape the snapshots directory.
fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.contains('/') || id.contains('\\') || id.contains("..") {
        return Err("Invalid snapshot id".to_string());
    }
    Ok(())
}

/// Build a pruned SnapNode subtree from the arena.
pub fn build_snap(arena: &Arena, id: u32, depth: u32) -> SnapNode {
    let node = &arena.nodes[id as usize];
    let mut children = Vec::new();
    if depth > 0 {
        for c in arena.children(id) {
            if arena.nodes[c as usize].size >= PRUNE_MIN_SIZE {
                children.push(build_snap(arena, c, depth - 1));
            }
        }
    }
    SnapNode {
        name: node.name.to_string(),
        size: node.size,
        kind: node.kind,
        children,
    }
}

#[tauri::command]
pub fn save_snapshot(
    volume_name: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<SnapshotMeta, String> {
    let (root, meta) = {
        let guard = state.scan.read().unwrap();
        let scan = guard.as_ref().ok_or("No scan results yet")?;
        let root = build_snap(&scan.arena, scan.root_id, PRUNE_MAX_DEPTH);
        let created_at_ms = util::now_ms();
        let id = format!(
            "{}-{}",
            util::stamp(created_at_ms / 1000),
            util::slug(&scan.root_path)
        );
        let meta = SnapshotMeta {
            id,
            root_path: scan.root_path.clone(),
            volume_name,
            created_at_ms,
            total_bytes: scan.total_bytes,
            file_count: scan.files_scanned,
        };
        (root, meta)
    };

    let dir = snap_dir(&app)?;
    let path = dir.join(format!("{}{}", meta.id, SNAP_SUFFIX));
    let file = SnapshotFile {
        meta: meta.clone(),
        root,
    };
    let json =
        serde_json::to_string(&file).map_err(|e| format!("Failed to serialize snapshot: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write snapshot: {e}"))?;
    Ok(meta)
}

#[tauri::command]
pub fn list_snapshots(app: AppHandle) -> Result<Vec<SnapshotMeta>, String> {
    let dir = snap_dir(&app)?;
    let mut metas: Vec<SnapshotMeta> = Vec::new();
    for entry in std::fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read snapshots directory: {e}"))?
        .flatten()
    {
        let p = entry.path();
        let is_snap = p
            .file_name()
            .map(|n| n.to_string_lossy().ends_with(SNAP_SUFFIX))
            .unwrap_or(false);
        if !is_snap {
            continue;
        }
        if let Ok(txt) = std::fs::read_to_string(&p) {
            if let Ok(m) = serde_json::from_str::<MetaOnly>(&txt) {
                metas.push(m.meta);
            }
        }
    }
    metas.sort_by(|a, b| b.created_at_ms.cmp(&a.created_at_ms));
    Ok(metas)
}

#[tauri::command]
pub fn delete_snapshot(id: String, app: AppHandle) -> Result<(), String> {
    validate_id(&id)?;
    let dir = snap_dir(&app)?;
    let path = dir.join(format!("{id}{SNAP_SUFFIX}"));
    std::fs::remove_file(&path).map_err(|e| format!("Failed to delete snapshot: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn diff_with_snapshot(
    id: String,
    depth: u32,
    max_children: u32,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<DiffResult, String> {
    validate_id(&id)?;
    let dir = snap_dir(&app)?;
    let path = dir.join(format!("{id}{SNAP_SUFFIX}"));
    let txt = std::fs::read_to_string(&path).map_err(|_| "Snapshot not found".to_string())?;
    let file: SnapshotFile =
        serde_json::from_str(&txt).map_err(|e| format!("Corrupt snapshot: {e}"))?;

    let (cur_root, cur_path) = {
        let guard = state.scan.read().unwrap();
        let scan = guard.as_ref().ok_or("No scan results yet")?;
        (
            build_snap(&scan.arena, scan.root_id, PRUNE_MAX_DEPTH),
            scan.root_path.clone(),
        )
    };

    if file.meta.root_path != cur_path {
        return Err(format!(
            "Snapshot is for a different root path ('{}' vs '{}')",
            file.meta.root_path, cur_path
        ));
    }

    let root = diff_node(Some(&cur_root), Some(&file.root), depth, max_children);
    let total_delta = cur_root.size as i64 - file.root.size as i64;
    Ok(DiffResult {
        before: file.meta,
        total_delta,
        root,
    })
}

/// Diff two pruned trees by matching child names within each parent.
pub fn diff_node(
    now: Option<&SnapNode>,
    before: Option<&SnapNode>,
    depth: u32,
    max_children: u32,
) -> DiffNode {
    let name = now
        .map(|n| n.name.clone())
        .or_else(|| before.map(|b| b.name.clone()))
        .unwrap_or_default();
    let size_now = now.map(|n| n.size).unwrap_or(0);
    let size_before = before.map(|b| b.size).unwrap_or(0);
    let delta = size_now as i64 - size_before as i64;
    let kind = now
        .map(|n| n.kind)
        .or_else(|| before.map(|b| b.kind))
        .unwrap_or(NodeKind::Other);

    let now_children: &[SnapNode] = now.map(|n| n.children.as_slice()).unwrap_or(&[]);
    let before_children: &[SnapNode] = before.map(|b| b.children.as_slice()).unwrap_or(&[]);
    let has_children = !now_children.is_empty() || !before_children.is_empty();

    let children = if !has_children || depth == 0 {
        None
    } else {
        let now_map: HashMap<&str, &SnapNode> =
            now_children.iter().map(|c| (c.name.as_str(), c)).collect();
        let before_map: HashMap<&str, &SnapNode> =
            before_children.iter().map(|c| (c.name.as_str(), c)).collect();

        // Union of names, preserving a stable first-seen order.
        let mut seen: HashSet<&str> = HashSet::new();
        let mut names: Vec<&str> = Vec::new();
        for c in now_children.iter().chain(before_children.iter()) {
            if seen.insert(c.name.as_str()) {
                names.push(c.name.as_str());
            }
        }

        // Pair up children and sort by |delta| descending.
        struct Pair<'a> {
            now: Option<&'a SnapNode>,
            before: Option<&'a SnapNode>,
            delta: i64,
        }
        let mut pairs: Vec<Pair> = names
            .iter()
            .map(|nm| {
                let n = now_map.get(nm).copied();
                let b = before_map.get(nm).copied();
                let d = n.map(|x| x.size).unwrap_or(0) as i64 - b.map(|x| x.size).unwrap_or(0) as i64;
                Pair {
                    now: n,
                    before: b,
                    delta: d,
                }
            })
            .collect();
        pairs.sort_unstable_by(|a, b| b.delta.abs().cmp(&a.delta.abs()));

        let mut result: Vec<DiffNode> = Vec::new();
        let mut merged_now: u64 = 0;
        let mut merged_before: u64 = 0;
        let mut merged_count = 0u32;
        for p in pairs {
            let keep = (result.len() as u32) < max_children && p.delta.abs() >= DIFF_MIN_DELTA;
            if keep {
                result.push(diff_node(p.now, p.before, depth - 1, max_children));
            } else {
                merged_now += p.now.map(|x| x.size).unwrap_or(0);
                merged_before += p.before.map(|x| x.size).unwrap_or(0);
                merged_count += 1;
            }
        }
        if merged_count > 0 {
            result.push(DiffNode {
                name: format!("{merged_count} other changes"),
                size_now: merged_now,
                size_before: merged_before,
                delta: merged_now as i64 - merged_before as i64,
                kind: NodeKind::Other,
                children: None,
            });
        }
        Some(result)
    };

    DiffNode {
        name,
        size_now,
        size_before,
        delta,
        kind,
        children,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snap(name: &str, size: u64, children: Vec<SnapNode>) -> SnapNode {
        SnapNode {
            name: name.to_string(),
            size,
            kind: if children.is_empty() {
                NodeKind::File
            } else {
                NodeKind::Dir
            },
            children,
        }
    }

    #[test]
    fn diff_two_trees_computes_deltas() {
        // before: root(10MB) { a(6MB), b(4MB) }
        // now:    root(12MB) { a(9MB), c(3MB) }   (b removed, c added)
        let before = snap(
            "/r",
            10 * 1_048_576,
            vec![snap("a", 6 * 1_048_576, vec![]), snap("b", 4 * 1_048_576, vec![])],
        );
        let now = snap(
            "/r",
            12 * 1_048_576,
            vec![snap("a", 9 * 1_048_576, vec![]), snap("c", 3 * 1_048_576, vec![])],
        );

        let d = diff_node(Some(&now), Some(&before), 4, 10);
        assert_eq!(d.delta, 2 * 1_048_576);
        let kids = d.children.expect("root expanded");
        // a: +3MB, b: -4MB (removed), c: +3MB
        let a = kids.iter().find(|k| k.name == "a").unwrap();
        assert_eq!(a.delta, 3 * 1_048_576);
        assert_eq!(a.size_now, 9 * 1_048_576);
        assert_eq!(a.size_before, 6 * 1_048_576);
        let b = kids.iter().find(|k| k.name == "b").unwrap();
        assert_eq!(b.size_now, 0);
        assert_eq!(b.delta, -(4 * 1_048_576));
        let c = kids.iter().find(|k| k.name == "c").unwrap();
        assert_eq!(c.size_before, 0);
        assert_eq!(c.delta, 3 * 1_048_576);
    }

    #[test]
    fn diff_merges_small_changes() {
        // Two children with tiny deltas below 1MB get merged into "other changes".
        let before = snap("/r", 100, vec![snap("x", 50, vec![]), snap("y", 40, vec![])]);
        let now = snap("/r", 110, vec![snap("x", 55, vec![]), snap("y", 45, vec![])]);
        let d = diff_node(Some(&now), Some(&before), 4, 10);
        let kids = d.children.unwrap();
        assert_eq!(kids.len(), 1);
        assert!(kids[0].name.contains("other changes"));
        assert_eq!(kids[0].kind, NodeKind::Other);
    }
}
