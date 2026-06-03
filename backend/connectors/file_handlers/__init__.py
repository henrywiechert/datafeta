# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""File format handler registry and exports."""
from typing import Any, Callable, Dict

from .base import BaseFileHandler
from .csv_handler import CsvFileHandler, build_csv_handler_config
from .parquet_handler import ParquetFileHandler

# Maps file extension -> factory callable(config: dict) -> BaseFileHandler
FILE_HANDLER_REGISTRY: Dict[str, Callable[[Dict[str, Any]], BaseFileHandler]] = {
    ".csv": lambda config: CsvFileHandler(config),
    ".parquet": lambda _: ParquetFileHandler(),
}

__all__ = [
    "BaseFileHandler",
    "CsvFileHandler",
    "build_csv_handler_config",
    "ParquetFileHandler",
    "FILE_HANDLER_REGISTRY",
]
