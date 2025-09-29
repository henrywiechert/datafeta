# Data Slicer - Data Analysis Platform

A modern data analysis platform that provides intuitive visualization and querying capabilities for multiple data sources including databases and files.

## Overview

Data Slicer is a full-stack data analysis platform consisting of:

- **Frontend**: React-based web application providing interactive data visualization and exploration
- **Backend**: FastAPI-based REST API supporting multiple data source connectors and query execution

## Key Features

### Data Source Support
- **Database Connectivity**: Connect to various databases through configurable connectors
- **File Support**: Upload and analyze CSV files using integrated DuckDB engine
- **Query Generation**: Dynamic SQL query generation with pypika notation

### Visualization Capabilities
- **Interactive Charts**: Dynamic chart generation using Observable Plot
- **Multi-Chart Faceting**: Sophisticated faceting system for multi-dimensional data exploration
- **Field Classification**: Intelligent field type detection and classification system
- **Responsive Design**: Mobile-friendly interface with adaptive layouts

### Architecture
- **Frontend**: React with TypeScript, Material-UI components
- **Backend**: FastAPI with Python, supporting multiple database connectors
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

## Documentation Structure

- [`frontend/`](./frontend/README.md) - Frontend application documentation
- [`backend/`](./backend/README.md) - Backend API and service documentation

## Deployment

You can deploy the application in several ways depending on your infrastructure preference.

### 1. All-in-one Docker Image (recommended quick start)

The repository contains a multi-stage `Dockerfile` that builds the React frontend and packages it with the FastAPI backend. The frontend production build is copied into `backend/static` and is served directly by FastAPI.

Build and run with Docker:

```bash
docker build -t data-slicer .
docker run -p 8000:8000 data-slicer
```

Then open: http://localhost:8000

API base path (as used by the frontend) is `/api/v1`.

### 2. Docker Compose

```bash
docker compose up --build
```

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

### Environment Variables

Backend:
- `LOG_LEVEL` (default: INFO)
- `PORT` (default: 8000)

Frontend (Create React App – must start with `REACT_APP_`):
- `REACT_APP_API_BASE` – base path or URL for API requests (e.g. `/api/v1` when served by same host)

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