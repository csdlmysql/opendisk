//! Scanner: arena tree + parallel walk + progress.

pub mod arena;
pub mod progress;
pub mod walk;

use arena::Arena;

/// Result of a single scan, stored in AppState.
pub struct ScanResult {
    pub arena: Arena,
    pub root_id: u32,
    /// Absolute path that was scanned (root of the arena).
    pub root_path: String,
    pub files_scanned: u64,
    pub dirs_scanned: u64,
    pub total_bytes: u64,
    pub duration_ms: u64,
}

#[cfg(test)]
mod tests {
    use super::arena::NONE;
    use super::walk;
    use crate::model::NodeKind;
    use crate::view;
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;

    fn tmp_tree() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        // root/
        //   big.bin      (large)
        //   small.txt    (tiny)
        //   sub/
        //     medium.bin (medium)
        //     tiny1..tiny5 (tiny)
        std::fs::write(root.join("big.bin"), vec![7u8; 400_000]).unwrap();
        std::fs::write(root.join("small.txt"), b"hi").unwrap();
        let sub = root.join("sub");
        std::fs::create_dir(&sub).unwrap();
        std::fs::write(sub.join("medium.bin"), vec![3u8; 80_000]).unwrap();
        for i in 0..5 {
            std::fs::write(sub.join(format!("tiny{i}.txt")), b"x").unwrap();
        }
        dir
    }

    #[test]
    fn scan_builds_structure_and_aggregates() {
        let dir = tmp_tree();
        let cancel = Arc::new(AtomicBool::new(false));
        let progress = Arc::new(super::progress::Progress::new());
        let arena = walk::scan(dir.path(), cancel, progress).unwrap();

        // Root is a dir with 3 children: big.bin, small.txt, sub
        let root = &arena.nodes[0];
        assert_eq!(root.kind, NodeKind::Dir);
        assert_eq!(root.child_count, 3);
        assert_eq!(root.parent, NONE);

        // Invariant: sum of own_size over all nodes == root.size
        let sum_own: u64 = arena.nodes.iter().map(|n| n.own_size).sum();
        assert_eq!(sum_own, root.size, "aggregate size must match total own_size");

        // Root children sorted by size descending
        let child_sizes: Vec<u64> = arena.children(0).map(|c| arena.nodes[c as usize].size).collect();
        let mut sorted = child_sizes.clone();
        sorted.sort_unstable_by(|a, b| b.cmp(a));
        assert_eq!(child_sizes, sorted, "children must be sorted desc");

        // The largest child must be big.bin
        let first = arena.children(0).next().unwrap();
        assert_eq!(&*arena.nodes[first as usize].name, "big.bin");

        // Find the "sub" node and check it has 6 children
        let sub = arena
            .children(0)
            .find(|&c| &*arena.nodes[c as usize].name == "sub")
            .unwrap();
        assert_eq!(arena.nodes[sub as usize].kind, NodeKind::Dir);
        assert_eq!(arena.nodes[sub as usize].child_count, 6);

        // node_path is correct
        let big_path = arena.node_path(first);
        assert_eq!(big_path, dir.path().join("big.bin"));
    }

    #[test]
    fn get_view_prunes_small_children() {
        let dir = tmp_tree();
        let cancel = Arc::new(AtomicBool::new(false));
        let progress = Arc::new(super::progress::Progress::new());
        let arena = walk::scan(dir.path(), cancel, progress).unwrap();

        // Find the sub node
        let sub = arena
            .children(0)
            .find(|&c| &*arena.nodes[c as usize].name == "sub")
            .unwrap();

        // depth=1, max_children=10, large min_fraction -> the tiny files get merged
        let v = view::build_view(&arena, sub, 1, 10, 0.1);
        let children = v.children.expect("sub is expanded");
        // medium.bin kept + 1 virtual node merging the 5 tiny files
        assert!(children.iter().any(|c| c.name == "medium.bin"));
        let virt = children.iter().find(|c| c.id == -1);
        assert!(virt.is_some(), "there must be a merged virtual node");
        let virt = virt.unwrap();
        assert_eq!(virt.kind, NodeKind::Other);
        assert!(virt.name.contains("smaller items"));

        // depth=0 on a node with children -> children = None (not expanded)
        let v0 = view::build_view(&arena, 0, 0, 10, 0.0);
        assert!(v0.children.is_none());
    }

    #[test]
    fn get_view_respects_max_children() {
        let dir = tmp_tree();
        let cancel = Arc::new(AtomicBool::new(false));
        let progress = Arc::new(super::progress::Progress::new());
        let arena = walk::scan(dir.path(), cancel, progress).unwrap();

        let sub = arena
            .children(0)
            .find(|&c| &*arena.nodes[c as usize].name == "sub")
            .unwrap();
        // max_children=1, min_fraction=0 -> 1 real child + 1 virtual node merging the rest
        let v = view::build_view(&arena, sub, 1, 1, 0.0);
        let children = v.children.unwrap();
        assert_eq!(children.len(), 2);
        assert_eq!(children[1].id, -1);
    }

    #[test]
    fn mark_trashed_updates_ancestors() {
        let dir = tmp_tree();
        let cancel = Arc::new(AtomicBool::new(false));
        let progress = Arc::new(super::progress::Progress::new());
        let mut arena = walk::scan(dir.path(), cancel, progress).unwrap();

        let root_size_before = arena.nodes[0].size;
        let big = arena
            .children(0)
            .find(|&c| &*arena.nodes[c as usize].name == "big.bin")
            .unwrap();
        let big_size = arena.nodes[big as usize].size;
        arena.mark_trashed(big);
        assert_eq!(arena.nodes[big as usize].size, 0);
        assert_eq!(arena.nodes[big as usize].kind, NodeKind::Other);
        assert_eq!(arena.nodes[0].size, root_size_before - big_size);
    }
}
