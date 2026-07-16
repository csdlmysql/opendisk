//! Tauri commands + AppState.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::model::{NodeView, ScanComplete, ScanError, Volume};
use crate::scanner::{arena::Arena, progress::Progress, walk, ScanResult};
use crate::view;
use crate::volumes;

/// Global state registered via Builder::manage.
pub struct AppState {
    pub scan: RwLock<Option<ScanResult>>,
    pub cancel: Arc<AtomicBool>,
    /// Cancel flag for a running duplicate scan (independent of `cancel`).
    pub dup_cancel: Arc<AtomicBool>,
}

impl Default for AppState {
    fn default() -> Self {
        AppState {
            scan: RwLock::new(None),
            cancel: Arc::new(AtomicBool::new(false)),
            dup_cancel: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[tauri::command]
pub fn list_volumes() -> Vec<Volume> {
    volumes::list_volumes()
}

#[tauri::command]
pub fn start_scan(path: String, state: State<'_, AppState>, app: AppHandle) {
    // Reset the cancel flag for the new scan.
    state.cancel.store(false, Ordering::SeqCst);
    let cancel = state.cancel.clone();
    let progress = Arc::new(Progress::new());

    // Throttle thread emitting scan-progress every 100ms.
    let done = Arc::new(AtomicBool::new(false));
    {
        let app = app.clone();
        let progress = progress.clone();
        let done = done.clone();
        std::thread::spawn(move || loop {
            let _ = app.emit("scan-progress", progress.snapshot());
            if done.load(Ordering::SeqCst) {
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        });
    }

    // Scan thread (does NOT block the async runtime). rayon runs inside.
    let scan_progress = progress.clone();
    std::thread::spawn(move || {
        let result = walk::scan(std::path::Path::new(&path), cancel, scan_progress.clone());
        done.store(true, Ordering::SeqCst);

        let state = app.state::<AppState>();
        match result {
            Ok(arena) => {
                let root = &arena.nodes[0];
                let total_bytes = root.size;
                let files = scan_progress.files.load(Ordering::Relaxed);
                let dirs = scan_progress.dirs.load(Ordering::Relaxed);
                let duration_ms = scan_progress.elapsed_ms();
                let complete = ScanComplete {
                    root_id: 0,
                    total_bytes,
                    files_scanned: files,
                    dirs_scanned: dirs,
                    duration_ms,
                };
                *state.scan.write().unwrap() = Some(ScanResult {
                    arena,
                    root_id: 0,
                    root_path: path.clone(),
                    files_scanned: files,
                    dirs_scanned: dirs,
                    total_bytes,
                    duration_ms,
                });
                let _ = app.emit("scan-complete", complete);
            }
            Err(e) => {
                let _ = app.emit(
                    "scan-error",
                    ScanError {
                        message: format!("Failed to scan '{path}': {e}"),
                    },
                );
            }
        }
    });
}

#[tauri::command]
pub fn cancel_scan(state: State<'_, AppState>) {
    state.cancel.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub fn get_view(
    node_id: i64,
    depth: u32,
    max_children: u32,
    min_fraction: f64,
    state: State<'_, AppState>,
) -> Result<NodeView, String> {
    let guard = state.scan.read().unwrap();
    let scan = guard.as_ref().ok_or("No scan results yet")?;
    let id = resolve_id(&scan.arena, node_id)?;
    Ok(view::get_view(&scan.arena, id, depth, max_children, min_fraction))
}

#[tauri::command]
pub fn get_node_path(node_id: i64, state: State<'_, AppState>) -> Result<String, String> {
    let guard = state.scan.read().unwrap();
    let scan = guard.as_ref().ok_or("No scan results yet")?;
    let id = resolve_id(&scan.arena, node_id)?;
    Ok(scan.arena.node_path(id).to_string_lossy().to_string())
}

#[tauri::command]
pub fn reveal_in_finder(node_id: i64, state: State<'_, AppState>) -> Result<(), String> {
    let path = {
        let guard = state.scan.read().unwrap();
        let scan = guard.as_ref().ok_or("No scan results yet")?;
        let id = resolve_id(&scan.arena, node_id)?;
        scan.arena.node_path(id)
    };
    std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to open Finder: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn move_to_trash(node_id: i64, state: State<'_, AppState>) -> Result<(), String> {
    // Resolve the path first (short read lock).
    let path = {
        let guard = state.scan.read().unwrap();
        let scan = guard.as_ref().ok_or("No scan results yet")?;
        let id = resolve_id(&scan.arena, node_id)?;
        scan.arena.node_path(id)
    };
    // Move to Trash (NEVER unlink directly).
    trash::delete(&path).map_err(|e| format!("Failed to move to Trash: {e}"))?;

    // Update the arena.
    let mut guard = state.scan.write().unwrap();
    if let Some(scan) = guard.as_mut() {
        let id = resolve_id(&scan.arena, node_id)?;
        scan.arena.mark_trashed(id);
        scan.total_bytes = scan.arena.nodes[scan.root_id as usize].size;
    }
    Ok(())
}

#[tauri::command]
pub fn quick_look(node_id: i64, state: State<'_, AppState>) -> Result<(), String> {
    let path = {
        let guard = state.scan.read().unwrap();
        let scan = guard.as_ref().ok_or("No scan results yet")?;
        let id = resolve_id(&scan.arena, node_id)?;
        scan.arena.node_path(id)
    };
    // macOS Quick Look preview.
    std::process::Command::new("qlmanage")
        .arg("-p")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to open Preview: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn open_in_terminal(node_id: i64, state: State<'_, AppState>) -> Result<(), String> {
    let path = {
        let guard = state.scan.read().unwrap();
        let scan = guard.as_ref().ok_or("No scan results yet")?;
        let id = resolve_id(&scan.arena, node_id)?;
        let p = scan.arena.node_path(id);
        // For a file, open its parent directory.
        if p.is_dir() { p } else { p.parent().map(|d| d.to_path_buf()).unwrap_or(p) }
    };
    std::process::Command::new("open")
        .arg("-a")
        .arg("Terminal")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to open Terminal: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn pick_folder(app: AppHandle) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    // Async command runs on the async runtime thread pool, so a blocking dialog is safe here.
    app.dialog()
        .file()
        .blocking_pick_folder()
        .and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().to_string())
}

/// Original Dock icon (retained NSImage pointer), saved before the first override.
/// 0 = not saved yet, 1 = original was nil. Only touched on the main thread.
#[cfg(target_os = "macos")]
static ORIGINAL_DOCK_ICON: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

/// Set the Dock icon to a PNG rendered by the frontend (app icon + progress ring),
/// or restore the original icon when `png_base64` is None. macOS only; no-op elsewhere.
#[tauri::command]
pub fn set_dock_icon(png_base64: Option<String>, app: AppHandle) {
    #[cfg(target_os = "macos")]
    {
        use base64::Engine;
        let bytes = png_base64
            .and_then(|b| base64::engine::general_purpose::STANDARD.decode(b).ok());
        // AppKit requires the main thread for NSApplication calls.
        let _ = app.run_on_main_thread(move || unsafe {
            use objc::runtime::Object;
            use objc::{class, msg_send, sel, sel_impl};
            use std::sync::atomic::Ordering;
            type Id = *mut Object;
            let nsapp: Id = msg_send![class!(NSApplication), sharedApplication];
            match &bytes {
                Some(b) => {
                    // Save the original icon once so we can restore it later
                    // (setting nil would fall back to the generic executable icon).
                    if ORIGINAL_DOCK_ICON.load(Ordering::Relaxed) == 0 {
                        let cur: Id = msg_send![nsapp, applicationIconImage];
                        if cur.is_null() {
                            ORIGINAL_DOCK_ICON.store(1, Ordering::Relaxed);
                        } else {
                            let _: Id = msg_send![cur, retain];
                            ORIGINAL_DOCK_ICON.store(cur as usize, Ordering::Relaxed);
                        }
                    }
                    let data: Id = msg_send![
                        class!(NSData),
                        dataWithBytes: b.as_ptr()
                        length: b.len() as u64
                    ];
                    let image: Id = msg_send![class!(NSImage), alloc];
                    let image: Id = msg_send![image, initWithData: data];
                    if !image.is_null() {
                        let _: () = msg_send![nsapp, setApplicationIconImage: image];
                        // setApplicationIconImage retains; release our +1 from alloc/init.
                        let _: () = msg_send![image, release];
                    }
                }
                None => {
                    let saved = ORIGINAL_DOCK_ICON.load(Ordering::Relaxed);
                    if saved == 0 {
                        // Never overridden — nothing to restore (setting nil here
                        // would fall back to the generic executable icon in dev).
                        return;
                    }
                    let original: Id = if saved > 1 { saved as Id } else { std::ptr::null_mut() };
                    let _: () = msg_send![nsapp, setApplicationIconImage: original];
                    // Keep the saved original retained: rescans reuse it.
                }
            }
        });
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (png_base64, app);
    }
}

/// Coerce an i64 id (from the frontend) to a valid u32 arena index.
fn resolve_id(arena: &Arena, node_id: i64) -> Result<u32, String> {
    if node_id < 0 {
        return Err("Invalid node_id (virtual node)".into());
    }
    let id = node_id as usize;
    if id >= arena.len() {
        return Err(format!("node_id {node_id} out of range"));
    }
    Ok(id as u32)
}
