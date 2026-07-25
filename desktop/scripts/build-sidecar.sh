#!/usr/bin/env bash
# Package the FastAPI backend with PyInstaller (onedir) for the Electron extraResources.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/desktop"
SPEC="$DESKTOP_DIR/sidecar/datafeta-backend.spec"
OUT_DIR="$DESKTOP_DIR/dist-sidecar"
WORK_DIR="$DESKTOP_DIR/build-sidecar"

PYTHON="${DATAFETA_PYTHON:-}"
if [[ -z "$PYTHON" ]]; then
  if [[ -x "$ROOT_DIR/backend/.venv/bin/python" ]]; then
    PYTHON="$ROOT_DIR/backend/.venv/bin/python"
  elif [[ -x "$ROOT_DIR/.venv/bin/python" ]]; then
    PYTHON="$ROOT_DIR/.venv/bin/python"
  else
    PYTHON="$(command -v python3 || command -v python)"
  fi
fi

echo "==> Using Python: $PYTHON"
"$PYTHON" -c 'import sys; assert sys.version_info >= (3, 11), sys.version'

echo "==> Generating backend version.json"
"$PYTHON" "$ROOT_DIR/backend/scripts/generate_version.py"

if [[ ! -d "$ROOT_DIR/backend/static" ]]; then
  echo "ERROR: backend/static is missing. Run desktop/scripts/build-frontend.sh first." >&2
  exit 1
fi

echo "==> Ensuring PyInstaller is installed"
"$PYTHON" -m pip install -q -r "$DESKTOP_DIR/requirements-build.txt"

echo "==> Building sidecar with PyInstaller"
rm -rf "$OUT_DIR" "$WORK_DIR"
"$PYTHON" -m PyInstaller \
  --noconfirm \
  --clean \
  --distpath "$OUT_DIR" \
  --workpath "$WORK_DIR" \
  "$SPEC"

BIN="$OUT_DIR/datafeta-backend/datafeta-backend"
if [[ -f "${BIN}.exe" ]]; then
  BIN="${BIN}.exe"
fi

if [[ ! -f "$BIN" ]]; then
  echo "ERROR: Expected sidecar binary at $BIN" >&2
  exit 1
fi

echo "==> Sidecar built at $OUT_DIR/datafeta-backend"
echo "    Smoke-test: DATAFETA_PORT=8765 DATAFETA_DATA_DIR=/tmp/datafeta-desktop-test \"$BIN\""
