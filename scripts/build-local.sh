#!/usr/bin/env bash
# Local universal build signed with the stable self-signed "OpenDisk Dev"
# identity so macOS TCC grants (e.g. Full Disk Access) survive rebuilds.
# One-time setup: create a self-signed codeSigning certificate named
# "OpenDisk Dev" in the login keychain (see CONTRIBUTING.md).
set -euo pipefail
cd "$(dirname "$0")/.."
export APPLE_SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:-OpenDisk Dev}"
exec npm run tauri build -- --target universal-apple-darwin "$@"
