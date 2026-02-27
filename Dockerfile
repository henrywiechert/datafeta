# Multi-stage build: frontend (React) + backend (FastAPI)

# ===== Frontend build stage =====
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./

# Build without running prebuild script (version.json already generated before Docker build)
RUN npx react-scripts build

# ===== Backend build stage =====
FROM python:3.11-slim AS backend
WORKDIR /app

# System deps (if any needed later add here)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
  && rm -rf /var/lib/apt/lists/*

# Copy backend code (version.json should already be generated and copied)
COPY backend/ ./backend/

# Copy frontend build into backend/static so FastAPI can serve it
COPY --from=frontend-build /app/frontend/build ./backend/static

# Install Python dependencies
WORKDIR /app/backend
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Switch back to project root so backend package imports resolve correctly
WORKDIR /app

# Environment
ENV PORT=8001 \
    LOG_LEVEL=info

EXPOSE 8000

# Default command (can be overridden in docker-compose)
# --h11-max-incomplete-event-size increases max HTTP header size (default 16KB, set to 128KB)
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8001", "--h11-max-incomplete-event-size", "131072"]
