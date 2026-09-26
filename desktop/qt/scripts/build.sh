#!/usr/bin/env bash
# Build the Qt desktop shell: frontend -> PyInstaller bundle -> OS artifacts + update metadata.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
QT_DIR="$ROOT_DIR/desktop/qt"

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
"$PYTHON" -m pip install -q -r "$QT_DIR/requirements.txt"

# kaggle authenticates on import; see desktop/scripts/build-sidecar.sh.
export KAGGLE_USERNAME="${KAGGLE_USERNAME:-pyinstaller-ci}"
export KAGGLE_KEY="${KAGGLE_KEY:-0123456789abcdef0123456789abcdef}"

echo "==> Building Qt shell with PyInstaller"
rm -rf "$QT_DIR/dist-pyinstaller" "$QT_DIR/build-pyinstaller"
"$PYTHON" -m PyInstaller \
  --noconfirm \
  --clean \
  --distpath "$QT_DIR/dist-pyinstaller" \
  --workpath "$QT_DIR/build-pyinstaller" \
  "$QT_DIR/data-slicer-qt.spec"

echo "==> Packaging artifacts"
"$PYTHON" "$QT_DIR/scripts/package.py"

echo "==> Done. Artifacts under $QT_DIR/dist"
