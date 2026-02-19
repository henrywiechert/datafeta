"""Parquet file handler for DuckDB-based reading and validation."""
import os

from backend.exceptions import FileProcessingError, InvalidInputError

from .base import BaseFileHandler


class ParquetFileHandler(BaseFileHandler):
    """Handles Parquet file reading via DuckDB and Parquet-specific validation."""

    FILE_EXTENSION = ".parquet"

    def build_reader_sql(self, file_path: str) -> str:
        """Build DuckDB read_parquet SQL function call."""
        escaped_path = file_path.replace("'", "''")
        return f"read_parquet('{escaped_path}')"

    def validate(self, path: str) -> None:
        """Validate that path points to a valid, non-empty Parquet file."""
        if not os.path.exists(path):
            raise FileProcessingError("Temporary file missing during validation.")
        if os.path.getsize(path) == 0:
            raise InvalidInputError("Uploaded Parquet file is empty.")
        with open(path, "rb") as f:
            header = f.read(4)
            if header != b"PAR1":
                raise InvalidInputError(
                    "Uploaded file does not appear to be valid Parquet (missing PAR1 header)."
                )
            f.seek(-4, 2)
            footer = f.read(4)
            if footer != b"PAR1":
                raise InvalidInputError(
                    "Uploaded file does not appear to be valid Parquet (missing PAR1 footer)."
                )
