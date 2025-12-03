"""Main FastAPI application."""
import os
import shutil
import tempfile
import logging # Import logging
import json
from pathlib import Path
from datetime import datetime, timezone
from fastapi import FastAPI, Request, status
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from .routers import data
# Import custom exceptions
from .exceptions import (
    AppException, InvalidInputError, DataSourceConnectionError,
    QueryGenerationError, QueryExecutionError, FileProcessingError
)

# --- Logging Configuration --- #
log_level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
log_level = getattr(logging, log_level_name, logging.INFO)

# Configure logging to both file and console
log_file = Path(__file__).parent / 'backend.log'
logging.basicConfig(
    level=log_level,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__) # Get logger for this module
logger.info(f"Logging configured with level: {logging.getLevelName(log_level)}")
logger.info(f"Logging to file: {log_file}")

# Load version info
VERSION_INFO = None
version_file = Path(__file__).parent / 'version.json'
if version_file.exists():
    with open(version_file, 'r') as f:
        VERSION_INFO = json.load(f)
else:
    VERSION_INFO = {
        'version': 'debug',
        'gitHash': None,
        'gitTag': None,
        'buildDate': datetime.now(timezone.utc).isoformat()
    }
logger.info(f"Backend version: {VERSION_INFO['version']}")

app = FastAPI(
    title="Data Analytics Platform API",
    description="API for connecting to data sources and exploring data.",
    version="0.1.0",
)

# CORS configuration
# "Failed to fetch" during CSV connect when using the all-in-one Docker image was caused by the
# frontend making requests from origin http://localhost:8000 while only http://localhost and
# http://localhost:3000 were allowed. FastAPI's CORS requires exact scheme+host+port matches.
# We now:
#  1. Support an environment variable CORS_ALLOW_ORIGINS (comma-separated) for overrides.
#  2. Provide sensible development defaults including explicit port variants.
cors_origins_env = os.environ.get("CORS_ALLOW_ORIGINS")
if cors_origins_env:
    origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()]
else:
    origins = [
        "http://localhost",           # (rarely matched unless no port in Origin)
        "http://localhost:3000",      # CRA dev server
        "http://localhost:8000",      # All-in-one container serving both frontend+backend
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods (GET, POST, etc.)
    allow_headers=["*"],  # Allow all headers
)
logger.info(f"CORS configured for origins: {origins}")

app.include_router(data.router, prefix="/api/v1/data", tags=["data"])

# Lightweight informational endpoints to avoid confusing 404s when users hit version or data roots directly
@app.get("/api/v1", include_in_schema=False)
def api_version_root():
    return {"message": "Data Slicer API root", "version": app.version, "data_endpoints": "/api/v1/data/*"}

@app.get("/api/v1/data", include_in_schema=False)
def api_data_root():
    return {"message": "Data endpoints root. See /docs for full schema.", "examples": ["POST /api/v1/data/connect", "GET /api/v1/data/tables"]}

@app.get("/api/version")
def get_version():
    """Return version information."""
    return VERSION_INFO

@app.on_event("startup")
def startup_event():
    """Initialize application-scoped upload root directory."""
    try:
        upload_root_dir = tempfile.mkdtemp(prefix="datafeta_csv_")
        app.state.upload_root_dir = upload_root_dir
        logger.info(f"Created upload root directory: {upload_root_dir}")
    except Exception:
        logger.exception("Failed to create upload root directory")
        raise

FRONTEND_BUILD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "static"))

# If a frontend build has been copied into backend/static (e.g. via Docker multi-stage build) serve it
if os.path.isdir(FRONTEND_BUILD_DIR):
    logger.info(f"Serving frontend build from: {FRONTEND_BUILD_DIR}")
    app.mount("/", StaticFiles(directory=FRONTEND_BUILD_DIR, html=True), name="frontend")

    @app.get("/health", include_in_schema=False)
    def health_check():  # lightweight health endpoint still available even when SPA mounted at '/'
        return {"status": "ok"}

    # Optional explicit fallback (StaticFiles with html=True already handles index.html for 404 in subpaths)
    @app.get("/api-info", include_in_schema=False)
    def api_info():
        return {"message": "Data Analytics Platform API", "version": app.version}
else:
    @app.get("/")
    def read_root():
        return {"message": "Welcome to the Data Analytics Platform API"}

@app.on_event("shutdown")
def shutdown_event():
    """Clean up the temporary upload directory on application shutdown."""
    try:
        upload_root_dir = getattr(app.state, "upload_root_dir", None)
        if upload_root_dir and os.path.exists(upload_root_dir):
             shutil.rmtree(upload_root_dir)
             # Use logger
             logger.info(f"Cleaned up temporary directory: {upload_root_dir}")
    except Exception:
        # Use logger, log exception info
        logger.exception("Error cleaning up upload root directory")

# --- Custom Exception Handlers --- #

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # Log the full error details to the console
    logger.error(f"Request validation error: {exc.errors()}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors()},
    )

@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    # Catch-all for our custom base exception
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )

@app.exception_handler(DataSourceConnectionError)
async def data_source_exception_handler(request: Request, exc: DataSourceConnectionError):
    # Log using logger
    logger.error(f"Data Source Connection Error: {exc.detail}", exc_info=False) # Don't need stack trace here
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )

@app.exception_handler(QueryExecutionError)
async def query_execution_exception_handler(request: Request, exc: QueryExecutionError):
    # Log using logger
    logger.error(f"Query Execution Error: {exc.detail}", exc_info=False)
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )

# Add more specific handlers if needed (e.g., for InvalidInputError)

# TODO: Add error handling middleware
# TODO: Add CORS middleware if frontend is served from a different origin - DONE