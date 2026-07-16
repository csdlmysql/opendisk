//! P1 — Find large/old files across the scanned arena, plus CSV/JSON export.

use tauri::{AppHandle, State};

use crate::commands::AppState;
use crate::model::{FileCategory, FileHit, NodeKind};
use crate::scanner::arena::Arena;
use crate::util;

/// Hard cap on the number of results, regardless of the requested limit.
const HARD_CAP: u32 = 2000;

impl FileCategory {
    /// Lowercase serde tag, reused for CSV export and category parsing.
    pub fn as_str(self) -> &'static str {
        match self {
            FileCategory::Image => "image",
            FileCategory::Video => "video",
            FileCategory::Audio => "audio",
            FileCategory::Archive => "archive",
            FileCategory::DiskImage => "diskimage",
            FileCategory::Application => "application",
            FileCategory::Document => "document",
            FileCategory::Code => "code",
            FileCategory::Other => "other",
        }
    }

    pub fn parse(s: &str) -> Option<FileCategory> {
        Some(match s.to_ascii_lowercase().as_str() {
            "image" => FileCategory::Image,
            "video" => FileCategory::Video,
            "audio" => FileCategory::Audio,
            "archive" => FileCategory::Archive,
            "diskimage" => FileCategory::DiskImage,
            "application" => FileCategory::Application,
            "document" => FileCategory::Document,
            "code" => FileCategory::Code,
            "other" => FileCategory::Other,
            _ => return None,
        })
    }
}

/// Map a file name to a category by its extension.
pub fn category_from_name(name: &str) -> FileCategory {
    let ext = name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase());
    let ext = match ext {
        Some(e) => e,
        None => return FileCategory::Other,
    };
    match ext.as_str() {
        // Photos only — including camera RAW formats (cr2/nef/arw/dng...).
        "jpg" | "jpeg" | "png" | "heic" | "heif" | "gif" | "webp" | "tiff" | "tif" | "bmp"
        | "svg" | "cr2" | "nef" | "arw" | "dng" | "orf" | "rw2" => FileCategory::Image,
        "mp4" | "mov" | "mkv" | "avi" | "webm" | "m4v" => FileCategory::Video,
        "mp3" | "aac" | "flac" | "wav" | "m4a" | "ogg" => FileCategory::Audio,
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" => FileCategory::Archive,
        // Disk/VM images — a bare `.raw` on macOS is far more likely a disk image
        // (Docker.raw, dd dumps) than a camera photo.
        "dmg" | "iso" | "raw" | "img" | "qcow2" | "qcow" | "vdi" | "vmdk" | "vhd" | "vhdx"
        | "toast" | "sparseimage" => FileCategory::DiskImage,
        "app" | "pkg" | "ipa" => FileCategory::Application,
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "md" => {
            FileCategory::Document
        }
        "js" | "ts" | "tsx" | "jsx" | "py" | "rs" | "go" | "java" | "c" | "cpp" | "h" | "hpp"
        | "swift" | "json" | "yaml" | "yml" | "toml" => FileCategory::Code,
        _ => FileCategory::Other,
    }
}

