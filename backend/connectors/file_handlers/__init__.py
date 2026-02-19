"""File format handler registry and exports."""
from typing import Any, Callable, Dict

from .base import BaseFileHandler
from .csv_handler import CsvFileHandler
from .parquet_handler import ParquetFileHandler

# Maps file extension -> factory callable(config: dict) -> BaseFileHandler
FILE_HANDLER_REGISTRY: Dict[str, Callable[[Dict[str, Any]], BaseFileHandler]] = {
    ".csv": lambda config: CsvFileHandler(config),
    ".parquet": lambda _: ParquetFileHandler(),
}

__all__ = [
    "BaseFileHandler",
    "CsvFileHandler",
    "ParquetFileHandler",
    "FILE_HANDLER_REGISTRY",
]
