#!/bin/bash
# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
set -e

usage() {
  cat <<'EOF'
Usage: ./build-docker.sh [SUFFIX]

Build the Data Slicer Docker image.

SUFFIX:
  Image tag and env-file suffix (default: latest).
  Builds data-slicer:<SUFFIX> and is run via:
    docker compose --env-file .env.<SUFFIX> up
  The matching env file should set APP_VERSION=<SUFFIX>.

Examples:
  ./build-docker.sh
  ./build-docker.sh staging
EOF
}

SUFFIX="${1:-latest}"

case "$SUFFIX" in
  -h|--help)
    usage
    exit 0
    ;;
esac

if [[ -z "$SUFFIX" || "$SUFFIX" == *"/"* || "$SUFFIX" == *".."* || "$SUFFIX" =~ [[:space:]] ]]; then
  echo "Error: invalid suffix '$SUFFIX' (no whitespace, '/', or '..')" >&2
  echo >&2
  usage >&2
  exit 1
fi

echo "=== Building Data Slicer Docker Image ==="
echo "Tag: data-slicer:${SUFFIX}"
echo

# Generate version files before building Docker image
echo "1. Generating version information..."

# Generate frontend version
echo "   - Generating frontend version..."
cd frontend
node scripts/generate-version.js
cd ..

# Generate backend version
echo "   - Generating backend version..."
python3 backend/scripts/generate_version.py

echo "   ✓ Version files generated"
echo

# Build Docker image
echo "2. Building Docker image..."
docker build --no-cache -t "data-slicer:${SUFFIX}" .

echo
echo "=== Build Complete ==="
echo "Image tag: data-slicer:${SUFFIX}"
echo
echo "Run with: docker compose --env-file .env.${SUFFIX} up"
echo "(ensure .env.${SUFFIX} sets APP_VERSION=${SUFFIX})"
