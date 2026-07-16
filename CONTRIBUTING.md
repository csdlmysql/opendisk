# Contributing to OpenDisk

Thanks for your interest in contributing! OpenDisk is a community-driven, high-performance disk space analyzer built with Tauri 2 (Rust) and React.

## Development setup

Requirements: [Node.js 22](https://nodejs.org), [Rust stable](https://rustup.rs), macOS (primary target).

```bash
git clone git@github.com:csdlmysql/opendisk.git
cd opendisk
npm install
npm run tauri dev     # full desktop app
npm run dev           # UI only in a browser, against the mock backend
```

The mock backend (`src/api/mock.ts`) simulates scans, snapshots and duplicate detection, so most UI work needs no Rust toolchain at all.

## Project layout

```
src/            # React + TypeScript frontend
  sunburst/     # canvas layout/render/hit-test/animation (pure TS)
  api/          # Tauri IPC wrapper + mock backend
src-tauri/      # Rust backend
  src/scanner/  # parallel scanner, arena tree, progress
  src/finder.rs, snapshot.rs, duplicates.rs
```

The IPC contract lives in `src/types/model.ts` and `src-tauri/src/model.rs` — they must stay in sync (serde camelCase).

## Before opening a PR

```bash
npx tsc --noEmit                             # typecheck
npm run build                                # frontend build
cargo test --manifest-path src-tauri/Cargo.toml
```

- Keep user-facing strings in English.
- Never delete files directly — always move to Trash (`trash` crate).
- Performance matters: no full-tree IPC transfers, no per-file events, no unthrottled canvas redraws.

## Reporting bugs

Open an issue with your macOS version, what you scanned, and reproduction steps. Screenshots welcome.
