# Multi-stage build: frontend (React) + backend (FastAPI)

# ===== Frontend build stage =====
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend

# Install git for version generation
RUN apk add --no-cache git

COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./

# Copy .git directory for version generation
COPY .git /app/.git

# Generate version info and build
RUN npm run build

# ===== Backend build stage =====
FROM python:3.11-slim AS backend
WORKDIR /app

# System deps (if any needed later add here)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
  && rm -rf /var/lib/apt/lists/*

# Copy backend code
COPY backend/ ./backend/

# Copy .git directory for version generation
COPY .git ./.git

# Generate backend version
RUN python3 backend/scripts/generate_version.py

# Copy frontend build into backend/static so FastAPI can serve it
COPY --from=frontend-build /app/frontend/build ./backend/static

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
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
