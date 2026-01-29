#!/bin/bash
set -e

echo "=== Building Data Slicer Docker Image ==="
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
docker build --no-cache -t data-slicer:latest .

echo
echo "=== Build Complete ==="
echo "Run with: docker-compose up"
echo "Or: docker run -p 8000:8000 data-slicer:latest"
