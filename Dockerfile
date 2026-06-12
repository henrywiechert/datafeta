# Multi-stage build: frontend (React) + backend (FastAPI)

# ===== Frontend build stage =====
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend

RUN apk add --no-cache git

COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
COPY .git /app/.git

# Generate version.json from git, then build (prebuild would regenerate it again)
RUN node scripts/generate-version.js && npm run build

# ===== Docs build stage =====
FROM python:3.11-slim AS docs-build
WORKDIR /app

COPY docs-requirements.txt ./
RUN pip install --no-cache-dir -r docs-requirements.txt

COPY mkdocs.yml ./
COPY docs/ ./docs/
RUN mkdocs build --strict

# ===== Backend build stage =====
FROM python:3.11-slim AS backend
WORKDIR /app

# System deps (if any needed later add here)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
  && rm -rf /var/lib/apt/lists/*

COPY backend/ ./backend/
COPY .git /app/.git
RUN python3 backend/scripts/generate_version.py

# Copy frontend build into backend/static so FastAPI can serve it
COPY --from=frontend-build /app/frontend/build ./backend/static

# Copy docs build so FastAPI can serve the user manual at /help
COPY --from=docs-build /app/site ./site

# Install Python dependencies
WORKDIR /app/backend
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Switch back to project root so backend package imports resolve correctly
WORKDIR /app

# Environment
ENV PORT=8000 \
    LOG_LEVEL=info

EXPOSE 8000

# Default command (can be overridden in docker-compose)
# --h11-max-incomplete-event-size increases max HTTP header size (default 16KB, set to 128KB)
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--h11-max-incomplete-event-size", "131072"]
