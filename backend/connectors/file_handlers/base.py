"""Abstract base class for file format handlers."""
from abc import ABC, abstractmethod


class BaseFileHandler(ABC):
    """Abstract handler for a specific file format.

    Encapsulates format-specific SQL generation and file validation so that
    FileConnector and ConnectionService stay format-agnostic.
    """

    FILE_EXTENSION: str  # e.g. ".csv" or ".parquet"

    @abstractmethod
    def build_reader_sql(self, file_path: str) -> str:
        """Return a DuckDB SQL expression that reads the file at file_path."""
        ...

    @abstractmethod
    def validate(self, path: str) -> None:
        """Synchronously validate that path points to a valid file of this type.

        Raises InvalidInputError or FileProcessingError on failure.
        Intended to be called via run_in_threadpool from async callers.
        """
        ...

    @property
    def file_type(self) -> str:
        """Short name for the file type (extension without the dot)."""
        return self.FILE_EXTENSION.lstrip(".")
