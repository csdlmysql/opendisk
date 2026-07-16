//! P3 — Background duplicate finder: group by size, then verify by BLAKE3 hash.

use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use rayon::prelude::*;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::commands::AppState;
use crate::model::{DupComplete, DupFile, DupGroup, DupProgress, NodeKind, ScanError};

/// Read chunk size while hashing (1 MiB).
const HASH_CHUNK: usize = 1 << 20;
/// Cap on the number of duplicate groups returned.
const MAX_GROUPS: usize = 200;

/// A file considered for duplicate detection.
struct Candidate {
    id: u32,
    size: u64,
    path: PathBuf,
    name: String,
    mtime: u32,
}

/// Shared progress counters for the duplicate scan.
struct DupProg {
    files_hashed: AtomicU64,
    bytes_hashed: AtomicU64,
    total_candidates: AtomicU64,
    total_candidate_bytes: AtomicU64,
    current_path: Mutex<String>,
}

impl DupProg {
    fn new() -> Self {
        DupProg {
            files_hashed: AtomicU64::new(0),
            bytes_hashed: AtomicU64::new(0),
            total_candidates: AtomicU64::new(0),
            total_candidate_bytes: AtomicU64::new(0),
            current_path: Mutex::new(String::new()),
        }
    }

    fn set_path(&self, p: &str) {
        if let Ok(mut g) = self.current_path.try_lock() {
            g.clear();
            g.push_str(p);
        }
    }

    fn snapshot(&self) -> DupProgress {
        DupProgress {
            files_hashed: self.files_hashed.load(Ordering::Relaxed),
            bytes_hashed: self.bytes_hashed.load(Ordering::Relaxed),
            total_candidates: self.total_candidates.load(Ordering::Relaxed),
            total_candidate_bytes: self.total_candidate_bytes.load(Ordering::Relaxed),
            current_path: self.current_path.lock().map(|g| g.clone()).unwrap_or_default(),
        }
    }
}

/// Hash a whole file with BLAKE3, streaming in fixed chunks.
fn hash_file(path: &Path) -> std::io::Result<[u8; 32]> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = blake3::Hasher::new();
    let mut buf = vec![0u8; HASH_CHUNK];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(*hasher.finalize().as_bytes())
}

/// Gather candidate files: kind File, size >= min_size, in a same-size group of >= 2.
fn gather_candidates(arena: &crate::scanner::arena::Arena, min_size: u64) -> Vec<Candidate> {
    let mut by_size: HashMap<u64, Vec<Candidate>> = HashMap::new();
    for (i, node) in arena.nodes.iter().enumerate() {
        if node.kind != NodeKind::File || node.size < min_size || node.size == 0 {
            continue;
        }
        let id = i as u32;
        by_size.entry(node.size).or_default().push(Candidate {
            id,
            size: node.size,
            path: arena.node_path(id),
            name: node.name.to_string(),
            mtime: node.mtime,
        });
    }
    by_size
        .into_values()
        .filter(|v| v.len() >= 2)
        .flatten()
        .collect()
}

/// Build the final groups from hashed candidates.
fn build_groups(hashed: Vec<([u8; 32], Candidate)>) -> (Vec<DupGroup>, u64) {
    let mut by_key: HashMap<(u64, [u8; 32]), Vec<Candidate>> = HashMap::new();
    for (hash, c) in hashed {
        by_key.entry((c.size, hash)).or_default().push(c);
    }
    let mut groups: Vec<DupGroup> = by_key
        .into_iter()
        .filter(|(_, v)| v.len() >= 2)
        .map(|((size, _), v)| {
            let count = v.len() as u32;
            let wasted_bytes = (count as u64 - 1) * size;
            let files = v
                .into_iter()
                .map(|c| DupFile {
                    id: c.id as i64,
                    name: c.name,
                    path: c.path.to_string_lossy().to_string(),
                    mtime_ms: c.mtime as u64 * 1000,
                })
                .collect();
            DupGroup {
                size,
                count,
                wasted_bytes,
                files,
            }
        })
        .collect();
    groups.sort_by(|a, b| b.wasted_bytes.cmp(&a.wasted_bytes));
    groups.truncate(MAX_GROUPS);
    let total_wasted = groups.iter().map(|g| g.wasted_bytes).sum();
    (groups, total_wasted)
}

