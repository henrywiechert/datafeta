"""Main FastAPI application."""
import os
import shutil
import tempfile
import logging # Import logging
from fastapi import FastAPI, Request, status
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

logging.basicConfig(
    level=log_level,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

logger = logging.getLogger(__name__) # Get logger for this module
logger.info(f"Logging configured with level: {logging.getLevelName(log_level)}")

app = FastAPI(
    title="Data Analytics Platform API",
    description="API for connecting to data sources and exploring data.",
    version="0.1.0",
)

# CORS configuration
origins = [
    "http://localhost", # Allow localhost (any port)
    "http://localhost:3000", # Allow frontend dev server
    # Add any other origins if needed (e.g., your deployed frontend URL)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"], # Allow all methods (GET, POST, etc.)
    allow_headers=["*"], # Allow all headers
)

app.include_router(data.router, prefix="/api/v1/data", tags=["data"])

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