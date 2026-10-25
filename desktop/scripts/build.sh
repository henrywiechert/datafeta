#!/usr/bin/env bash
# Build the desktop app: frontend -> PyInstaller bundle -> OS artifacts + update metadata.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/desktop"

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

if [[ "${SKIP_FRONTEND:-0}" != "1" ]]; then
  "$ROOT_DIR/desktop/scripts/build-frontend.sh"
fi
if [[ ! -d "$ROOT_DIR/backend/static" ]]; then
  echo "ERROR: backend/static is missing. Run desktop/scripts/build-frontend.sh first." >&2
  exit 1
fi

echo "==> Generating backend version.json"
"$PYTHON" "$ROOT_DIR/backend/scripts/generate_version.py"

echo "==> Ensuring PySide6 + PyInstaller are installed"
"$PYTHON" -m pip install -q -r "$DESKTOP_DIR/requirements.txt"

# kaggle authenticates on import, so give PyInstaller dummy credentials for its analysis pass.
export KAGGLE_USERNAME="${KAGGLE_USERNAME:-pyinstaller-ci}"
export KAGGLE_KEY="${KAGGLE_KEY:-0123456789abcdef0123456789abcdef}"

echo "==> Building desktop app with PyInstaller"
rm -rf "$DESKTOP_DIR/dist-pyinstaller" "$DESKTOP_DIR/build-pyinstaller"
"$PYTHON" -m PyInstaller \
  --noconfirm \
  --clean \
  --distpath "$DESKTOP_DIR/dist-pyinstaller" \
  --workpath "$DESKTOP_DIR/build-pyinstaller" \
  "$DESKTOP_DIR/data-slicer.spec"

echo "==> Packaging artifacts"
"$PYTHON" "$DESKTOP_DIR/scripts/package.py"

echo "==> Done. Artifacts under $DESKTOP_DIR/dist"
