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

## Local release builds & Full Disk Access (macOS)

macOS ties privacy grants (TCC, e.g. Full Disk Access) to the app's code
signature. Tauri's default ad-hoc signing produces a *different* signature on
every build, so each rebuild would lose the grant. For local testing, sign
with a stable self-signed identity instead:

```bash
# One-time: create a self-signed codeSigning cert named "OpenDisk Dev"
cat > /tmp/csr.conf <<'CONF'
[req]
distinguished_name = dn
x509_extensions = v3
prompt = no
[dn]
CN = OpenDisk Dev
[v3]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
subjectKeyIdentifier = hash
CONF
openssl req -x509 -newkey rsa:2048 -keyout /tmp/od.key -out /tmp/od.crt -days 3650 -nodes -config /tmp/csr.conf
openssl pkcs12 -export -out /tmp/od.p12 -inkey /tmp/od.key -in /tmp/od.crt -password pass:tmp -name "OpenDisk Dev"
security import /tmp/od.p12 -k ~/Library/Keychains/login.keychain-db -P tmp -T /usr/bin/codesign
security add-trusted-cert -p codeSign -k ~/Library/Keychains/login.keychain-db /tmp/od.crt
rm /tmp/od.key /tmp/od.p12

# Then build with:
./scripts/build-local.sh
```

Official releases are built by the GitHub Actions release workflow (tag `v*`).

## Reporting bugs

Open an issue with your macOS version, what you scanned, and reproduction steps. Screenshots welcome.
