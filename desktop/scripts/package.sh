#!/usr/bin/env bash
# Full Phase-1 desktop package: frontend -> sidecar -> Electron installer/zip.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/desktop"

"$DESKTOP_DIR/scripts/build-frontend.sh"
"$DESKTOP_DIR/scripts/build-sidecar.sh"

echo "==> Installing Electron deps"
(cd "$DESKTOP_DIR" && npm ci --no-audit --no-fund)

echo "==> Packaging Electron app"
# Default: directory + zip-friendly artifacts for the current platform.
(cd "$DESKTOP_DIR" && npm run dist)

echo "==> Done. Artifacts under $DESKTOP_DIR/dist"
