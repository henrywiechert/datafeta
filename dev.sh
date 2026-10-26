#!/usr/bin/env bash
# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
#
# Start backend (uvicorn --reload) and frontend (react-scripts dev server).
# Prepares the Python venv and node_modules first when they are missing or stale.
# Pass --no-setup to skip dependency checks.
# Settings (ports, bind addresses, snapshot dir) come from .env.dev; see .env.dev.example.
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$REPO_DIR/backend"
FRONTEND_DIR="$REPO_DIR/frontend"
VENV_DIR="$BACKEND_DIR/.venv"

# Load .env.dev (if present) and export everything in it to both servers.
if [[ -f "$REPO_DIR/.env.dev" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_DIR/.env.dev"
  set +a
fi

BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8010}"
FRONTEND_HOST="${FRONTEND_HOST:-localhost}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
SNAPSHOT_STORAGE_DIR="${SNAPSHOT_STORAGE_DIR:-../data-slicer-data/snapshots}"
[[ "$SNAPSHOT_STORAGE_DIR" = /* ]] || SNAPSHOT_STORAGE_DIR="$REPO_DIR/$SNAPSHOT_STORAGE_DIR"
export SNAPSHOT_STORAGE_DIR

# The frontend proxy needs a connectable address, so a wildcard bind maps to localhost.
case "$BACKEND_HOST" in
  0.0.0.0|::|"[::]") proxy_host=localhost ;;
  *:*) proxy_host="[$BACKEND_HOST]" ;;
  *) proxy_host="$BACKEND_HOST" ;;
esac
export DEV_BACKEND_URL="http://$proxy_host:$BACKEND_PORT"

BLUE='\033[0;34m'
GREEN='\033[0;32m'
RESET='\033[0m'

label_output() {
  local label="$1" color="$2"
  while IFS= read -r line; do
    printf "${color}[%-8s]${RESET} %s\n" "$label" "$line"
  done
}

# Run "$@" only when any of the stamp's input files is newer than the stamp.
needs_update() {
  local stamp="$1"; shift
  [[ -f "$stamp" ]] || return 0
  local f
  for f in "$@"; do
    [[ "$f" -nt "$stamp" ]] && return 0
  done
  return 1
}

setup_backend() {
  if [[ ! -x "$VENV_DIR/bin/python" ]]; then
    local py
    py="$(command -v python3.12 || command -v python3.13 || command -v python3.14 || command -v python3.11 || command -v python3 || true)"
    [[ -n "$py" ]] || { echo "ERROR: no python3 found" >&2; exit 1; }
    echo "Creating virtualenv in $VENV_DIR using $py"
    "$py" -m venv "$VENV_DIR"
  fi

  local stamp="$VENV_DIR/.deps-installed"
  if needs_update "$stamp" "$BACKEND_DIR/requirements.txt" "$BACKEND_DIR/requirements-dev.txt"; then
    echo "Installing backend dependencies..."
    "$VENV_DIR/bin/python" -m pip install -r "$BACKEND_DIR/requirements.txt" -r "$BACKEND_DIR/requirements-dev.txt"
    touch "$stamp"
  fi
}

setup_frontend() {
  local stamp="$FRONTEND_DIR/node_modules/.deps-installed"
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]] || needs_update "$stamp" "$FRONTEND_DIR/package.json" "$FRONTEND_DIR/package-lock.json"; then
    echo "Installing frontend dependencies..."
    (cd "$FRONTEND_DIR" && npm install)
    touch "$stamp"
  fi
}

if [[ "$1" != "--no-setup" ]]; then
  setup_backend
  setup_frontend
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

cleanup() {
  trap - INT TERM EXIT
  echo ""
  echo "Shutting down..."
  # Kill the whole backend process group so the reloader's child dies too.
  kill -- -"$BACKEND_PID" 2>/dev/null || kill "$BACKEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# Start backend with labeled output (own process group via job control)
set -m
uvicorn backend.main:app --reload --host "$BACKEND_HOST" --port "$BACKEND_PORT" \
  --h11-max-incomplete-event-size 131072 \
  --app-dir "$REPO_DIR" \
  > >(label_output "backend" "$BLUE") 2>&1 &
BACKEND_PID=$!
set +m
echo "Backend PID: $BACKEND_PID ($DEV_BACKEND_URL)"

# Start frontend with labeled output (foreground — Ctrl+C stops everything via trap)
cd "$FRONTEND_DIR"
HOST="$FRONTEND_HOST" PORT="$FRONTEND_PORT" BROWSER=none npm start 2>&1 | label_output "frontend" "$GREEN"
