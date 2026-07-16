# OpenDisk

**A high-performance, open-source disk space analyzer — inspired by DaisyDisk.**

OpenDisk scans your disk at full speed (Rust, parallel multi-threaded traversal) and visualizes the result as an interactive **sunburst chart**: each ring is a directory level, each arc is a file or folder sized proportionally to the space it occupies. Find and free up disk space in a few clicks.

## Features

- **Blazing-fast scanning** — Rust + parallel traversal across all CPU cores, measuring real on-disk size (block-based, like `du`)
- **Interactive sunburst chart** — hover for details, click to zoom into a folder, click the center to go back, with smooth animations
- **Real-time progress** — watch file counts and accumulated size while the scan is running
- **Detail panel** — files and folders sorted by size, with highlight synced to the chart in both directions
- **Collector** — drag & drop items to collect them, then delete in one batch
- **Safe deletion** — items are moved to the Trash, never deleted permanently
- **Private by design** — no network, no telemetry; your data never leaves your machine
- **Lightweight** — built on Tauri 2, not Electron; small binary, low RAM usage

## Performance

| Technique | Details |
|---|---|
| Parallel scanning | rayon work-stealing across all cores |
| Arena tree | flat `Vec<Node>` + `u32` indices, cache-friendly, millions of nodes |
| Minimal IPC | the tree lives in Rust; the frontend only receives a pruned view (top-N, min-fraction, lazy-loaded on zoom) |
| Throttled progress | atomic counters, emitted 10×/second instead of per file |
| Two-layer canvas | static base layer + hover overlay; hit-testing via polar coordinates + binary search |

## Getting started

Requirements: [Node.js 22](https://nodejs.org), [Rust stable](https://rustup.rs).

```bash
git clone https://github.com/csdlmysql/opendisk.git
cd opendisk
npm install
npm run tauri dev     # run the desktop app
npm run dev           # run the UI in a browser (mock backend)
```

Build a release:

```bash
npm run tauri build
```

### macOS: Full Disk Access

To scan everything (including `~/Library`, Mail, etc.), grant **Full Disk Access** to OpenDisk in *System Settings → Privacy & Security → Full Disk Access*. Without it the app still works, but some folders will be reported as inaccessible.

## Architecture

```
src/            # Frontend: React + TypeScript + Canvas 2D (no chart library)
  sunburst/     # layout, rendering, hit-testing, animation — pure TS modules
  api/          # Tauri IPC wrapper + mock backend for browser development
src-tauri/      # Backend: Rust
  src/scanner/  # parallel traversal, arena tree, progress
  src/view.rs   # tree pruning for IPC
```

## App icon

The icon is generated programmatically (CoreGraphics, deterministic seed):

```bash
swift scripts/generate-icon.swift icon.png   # 1024x1024 source
npx tauri icon icon.png                      # regenerate the full icon set
sips -z 512 512 icon.png --out public/dock-icon.png
```

## Contributing

PRs and issues are welcome! The project is MIT licensed — see [LICENSE](LICENSE).

1. Fork and branch from `main`
2. Use `npm run dev` for UI work against the mock backend, `npm run tauri dev` to test the full app
3. Before opening a PR: `npx tsc --noEmit`, and `cargo test` inside `src-tauri/`

## License

[MIT](LICENSE) © OpenDisk Contributors. Not affiliated with Software Ambience Corp. (DaisyDisk).
