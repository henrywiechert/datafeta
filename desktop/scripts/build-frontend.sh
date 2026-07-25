#!/usr/bin/env bash
# Build the React frontend and copy it into backend/static for the sidecar.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
STATIC_DIR="$ROOT_DIR/backend/static"

echo "==> Generating frontend version"
(cd "$FRONTEND_DIR" && node scripts/generate-version.js)

echo "==> Building frontend"
(
  cd "$FRONTEND_DIR"
  if [[ ! -d node_modules ]]; then
    npm ci --no-audit --no-fund
  fi
  npm run build
)

echo "==> Copying frontend build -> backend/static"
rm -rf "$STATIC_DIR"
mkdir -p "$STATIC_DIR"
cp -R "$FRONTEND_DIR/build/." "$STATIC_DIR/"

echo "==> Frontend ready at $STATIC_DIR"