#[tauri::command]
pub fn find_duplicates(min_size: u64, state: State<'_, AppState>, app: AppHandle) {
    state.dup_cancel.store(false, Ordering::SeqCst);
    let cancel = state.dup_cancel.clone();
    let prog = Arc::new(DupProg::new());
    let done = Arc::new(AtomicBool::new(false));

    // Throttle thread emitting dup-progress every 100ms.
    {
        let app = app.clone();
        let prog = prog.clone();
        let done = done.clone();
        std::thread::spawn(move || loop {
            let _ = app.emit("dup-progress", prog.snapshot());
            if done.load(Ordering::SeqCst) {
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        });
    }

    // Worker thread (does NOT block the async runtime).
    let prog_worker = prog.clone();
    std::thread::spawn(move || {
        let start = Instant::now();
        let state = app.state::<AppState>();

        // Gather candidates under a short read lock, then release it.
        let candidates = {
            let guard = state.scan.read().unwrap();
            match guard.as_ref() {
                Some(scan) => gather_candidates(&scan.arena, min_size),
                None => {
                    done.store(true, Ordering::SeqCst);
                    let _ = app.emit(
                        "dup-error",
                        ScanError {
                            message: "No scan results yet".to_string(),
                        },
                    );
                    return;
                }
            }
        };

        prog_worker
            .total_candidates
            .store(candidates.len() as u64, Ordering::Relaxed);
        prog_worker.total_candidate_bytes.store(
            candidates.iter().map(|c| c.size).sum(),
            Ordering::Relaxed,
        );

        // Hash candidates in parallel; skip read errors and honour cancellation.
        let hashed: Vec<([u8; 32], Candidate)> = candidates
            .into_par_iter()
            .filter_map(|c| {
                if cancel.load(Ordering::Relaxed) {
                    return None;
                }
                prog_worker.set_path(&c.path.to_string_lossy());
                match hash_file(&c.path) {
                    Ok(h) => {
                        prog_worker.files_hashed.fetch_add(1, Ordering::Relaxed);
                        prog_worker
                            .bytes_hashed
                            .fetch_add(c.size, Ordering::Relaxed);
                        Some((h, c))
                    }
                    Err(_) => {
                        prog_worker.files_hashed.fetch_add(1, Ordering::Relaxed);
                        None
                    }
                }
            })
            .collect();

        let (groups, total_wasted) = build_groups(hashed);
        done.store(true, Ordering::SeqCst);
        let _ = app.emit(
            "dup-complete",
            DupComplete {
                groups,
                total_wasted,
                duration_ms: start.elapsed().as_millis() as u64,
            },
        );
    });
}

#[tauri::command]
pub fn cancel_duplicates(state: State<'_, AppState>) {
    state.dup_cancel.store(true, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::walk;
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;

    #[test]
    fn duplicates_grouped_by_size_and_hash() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        // Two identical files (dup), one same-size but different content, one unique.
        let content_a = vec![42u8; 50_000];
        std::fs::write(root.join("a1.bin"), &content_a).unwrap();
        std::fs::write(root.join("a2.bin"), &content_a).unwrap();
        let mut content_b = vec![42u8; 50_000];
        content_b[0] = 7; // same size, different content
        std::fs::write(root.join("b.bin"), &content_b).unwrap();
        std::fs::write(root.join("c.bin"), vec![1u8; 99_000]).unwrap();

        let cancel = Arc::new(AtomicBool::new(false));
        let progress = Arc::new(crate::scanner::progress::Progress::new());
        let arena = walk::scan(root, cancel, progress).unwrap();

        let candidates = gather_candidates(&arena, 1);
        // a1, a2, b share the same size -> 3 candidates; c is unique size -> excluded.
        assert_eq!(candidates.len(), 3);

        let hashed: Vec<([u8; 32], Candidate)> = candidates
            .into_iter()
            .filter_map(|c| hash_file(&c.path).ok().map(|h| (h, c)))
            .collect();
        let (groups, total_wasted) = build_groups(hashed);
        assert_eq!(groups.len(), 1, "only a1/a2 form a real duplicate group");
        assert_eq!(groups[0].count, 2);
        assert_eq!(groups[0].wasted_bytes, groups[0].size);
        assert_eq!(total_wasted, groups[0].size);
    }
}