/// Core query over the arena. Returns hits sorted by the requested column.
pub fn query_files(
    arena: &Arena,
    min_size: u64,
    older_than_days: u32,
    categories: &[String],
    limit: u32,
    sort_by: &str,
    ascending: bool,
) -> Result<Vec<FileHit>, String> {
    if !matches!(sort_by, "size" | "mtime" | "name") {
        return Err(format!(
            "Invalid sort_by '{sort_by}' (expected 'size', 'mtime' or 'name')"
        ));
    }

    let cap = limit.min(HARD_CAP) as usize;
    if cap == 0 {
        return Ok(Vec::new());
    }

    // Parse the category filter (empty or all-unknown = accept everything).
    let wanted: Vec<FileCategory> = categories
        .iter()
        .filter_map(|c| FileCategory::parse(c))
        .collect();

    // Age cutoff: files must be modified at or before this unix-seconds instant.
    let age_cutoff: Option<u64> = if older_than_days > 0 {
        Some(util::now_secs().saturating_sub(older_than_days as u64 * 86_400))
    } else {
        None
    };

    // Collect matching ids, then sort and truncate. Filters (min_size >= 10 MB in
    // the UI) keep the candidate set small enough that a full sort is cheap, and
    // it gives exact ordering for the text column too.
    let mut matches: Vec<u32> = Vec::new();
    for (i, node) in arena.nodes.iter().enumerate() {
        if node.kind != NodeKind::File || node.size < min_size {
            continue;
        }
        if let Some(cutoff) = age_cutoff {
            if node.mtime == 0 || node.mtime as u64 > cutoff {
                continue;
            }
        }
        if !wanted.is_empty() {
            let cat = category_from_name(&node.name);
            if !wanted.contains(&cat) {
                continue;
            }
        }
        matches.push(i as u32);
    }

    match sort_by {
        "name" => {
            let mut keyed: Vec<(String, u32)> = matches
                .into_iter()
                .map(|id| (arena.nodes[id as usize].name.to_lowercase(), id))
                .collect();
            keyed.sort_unstable_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));
            if !ascending {
                keyed.reverse();
            }
            keyed.truncate(cap);
            matches = keyed.into_iter().map(|(_, id)| id).collect();
        }
        _ => {
            let key = |id: u32| -> u64 {
                let node = &arena.nodes[id as usize];
                if sort_by == "mtime" { node.mtime as u64 } else { node.size }
            };
            matches.sort_unstable_by(|&a, &b| key(a).cmp(&key(b)).then(a.cmp(&b)));
            if !ascending {
                matches.reverse();
            }
            matches.truncate(cap);
        }
    }

    let hits = matches
        .into_iter()
        .map(|id| {
            let node = &arena.nodes[id as usize];
            FileHit {
                id: id as i64,
                name: node.name.to_string(),
                path: arena.node_path(id).to_string_lossy().to_string(),
                size: node.size,
                mtime_ms: node.mtime as u64 * 1000,
                category: category_from_name(&node.name),
            }
        })
        .collect();

    Ok(hits)
}

