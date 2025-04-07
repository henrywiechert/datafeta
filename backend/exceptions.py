"""Custom application exceptions."""

from fastapi import HTTPException, status
from typing import Optional, Any, Dict

class AppException(Exception):
    """Base class for application-specific exceptions."""
    def __init__(self, detail: str, status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR):
        self.detail = detail
        self.status_code = status_code
        super().__init__(self.detail)

# --- Specific Exception Classes --- #

class InvalidInputError(AppException):
    """Raised for invalid user input or request format (4xx errors)."""
    def __init__(self, detail: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        super().__init__(detail=detail, status_code=status_code)

class AuthenticationError(AppException):
    """Raised for authentication/authorization issues (401, 403)."""
    def __init__(self, detail: str = "Authentication required", status_code: int = status.HTTP_401_UNAUTHORIZED):
        super().__init__(detail=detail, status_code=status_code)

class ResourceNotFoundError(AppException):
    """Raised when a requested resource (e.g., table, database) is not found (404)."""
    def __init__(self, resource: str = "Resource", identifier: Optional[str] = None):
        detail = f"{resource} not found."
        if identifier:
            detail = f"{resource} '{identifier}' not found."
        super().__init__(detail=detail, status_code=status.HTTP_404_NOT_FOUND)

class DataSourceConnectionError(AppException):
    """Raised for errors connecting to or interacting with a data source (503, 500)."""
    def __init__(self, detail: str, status_code: int = status.HTTP_503_SERVICE_UNAVAILABLE):
        super().__init__(detail=f"Data source error: {detail}", status_code=status_code)

class QueryGenerationError(AppException):
    """Raised for errors during the query translation/generation phase (400)."""
    def __init__(self, detail: str):
        super().__init__(detail=f"Query generation error: {detail}", status_code=status.HTTP_400_BAD_REQUEST)

class QueryExecutionError(AppException):
    """Raised specifically for errors during the execution of a query by a connector (500)."""
    def __init__(self, detail: str):
        super().__init__(detail=f"Query execution error: {detail}", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

class FileProcessingError(AppException):
    """Raised for errors during file upload processing (500)."""
    def __init__(self, detail: str):
        super().__init__(detail=f"File processing error: {detail}", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

# You can add more specific exceptions as needed. 