#!/usr/bin/env bash
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV="$REPO_DIR/../venv/bin/activate"

BLUE='\033[0;34m'
GREEN='\033[0;32m'
RESET='\033[0m'

label_output() {
  local label="$1" color="$2"
  while IFS= read -r line; do
    printf "${color}[%-8s]${RESET} %s\n" "$label" "$line"
  done
}

# Activate virtualenv if present
if [[ -f "$VENV" ]]; then
  source "$VENV"
fi

cleanup() {
  echo ""
  echo "Shutting down..."
  kill "$BACKEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# Start backend with labeled output
SNAPSHOT_STORAGE_DIR="$REPO_DIR/../data-slicer-data/snapshots" \
  uvicorn backend.main:app --reload --h11-max-incomplete-event-size 131072 \
  --app-dir "$REPO_DIR" \
  > >(label_output "backend" "$BLUE") 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# Start frontend with labeled output (foreground — Ctrl+C stops everything via trap)
cd "$REPO_DIR/frontend"
BROWSER=none npm start 2>&1 | label_output "frontend" "$GREEN"
