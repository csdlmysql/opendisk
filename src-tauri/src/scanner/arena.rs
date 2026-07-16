//! Arena-based tree: flat `Vec<Node>`, u32 indices, NO Box/Rc/RefCell for the tree.

use crate::model::NodeKind;

/// Sentinel for "none" (parent/child/sibling).
pub const NONE: u32 = u32::MAX;

/// A node in the arena. Links are u32 indices into the same `Vec<Node>`.
#[derive(Debug, Clone)]
pub struct Node {
    /// Component name (not the full path). The root holds the base path.
    pub name: Box<str>,
    /// Aggregated size (own_size + sum of children sizes). Real bytes on disk.
    pub size: u64,
    /// Size of this entry itself (blocks * 512).
    pub own_size: u64,
    pub parent: u32,
    pub first_child: u32,
    pub next_sibling: u32,
    pub child_count: u32,
    pub kind: NodeKind,
    /// Modification time in unix seconds (0 if unavailable).
    pub mtime: u32,
}

impl Node {
    pub fn new(name: impl Into<Box<str>>, own_size: u64, kind: NodeKind, mtime: u32) -> Self {
        Node {
            name: name.into(),
            size: own_size,
            own_size,
            parent: NONE,
            first_child: NONE,
            next_sibling: NONE,
            child_count: 0,
            kind,
            mtime,
        }
    }
}

/// Flat arena. Node index 0 is the root of the (sub)tree.
#[derive(Debug, Clone, Default)]
pub struct Arena {
    pub nodes: Vec<Node>,
}

impl Arena {
    pub fn with_root(root: Node) -> Self {
        Arena { nodes: vec![root] }
    }

    #[inline]
    pub fn len(&self) -> usize {
        self.nodes.len()
    }

    #[inline]
    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }

    #[inline]
    pub fn get(&self, id: u32) -> Option<&Node> {
        self.nodes.get(id as usize)
    }

    /// Merge a sub-arena into self, offsetting all of its internal indices.
    /// Returns the new index of the sub-arena root within self.
    pub fn append_subtree(&mut self, other: Arena) -> u32 {
        let offset = self.nodes.len() as u32;
        for mut n in other.nodes {
            if n.parent != NONE {
                n.parent += offset;
            }
            if n.first_child != NONE {
                n.first_child += offset;
            }
            if n.next_sibling != NONE {
                n.next_sibling += offset;
            }
            self.nodes.push(n);
        }
        offset
    }

    /// Add a leaf node, returning its index.
    pub fn push_leaf(&mut self, node: Node) -> u32 {
        let idx = self.nodes.len() as u32;
        self.nodes.push(node);
        idx
    }

    /// Attach a list of children (already sorted by size desc) to the `parent` node.
    /// Updates children parent/next_sibling and the parent's first_child/child_count/size.
    pub fn attach_children(&mut self, parent: u32, children: &[u32]) {
        if children.is_empty() {
            return;
        }
        for &c in children {
            self.nodes[c as usize].parent = parent;
        }
        for w in children.windows(2) {
            self.nodes[w[0] as usize].next_sibling = w[1];
        }
        if let Some(&last) = children.last() {
            self.nodes[last as usize].next_sibling = NONE;
        }
        let mut children_size: u64 = 0;
        for &c in children {
            children_size = children_size.saturating_add(self.nodes[c as usize].size);
        }
        let p = &mut self.nodes[parent as usize];
        p.first_child = children[0];
        p.child_count = children.len() as u32;
        p.size = p.own_size.saturating_add(children_size);
    }

    /// Iterate the indices of the direct children of `id`.
    pub fn children(&self, id: u32) -> ChildIter<'_> {
        let first = self.get(id).map(|n| n.first_child).unwrap_or(NONE);
        ChildIter {
            arena: self,
            cur: first,
        }
    }

    /// Absolute path of the node (root.name = base path).
    pub fn node_path(&self, id: u32) -> std::path::PathBuf {
        let mut parts: Vec<&str> = Vec::new();
        let mut cur = id;
        loop {
            let node = &self.nodes[cur as usize];
            parts.push(&node.name);
            if node.parent == NONE {
                break;
            }
            cur = node.parent;
        }
        parts.reverse();
        let mut p = std::path::PathBuf::from(parts[0]);
        for part in &parts[1..] {
            p.push(part);
        }
        p
    }

    /// Mark a node as trashed: kind Other, size 0, subtract its size from ancestors.
    pub fn mark_trashed(&mut self, id: u32) {
        let removed = self.nodes[id as usize].size;
        // subtract from ancestors
        let mut cur = self.nodes[id as usize].parent;
        while cur != NONE {
            let n = &mut self.nodes[cur as usize];
            n.size = n.size.saturating_sub(removed);
            cur = n.parent;
        }
        let n = &mut self.nodes[id as usize];
        n.size = 0;
        n.own_size = 0;
        n.kind = NodeKind::Other;
    }
}

pub struct ChildIter<'a> {
    arena: &'a Arena,
    cur: u32,
}

impl<'a> Iterator for ChildIter<'a> {
    type Item = u32;
    fn next(&mut self) -> Option<u32> {
        if self.cur == NONE {
            return None;
        }
        let idx = self.cur;
        self.cur = self.arena.nodes[idx as usize].next_sibling;
        Some(idx)
    }
}
