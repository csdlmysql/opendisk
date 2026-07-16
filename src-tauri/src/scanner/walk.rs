//! Parallel walk via rayon (recursive par_iter). Build a sub-arena per directory
//! then merge it into the parent. Real on-disk size via blocks()*512.

use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use dashmap::DashSet;
use rayon::prelude::*;

use crate::model::NodeKind;
use crate::scanner::arena::{Arena, Node};
use crate::scanner::progress::Progress;

const BLOCK_SIZE: u64 = 512;

/// Clamp a unix mtime (i64 seconds) into a u32 (0 if negative/unavailable).
#[inline]
fn mtime_of(meta: &std::fs::Metadata) -> u32 {
    let t = meta.mtime();
    if t < 0 {
        0
    } else {
        t.min(u32::MAX as i64) as u32
    }
}

/// Shared context throughout the scan (read-only Arc refs).
struct Ctx {
    root_dev: u64,
    cancel: Arc<AtomicBool>,
    progress: Arc<Progress>,
    /// Hard links already counted, keyed by (dev, ino) with nlink > 1.
    seen_links: DashSet<(u64, u64)>,
}

/// Build result of a child entry: either a sub-arena (directory) or a leaf node.
enum ChildBuild {
    Sub(Arena),
    Leaf(Node),
}

impl ChildBuild {
    fn size(&self) -> u64 {
        match self {
            ChildBuild::Sub(a) => a.nodes[0].size,
            ChildBuild::Leaf(n) => n.size,
        }
    }
}

/// Entry point: scan `path`, returning a complete Arena (root at index 0).
pub fn scan(
    path: &Path,
    cancel: Arc<AtomicBool>,
    progress: Arc<Progress>,
) -> std::io::Result<Arena> {
    let root_meta = std::fs::symlink_metadata(path)?;
    let root_dev = root_meta.dev();
    let own = root_meta.blocks() * BLOCK_SIZE;
    let root_mtime = mtime_of(&root_meta);

    let ctx = Ctx {
        root_dev,
        cancel,
        progress,
        seen_links: DashSet::new(),
    };

    let root_name = path.to_string_lossy().to_string();

    if root_meta.is_dir() {
        ctx.progress.add_dir(own);
        Ok(scan_dir(path, &root_name, own, root_mtime, &ctx))
    } else {
        // Root is a file: single-node arena.
        ctx.progress.add_file(own);
        let kind = classify_leaf(&root_meta);
        Ok(Arena::with_root(Node::new(root_name, own, kind, root_mtime)))
    }
}

fn classify_leaf(meta: &std::fs::Metadata) -> NodeKind {
    if meta.file_type().is_file() {
        NodeKind::File
    } else {
        NodeKind::Other
    }
}

/// Scan a directory, returning a sub-arena whose root (index 0) is the directory itself.
/// `dir_own` = own_size of the directory (already stat'd by the caller).
fn scan_dir(path: &Path, name: &str, dir_own: u64, dir_mtime: u32, ctx: &Ctx) -> Arena {
    let mut arena = Arena::with_root(Node::new(name, dir_own, NodeKind::Dir, dir_mtime));

    if ctx.cancel.load(Ordering::Relaxed) {
        return arena;
    }

    ctx.progress.set_path(&path.to_string_lossy());

    let read_dir = match std::fs::read_dir(path) {
        Ok(rd) => rd,
        Err(_) => return arena, // permission/IO error: skip this branch
    };

    // Classify: subdirectories (need recursion) vs leaves (handled immediately).
    struct SubDir {
        path: PathBuf,
        name: String,
        own: u64,
        mtime: u32,
    }
    let mut subdirs: Vec<SubDir> = Vec::new();
    let mut leaves: Vec<Node> = Vec::new();

    for entry in read_dir.flatten() {
        if ctx.cancel.load(Ordering::Relaxed) {
            break;
        }
        let entry_path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        // lstat: do NOT follow symlinks.
        let meta = match std::fs::symlink_metadata(&entry_path) {
            Ok(m) => m,
            Err(_) => continue, // skip entries that error
        };
        let ft = meta.file_type();
        let own = meta.blocks() * BLOCK_SIZE;
        let mtime = mtime_of(&meta);

        if ft.is_symlink() {
            // Symlink = leaf node kind Other, size = own blocks, NOT followed.
            ctx.progress.add_file(own);
            leaves.push(Node::new(file_name, own, NodeKind::Other, mtime));
            continue;
        }

        if ft.is_dir() {
            if meta.dev() != ctx.root_dev {
                // Different mount point: create a marker node, do NOT recurse.
                ctx.progress.add_dir(own);
                leaves.push(Node::new(file_name, own, NodeKind::Other, mtime));
            } else {
                subdirs.push(SubDir {
                    path: entry_path,
                    name: file_name,
                    own,
                    mtime,
                });
            }
            continue;
        }

        // Regular file (or special file).
        if ft.is_file() {
            let mut eff = own;
            // Dedup hard links by (dev, ino) when nlink > 1.
            if meta.nlink() > 1 {
                let key = (meta.dev(), meta.ino());
                if !ctx.seen_links.insert(key) {
                    // Already counted -> do not add its size again.
                    eff = 0;
                }
            }
            ctx.progress.add_file(eff);
            leaves.push(Node::new(file_name, eff, NodeKind::File, mtime));
        } else {
            // socket/fifo/device...
            ctx.progress.add_file(own);
            leaves.push(Node::new(file_name, own, NodeKind::Other, mtime));
        }
    }

    // Recurse into subdirectories in parallel (rayon work-stealing).
    let sub_arenas: Vec<Arena> = if ctx.cancel.load(Ordering::Relaxed) {
        Vec::new()
    } else {
        subdirs
            .into_par_iter()
            .map(|sd| {
                ctx.progress.add_dir(sd.own);
                scan_dir(&sd.path, &sd.name, sd.own, sd.mtime, ctx)
            })
            .collect()
    };

    // Combine all children (leaves + sub-arenas), sort by size desc, attach to root.
    let mut builds: Vec<ChildBuild> = Vec::with_capacity(leaves.len() + sub_arenas.len());
    for l in leaves {
        builds.push(ChildBuild::Leaf(l));
    }
    for s in sub_arenas {
        builds.push(ChildBuild::Sub(s));
    }
    // Sort by size desc (sort once at build time -> the whole tree ends up sorted).
    builds.sort_unstable_by(|a, b| b.size().cmp(&a.size()));

    let mut child_indices: Vec<u32> = Vec::with_capacity(builds.len());
    for b in builds {
        let idx = match b {
            ChildBuild::Leaf(n) => arena.push_leaf(n),
            ChildBuild::Sub(s) => arena.append_subtree(s),
        };
        child_indices.push(idx);
    }
    arena.attach_children(0, &child_indices);

    arena
}
