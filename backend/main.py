"""Main FastAPI application."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import data

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

@app.get("/")
def read_root():
    return {"message": "Welcome to the Data Analytics Platform API"}

# TODO: Add error handling middleware
# TODO: Add CORS middleware if frontend is served from a different origin - DONE