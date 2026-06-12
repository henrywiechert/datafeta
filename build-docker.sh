#!/bin/bash
# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
set -e

usage() {
  cat <<'EOF'
Usage: ./build-docker.sh [VERSION]

Build the Data Slicer Docker image.

VERSION:
  stable    Tag image as data-slicer:stable (for docker compose --env-file .env.stable)
  testing   Tag image as data-slicer:testing (for docker compose --env-file .env.testing)
  latest    Tag image as data-slicer:latest (default)
  all       Build once and tag stable, testing, and latest

Examples:
  ./build-docker.sh stable
  ./build-docker.sh testing
  ./build-docker.sh all
EOF
}

VERSION="${1:-latest}"

case "$VERSION" in
  -h|--help)
    usage
    exit 0
    ;;
  stable|testing|latest)
    TAGS=("$VERSION")
    ;;
  all)
    TAGS=(stable testing latest)
    ;;
  *)
    echo "Error: unknown version '$VERSION'" >&2
    echo >&2
    usage >&2
    exit 1
    ;;
esac

echo "=== Building Data Slicer Docker Image ==="
if [ "${#TAGS[@]}" -eq 1 ]; then
  echo "Tag: data-slicer:${TAGS[0]}"
else
  echo "Tags: $(printf 'data-slicer:%s ' "${TAGS[@]}")"
fi
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
PRIMARY_TAG="${TAGS[0]}"
echo "2. Building Docker image..."
docker build --no-cache -t "data-slicer:${PRIMARY_TAG}" .

for tag in "${TAGS[@]:1}"; do
  echo "   Tagging data-slicer:${PRIMARY_TAG} as data-slicer:${tag}"
  docker tag "data-slicer:${PRIMARY_TAG}" "data-slicer:${tag}"
done

echo
echo "=== Build Complete ==="
echo "Image tags: $(printf 'data-slicer:%s ' "${TAGS[@]}")"
echo
case "$VERSION" in
  stable)
    echo "Run with: docker compose --env-file .env.stable up"
    ;;
  testing)
    echo "Run with: docker compose --env-file .env.testing up"
    ;;
  all)
    echo "Run stable:  docker compose --env-file .env.stable up"
    echo "Run testing: docker compose --env-file .env.testing up"
    ;;
  *)
    echo "Run with: docker-compose up"
    echo "Or: docker run -p 8000:8000 data-slicer:latest"
    ;;
esac
