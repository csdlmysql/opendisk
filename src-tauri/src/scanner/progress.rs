//! Scan progress counters: atomics + sparsely updated current_path.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Instant;

use crate::model::ScanProgress;

pub struct Progress {
    pub files: AtomicU64,
    pub dirs: AtomicU64,
    pub bytes: AtomicU64,
    pub current_path: Mutex<String>,
    pub start: Instant,
}

impl Progress {
    pub fn new() -> Self {
        Progress {
            files: AtomicU64::new(0),
            dirs: AtomicU64::new(0),
            bytes: AtomicU64::new(0),
            current_path: Mutex::new(String::new()),
            start: Instant::now(),
        }
    }

    #[inline]
    pub fn add_file(&self, bytes: u64) {
        self.files.fetch_add(1, Ordering::Relaxed);
        self.bytes.fetch_add(bytes, Ordering::Relaxed);
    }

    #[inline]
    pub fn add_dir(&self, bytes: u64) {
        self.dirs.fetch_add(1, Ordering::Relaxed);
        self.bytes.fetch_add(bytes, Ordering::Relaxed);
    }

    /// Update current_path sparsely (only try_lock, skip if busy).
    pub fn set_path(&self, path: &str) {
        if let Ok(mut guard) = self.current_path.try_lock() {
            guard.clear();
            guard.push_str(path);
        }
    }

    pub fn elapsed_ms(&self) -> u64 {
        self.start.elapsed().as_millis() as u64
    }

    pub fn snapshot(&self) -> ScanProgress {
        let current_path = self
            .current_path
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default();
        ScanProgress {
            files_scanned: self.files.load(Ordering::Relaxed),
            dirs_scanned: self.dirs.load(Ordering::Relaxed),
            bytes_scanned: self.bytes.load(Ordering::Relaxed),
            current_path,
            elapsed_ms: self.elapsed_ms(),
        }
    }
}

impl Default for Progress {
    fn default() -> Self {
        Self::new()
    }
}
