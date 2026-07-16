mod commands;
mod duplicates;
mod finder;
mod model;
mod scanner;
mod snapshot;
mod util;
mod view;
mod volumes;

use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::list_volumes,
            commands::start_scan,
            commands::cancel_scan,
            commands::get_view,
            commands::get_node_path,
            commands::reveal_in_finder,
            commands::move_to_trash,
            commands::pick_folder,
            commands::quick_look,
            commands::open_in_terminal,
            commands::set_dock_icon,
            finder::find_files,
            finder::export_file_list,
            snapshot::save_snapshot,
            snapshot::list_snapshots,
            snapshot::delete_snapshot,
            snapshot::diff_with_snapshot,
            duplicates::find_duplicates,
            duplicates::cancel_duplicates,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
