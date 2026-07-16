//! Prune the arena into a NodeView tree for the frontend.

use crate::model::{NodeKind, NodeView};
use crate::scanner::arena::Arena;

/// Entry: build a view from `node_id`, recursing up to `depth` levels.
/// Merge threshold = `min_fraction * size(node_id)`.
pub fn get_view(
    arena: &Arena,
    node_id: u32,
    depth: u32,
    max_children: u32,
    min_fraction: f64,
) -> NodeView {
    build_view(arena, node_id, depth, max_children, min_fraction)
}

/// `depth` = number of child levels still expandable. The merge threshold is
/// computed from the size of the node being processed (the local view root).
pub fn build_view(
    arena: &Arena,
    id: u32,
    depth: u32,
    max_children: u32,
    min_fraction: f64,
) -> NodeView {
    let node = &arena.nodes[id as usize];

    let children = if node.child_count == 0 {
        // No children -> Some(vec![]).
        Some(Vec::new())
    } else if depth == 0 {
        // Has children but not expanded yet -> None.
        None
    } else {
        let threshold = (min_fraction * node.size as f64).ceil() as u64;
        let mut result: Vec<NodeView> = Vec::new();
        let mut small_sum: u64 = 0;
        let mut small_count: u32 = 0;

        // Children are already sorted by size desc from the scan.
        for c in arena.children(id) {
            let csize = arena.nodes[c as usize].size;
            let keep = (result.len() as u32) < max_children && csize >= threshold;
            if keep {
                result.push(build_view(arena, c, depth - 1, max_children, min_fraction));
            } else {
                small_sum = small_sum.saturating_add(csize);
                small_count += 1;
            }
        }

        if small_count > 0 {
            result.push(NodeView {
                id: -1,
                name: format!("{small_count} smaller items"),
                size: small_sum,
                kind: NodeKind::Other,
                child_count: 0,
                children: Some(Vec::new()),
            });
        }
        Some(result)
    };

    NodeView {
        id: id as i64,
        name: node.name.to_string(),
        size: node.size,
        kind: node.kind,
        child_count: node.child_count,
        children,
    }
}