/// Escape a single CSV field per RFC 4180.
fn csv_field(s: &str) -> String {
    if s.contains(['"', ',', '\n', '\r']) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

/// Render hits as CSV: name,path,size,mtime_iso,category.
pub fn to_csv(hits: &[FileHit]) -> String {
    let mut out = String::from("name,path,size,mtime_iso,category\n");
    for h in hits {
        out.push_str(&csv_field(&h.name));
        out.push(',');
        out.push_str(&csv_field(&h.path));
        out.push(',');
        out.push_str(&h.size.to_string());
        out.push(',');
        out.push_str(&util::iso_from_ms(h.mtime_ms));
        out.push(',');
        out.push_str(h.category.as_str());
        out.push('\n');
    }
    out
}

/// Render hits as a JSON array of FileHit.
pub fn to_json(hits: &[FileHit]) -> Result<String, String> {
    serde_json::to_string_pretty(hits).map_err(|e| format!("Failed to serialize JSON: {e}"))
}

#[tauri::command]
pub fn find_files(
    min_size: u64,
    older_than_days: u32,
    categories: Vec<String>,
    limit: u32,
    sort_by: String,
    ascending: bool,
    state: State<'_, AppState>,
) -> Result<Vec<FileHit>, String> {
    let guard = state.scan.read().unwrap();
    let scan = guard.as_ref().ok_or("No scan results yet")?;
    query_files(
        &scan.arena,
        min_size,
        older_than_days,
        &categories,
        limit,
        &sort_by,
        ascending,
    )
}

#[tauri::command]
pub async fn export_file_list(
    min_size: u64,
    older_than_days: u32,
    categories: Vec<String>,
    limit: u32,
    sort_by: String,
    ascending: bool,
    format: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let fmt = format.to_ascii_lowercase();
    if fmt != "csv" && fmt != "json" {
        return Err(format!("Invalid format '{format}' (expected 'csv' or 'json')"));
    }

    // Compute hits and drop the lock before opening the (blocking) dialog.
    let content = {
        let guard = state.scan.read().unwrap();
        let scan = guard.as_ref().ok_or("No scan results yet")?;
        let hits = query_files(
            &scan.arena,
            min_size,
            older_than_days,
            &categories,
            limit,
            &sort_by,
            ascending,
        )?;
        if fmt == "csv" {
            to_csv(&hits)
        } else {
            to_json(&hits)?
        }
    };

    let default_name = format!("opendisk-files.{fmt}");
    let chosen = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .blocking_save_file();

    let path = match chosen.and_then(|p| p.into_path().ok()) {
        Some(p) => p,
        None => return Ok(None), // user cancelled
    };

    std::fs::write(&path, content).map_err(|e| format!("Failed to write file: {e}"))?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::walk;
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;

    #[test]
    fn find_files_filters_by_size_and_category() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::write(root.join("big.jpg"), vec![1u8; 300_000]).unwrap();
        std::fs::write(root.join("mid.rs"), vec![2u8; 120_000]).unwrap();
        std::fs::write(root.join("tiny.txt"), b"hi").unwrap();

        let cancel = Arc::new(AtomicBool::new(false));
        let progress = Arc::new(crate::scanner::progress::Progress::new());
        let arena = walk::scan(root, cancel, progress).unwrap();

        // min_size filters out tiny.txt; sort_by size desc.
        let hits = query_files(&arena, 100_000, 0, &[], 500, "size", false).unwrap();
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].name, "big.jpg");
        assert_eq!(hits[0].category, FileCategory::Image);
        assert!(hits[0].size >= hits[1].size);

        // ascending flips the order.
        let asc = query_files(&arena, 100_000, 0, &[], 500, "size", true).unwrap();
        assert_eq!(asc[0].name, "mid.rs");

        // name sort is alphabetical, case-insensitive.
        let by_name = query_files(&arena, 0, 0, &[], 500, "name", true).unwrap();
        assert_eq!(by_name[0].name, "big.jpg");

        // category filter: only code files.
        let code = query_files(&arena, 0, 0, &["code".to_string()], 500, "size", false).unwrap();
        assert_eq!(code.len(), 1);
        assert_eq!(code[0].name, "mid.rs");
        assert_eq!(code[0].category, FileCategory::Code);

        // limit is capped and honoured.
        let one = query_files(&arena, 0, 0, &[], 1, "size", false).unwrap();
        assert_eq!(one.len(), 1);
    }

    #[test]
    fn disk_images_are_not_photos() {
        assert_eq!(category_from_name("Docker.raw"), FileCategory::DiskImage);
        assert_eq!(category_from_name("installer.dmg"), FileCategory::DiskImage);
        assert_eq!(category_from_name("ubuntu.iso"), FileCategory::DiskImage);
        assert_eq!(category_from_name("photo.jpg"), FileCategory::Image);
        assert_eq!(category_from_name("shot.CR2"), FileCategory::Image);
        assert_eq!(category_from_name("backup.zip"), FileCategory::Archive);
    }

    #[test]
    fn csv_escaping() {
        let hit = FileHit {
            id: 1,
            name: "a,b\"c".to_string(),
            path: "/tmp/x".to_string(),
            size: 10,
            mtime_ms: 1_609_459_200_000,
            category: FileCategory::Other,
        };
        let csv = to_csv(std::slice::from_ref(&hit));
        assert!(csv.contains("\"a,b\"\"c\""));
        assert!(csv.contains("2021-01-01T00:00:00Z"));
    }
}
