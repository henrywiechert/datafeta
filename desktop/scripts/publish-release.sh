#!/usr/bin/env bash
# Build desktop artifacts and publish a GitHub Release for electron-updater.
#
# Prerequisites:
#   - GH_TOKEN (or GITHUB_TOKEN) with `repo` scope for henrywiechert/data-slicer
#   - Bump desktop/package.json "version" before publishing
#
# Usage (from repo root, on the target OS):
#   ./desktop/scripts/publish-release.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/desktop"

if [[ -z "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]]; then
  echo "ERROR: Set GH_TOKEN (or GITHUB_TOKEN) before publishing." >&2
  exit 1
fi

# Prefer GH_TOKEN for electron-builder / electron-updater tooling.
export GH_TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}"

VERSION="$(node -p "require('$DESKTOP_DIR/package.json').version")"
echo "==> Publishing Data Slicer desktop v${VERSION}"

"$DESKTOP_DIR/scripts/package.sh"

echo "==> Uploading release assets to GitHub"
(cd "$DESKTOP_DIR" && npm run dist:publish)

echo "==> Published v${VERSION}"
echo "    Clients check GitHub Releases (or DATAFETA_UPDATE_URL if set)."
