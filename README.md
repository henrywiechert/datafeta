# Data Slicer - Data Analysis Platform (OLAP in Browser)

A modern data analysis platform that provides intuitive visualization and querying capabilities for multiple data sources including databases and files. It implements many aspects of the openly available [Polaris Formalism](https://graphics.stanford.edu/projects/polaris), later commercially productized as [Tableau (Salesforce)](https://www.tableau.com).

## Overview

Data Slicer is a full-stack data analysis platform consisting of:

- **Frontend**: React-based web application providing interactive data visualization and exploration
- **Backend**: FastAPI-based REST API supporting multiple data source connectors and query execution and optimization for large datasets

## Key Features

### Data Source Support
- **Database Connectivity**: Connect to various databases through configurable connectors
- **File Support**: Upload and analyze CSV/Parquet files using integrated DuckDB engine in backend
- **Kaggle Datasets**: Connect to public [Kaggle](https://www.kaggle.com/datasets) datasets by dataset reference (`owner/dataset-name`). Credentials (username + API key) are provided at connect time and never saved.
- **HuggingFace Datasets**: Connect to public (or private) [HuggingFace](https://huggingface.co/datasets) datasets via the Dataset Viewer Parquet API. Datasets are queried as remote Parquet shards by DuckDB — no full download required. An optional access token supports gated/private datasets. Large splits are blocked at connect time via a configurable size limit (`HF_MAX_SPLIT_BYTES_MB`, default 500 MB).
- **Hive Parquet**: Connect to locally-partitioned Parquet datasets in Hive-style directory layouts.
- **Query Generation**: Dynamic SQL query generation with pypika notation
- **Efficient Caching**: In-Browser [DuckDB WASM](https://duckdb.org/docs/stable/clients/wasm/overview) based column caching for best UX

### Visualization Capabilities
- **Interactive Charts**: Dynamic chart generation using [Observable Plot](https://observablehq.com/plot)
- **Multi-Chart Faceting**: Sophisticated faceting system for multi-dimensional data exploration
- **Field Classification**: Intelligent field type detection and classification system
- **Multi-Sheet Support**: Create and manage multiple visualization sheets in a single workspace
- **Save/Load Configurations**: Export and import complete workspace configurations as JSON files

### Architecture
- **Frontend**: React with TypeScript, Material-UI components
- **Backend**: FastAPI with Python, supporting multiple database connectors, arrow transport
- **Data Processing**: DuckDB for file-based data processing
- **State Management**: Context-based state management with loading and error handling

## Getting Started

### Frontend Development
```bash
cd frontend
npm install
npm start
```

### Backend Development
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

If you prefer running from the repo root:

```bash
python -m pip install -r backend/requirements.txt
uvicorn backend.main:app --reload
```

Run all backend and frontend tests from the repo root with:

```bash
make test
```

## License and Contributions

This project is licensed under the GNU Affero General Public License v3.0 only. See the root `LICENSE` file for the full license text.

Contributions are accepted only under the contributor terms in `CLA.md` or `CLA_CORPORATE.md`, as applicable. Pull requests are expected to pass the repository CLA check before merge.

## Documentation Structure

- [`frontend/`](./frontend/README.md) - Frontend application documentation
- [`backend/`](./backend/README.md) - Backend API and service documentation
- [`frontend/ARROW.md`](./frontend/ARROW.md) - Arrow transport between backend and frontend
- [`frontend/DUCKDB_WASM.md`](./frontend/DUCKDB_WASM.md) - DuckDB WASM local caching + local query execution

## Deployment

You can deploy the application in several ways depending on your infrastructure preference.

### 1. All-in-one Docker Image (recommended quick start)

The repository contains a multi-stage `Dockerfile` that builds the React frontend and packages it with the FastAPI backend. The frontend production build is copied into `backend/static` and is served directly by FastAPI.

**Important**: Version information is generated from git before building the Docker image. Use the provided build script:

```bash
./build-docker.sh
```

Or manually generate version files and build:

```bash
# Generate version files
cd frontend && node scripts/generate-version.js && cd ..
python3 backend/scripts/generate_version.py

# Build Docker image
docker build -t data-slicer .
```

Then run:

```bash
docker run -p 8000:8000 data-slicer
```

Open: http://localhost:8000

API base path (as used by the frontend) is `/api/v1`.

### 2. Docker Compose

The `docker-compose.yml` supports multiple environments via env files. Two env files are provided:

- `.env.stable` — production/stable deployment (port 8087, `../data-slicer-data/snapshots/`)
- `.env.testing` — testing deployment (port 8089, `./data/snapshots-testing`)

```bash
# Build and run (stable)
docker compose --env-file .env.stable up --build

# Build and run (testing)
docker compose --env-file .env.testing up --build

# Run without rebuilding
docker compose --env-file .env.stable up
docker compose --env-file .env.testing up
```

The env files control these compose-level variables:

| Variable | stable | testing |
|---|---|---|
| `COMPOSE_PROJECT_NAME` | `data-slicer-stable` | `data-slicer-testing` |
| `APP_VERSION` | `stable` | `testing` |
| `CONTAINER_NAME` | `data-slicer-stable` | `data-slicer-testing` |
| `HOST_PORT` | `8087` | `8089` |
| `SNAPSHOT_DIR` | `../data-slicer-data/snapshots/` | `./data/snapshots-testing` |

You can also run both environments simultaneously since they use different container names and host ports.

### 3. Separate Frontend Hosting + Backend API

You may host the frontend build (from `frontend/build`) on any static host (Netlify, Vercel, S3+CloudFront, Nginx) and deploy the backend separately (e.g., on a VM, container service, or serverless platform). In that case set `REACT_APP_API_BASE` in the frontend environment to the absolute URL of the API before building:

```bash
cd frontend
echo "REACT_APP_API_BASE=https://api.example.com/api/v1" > .env.production
npm run build
```

Deploy the `build/` directory to your static hosting provider.

### 4. Reverse Proxy (Nginx / Traefik)

Run the backend on an internal port (e.g., 8000) and have Nginx serve the static files and proxy `/api/` to the backend:

```
location /api/ { proxy_pass http://backend:8000/api/; }
location / { root /usr/share/nginx/html; try_files $uri /index.html; }
```

### Data Source Configuration

#### Kaggle

Kaggle datasets are accessed via the [Kaggle Public API](https://www.kaggle.com/docs/api). No API credentials need to be configured on the server — the Kaggle username and API key are entered in the connection form and are only used during that session (they are never persisted or exported).

To connect, enter:
- **Kaggle username** — your Kaggle account username
- **API key** — generate one at https://www.kaggle.com/settings under "API"
- **Dataset reference** — in the form `owner/dataset-name` (e.g. `zillow/zecon`)

CSV and Parquet files within the dataset are downloaded to a session-scoped temp directory and queried via DuckDB. The files are removed on disconnect.

#### HuggingFace Datasets

HuggingFace datasets are queried directly as remote Parquet files served by the [Hugging Face Dataset Viewer](https://huggingface.co/docs/dataset-viewer/en/parquet). DuckDB's `httpfs` extension streams the Parquet shards on demand — no local download is required.

To connect, enter:
- **Dataset** — the dataset ID (e.g. `stanfordnlp/imdb`). Search by keyword in the form or type it manually.
- **Splits** — optionally select specific config/split combinations to load (defaults to all available).
- **Access token** (optional) — a HuggingFace [User Access Token](https://huggingface.co/settings/tokens) with at least `read` scope. Required for gated or private datasets.

Each selected split becomes a queryable table in the workspace. Splits whose Parquet files exceed the size gate are shown with a warning and cannot be selected.

Backend environment variables for HuggingFace:

| Variable | Default | Description |
|---|---|---|
| `HF_MAX_SPLIT_BYTES_MB` | `500` | Maximum allowed Parquet size (in MB) per split. Splits above this limit are shown as unavailable in the UI. Set to a higher value if you need to query larger splits. |

### Environment Variables

Backend:
- `LOG_LEVEL` (default: INFO)
- `PORT` (default: 8000)
- `CORS_ALLOW_ORIGINS` (optional, comma-separated). Overrides default development origins. Example:
	`CORS_ALLOW_ORIGINS=http://localhost:3000,http://127.0.0.1:5173`
	Use this if you run the frontend dev server on a non-default host/port and encounter browser `Failed to fetch` errors (CORS).

Frontend (Create React App – must start with `REACT_APP_`):
- `REACT_APP_API_BASE` – base path or URL for API requests (e.g. `/api/v1` when served by same host)
	If unset the app now defaults to `/api/v1` (relative) which is correct when the production build is served by the backend container. Previously a hard-coded `http://localhost:8000/api/v1/data` base could cause issues behind reverse proxies or alternative hostnames.

### Local Production Simulation

```bash
cd frontend
REACT_APP_API_BASE=/api/v1 npm run build
cd ..
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

### Health & Info

When the static build is present the root `/` serves the SPA. A lightweight health endpoint is available at `/health` and API documentation remains at `/docs` (FastAPI auto docs).

---

## Contributing

Please refer to the specific frontend and backend documentation for detailed development guidelines and architecture information.
