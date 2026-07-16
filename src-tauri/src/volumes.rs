//! List mounted volumes via sysinfo.

use sysinfo::Disks;

use crate::model::Volume;

pub fn list_volumes() -> Vec<Volume> {
    let disks = Disks::new_with_refreshed_list();
    let mut out: Vec<Volume> = Vec::new();
    let mut root_name: Option<String> = None;

    for disk in &disks {
        let mount_point = disk.mount_point().to_string_lossy().to_string();
        let total_bytes = disk.total_space();
        // Skip pseudo volumes with zero capacity.
        if total_bytes == 0 {
            continue;
        }
        // macOS APFS: `/` is the System snapshot (read-only); the real data lives at
        // `/System/Volumes/Data` (same container, same total/available).
        // Merge the two into ONE volume: keep the Data entry and take the name of `/`
        // (usually "Macintosh HD"). Other macOS virtual volumes are dropped.
        if mount_point == "/" {
            let n = disk.name().to_string_lossy().to_string();
            root_name = Some(if n.is_empty() { "Macintosh HD".into() } else { n });
            continue;
        }
        if mount_point.starts_with("/System/Volumes/")
            && mount_point != "/System/Volumes/Data"
        {
            // Preboot/VM/Update/xarts... not meaningful to the user.
            continue;
        }
        let name = {
            let n = disk.name().to_string_lossy().to_string();
            if n.is_empty() {
                mount_point.clone()
            } else {
                n
            }
        };
        out.push(Volume {
            name,
            mount_point,
            total_bytes,
            available_bytes: disk.available_space(),
            file_system: disk.file_system().to_string_lossy().to_string(),
            is_removable: disk.is_removable(),
        });
    }

    // Name the Data volume "Macintosh HD"; if there is no Data volume (not macOS
    // or a different layout), add `/` back as a regular volume.
    if let Some(data) = out
        .iter_mut()
        .find(|v| v.mount_point == "/System/Volumes/Data")
    {
        if let Some(name) = &root_name {
            data.name = name.clone();
        }
    } else if let Some(name) = root_name {
        let disks = Disks::new_with_refreshed_list();
        if let Some(root) = disks
            .iter()
            .find(|d| d.mount_point().to_string_lossy() == "/")
        {
            out.push(Volume {
                name,
                mount_point: "/".into(),
                total_bytes: root.total_space(),
                available_bytes: root.available_space(),
                file_system: root.file_system().to_string_lossy().to_string(),
                is_removable: false,
            });
        }
    }

    // Largest volume first.
    out.sort_by(|a, b| b.total_bytes.cmp(&a.total_bytes));
    out
}

#[cfg(test)]
mod tests {
    #[test]
    fn list_volumes_repeated_calls() {
        for i in 0..3 {
            let vols = super::list_volumes();
            println!("call {}: {} volumes: {:?}", i, vols.len(),
                vols.iter().map(|v| v.mount_point.clone()).collect::<Vec<_>>());
            assert!(!vols.is_empty(), "call {} returned empty", i);
        }
    }
}
