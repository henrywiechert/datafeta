# Deployment

DataSlicer ships as a single Docker image that serves both the API (`/api/v1`) and the web UI. The quick start in the project README covers the one-line installer, `docker run` and Docker Compose. This page covers advanced setups.

---

## Building the image yourself

Version information is generated from git before the build, so use the provided script:

```bash
./build-docker.sh            # builds data-slicer:latest
./build-docker.sh staging    # builds data-slicer:staging
```

Or generate the version files manually:

```bash
(cd frontend && node scripts/generate-version.js)
python3 backend/scripts/generate_version.py
docker build -t data-slicer .
```

---

## Docker Compose flavours

`docker-compose.yml` is driven by an env file. Copy `.env.example`, adjust the values, then build and run:

```bash
cp .env.example .env
./build-docker.sh
docker compose --env-file .env up
```

To run several flavours side by side, use suffixed env files together with a matching image tag. Each flavour needs its own `COMPOSE_PROJECT_NAME`, `CONTAINER_NAME` and `HOST_PORT`:

```bash
# .env.staging must set APP_VERSION=staging
./build-docker.sh staging
docker compose --env-file .env.staging up
```

---

## Separate frontend hosting + backend API

You can host the frontend build on any static host (Netlify, Vercel, S3 + CloudFront, Nginx) and deploy the backend separately. Set `REACT_APP_API_BASE` to the absolute API URL before building the frontend:

```bash
cd frontend
echo "REACT_APP_API_BASE=https://api.example.com/api/v1" > .env.production
npm run build
```

Deploy the resulting `build/` directory to your static host. If the frontend runs on a different origin, set `CORS_ALLOW_ORIGINS` on the backend.

---

## Reverse proxy (Nginx / Traefik)

Run the backend on an internal port (e.g. 8000) and let Nginx serve the static files and proxy the API:

```nginx
location /api/ { proxy_pass http://backend:8000/api/; }
location / { root /usr/share/nginx/html; try_files $uri /index.html; }
```

DataSlicer has no built-in authentication. When exposing it beyond localhost, put it behind a reverse proxy that handles TLS and access control.

---

## Environment variables

All backend and Compose variables are listed in `.env.example`. Commonly used ones:

| Variable | Default | Description |
|---|---|---|
| `LOG_LEVEL` | `INFO` | Backend log level |
| `PORT` | `8000` | Backend port |
| `CORS_ALLOW_ORIGINS` | *(dev origins)* | Comma-separated allowed origins, e.g. `http://localhost:3000,http://127.0.0.1:5173`. Use if the browser reports `Failed to fetch` (CORS) when running the frontend dev server on a non-default host/port |
| `HF_MAX_SPLIT_BYTES_MB` | `500` | Size limit per HuggingFace split, see [Data Sources](data-sources.md#huggingface) |
| `REACT_APP_API_BASE` | `/api/v1` | Frontend build-time API base path or URL. The default is correct when the backend serves the UI |

---

## Local production simulation

```bash
cd frontend
REACT_APP_API_BASE=/api/v1 npm run build
cd ..
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

---

## Health and API docs

When the static build is present, the backend serves the SPA at `/` (client routes such as `/visualize` return the app shell on hard reload). A lightweight health endpoint is available at `/health` and `/api/v1/health`. Interactive API documentation is at `/docs`.
