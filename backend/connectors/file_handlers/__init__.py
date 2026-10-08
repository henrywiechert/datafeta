# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""File format handler registry and exports.

FILE_HANDLERS is the single place a file format is registered. Upload
validation, the allowed extensions / MIME types and the format catalog the
frontend builds its file pickers and option panels from are all derived from it.
"""
import os
from typing import Any, Dict, FrozenSet, List, Mapping, Optional, Tuple, Type

from backend.exceptions import InvalidInputError

from .base import (
    CSV_OPTIONS,
    DATE_FORMAT_OPTIONS,
    BaseFileHandler,
    FileFormat,
    OpenedFile,
    PartInfo,
    TableSource,
    resolve_part_selection,
)
from .csv_handler import CsvFileHandler, build_csv_handler_config
from .json_handler import JsonFileHandler, build_json_handler_config
from .parquet_handler import ParquetFileHandler
from .workbook_handler import WorkbookFileHandler

FILE_HANDLERS: Tuple[Type[BaseFileHandler], ...] = (
    CsvFileHandler,
    ParquetFileHandler,
    JsonFileHandler,
    WorkbookFileHandler,
)

_HANDLERS_BY_EXTENSION: Dict[str, Type[BaseFileHandler]] = {
    ext: handler for handler in FILE_HANDLERS for ext in handler.FORMAT.extensions
}

FILE_EXTENSIONS: FrozenSet[str] = frozenset(_HANDLERS_BY_EXTENSION)
FILE_MIME_TYPES: FrozenSet[str] = frozenset(
    mime for handler in FILE_HANDLERS for mime in handler.FORMAT.mime_types
)


def handler_for(filename: str, options: Optional[Mapping[str, Any]] = None) -> BaseFileHandler:
    """Instantiate the handler for a file (by extension) with the parsing options."""
    extension = os.path.splitext(filename)[1].lower()
    handler = _HANDLERS_BY_EXTENSION.get(extension)
    if handler is None:
        supported = ", ".join(sorted(FILE_EXTENSIONS))
        raise InvalidInputError(f"Unsupported file type: {extension}. Supported: {supported}")
    return handler(options, extension)


def build_parsing_options(connection_details: Mapping[str, Any]) -> Dict[str, Any]:
    """Handler options from ConnectionDetails-style keys (shared by every format)."""
    return build_csv_handler_config(dict(connection_details))


def file_format_catalog() -> List[Dict[str, Any]]:
    """Public descriptions of the supported formats (for the frontend)."""
    return [handler.FORMAT.to_public() for handler in FILE_HANDLERS]


__all__ = [
    "BaseFileHandler",
    "CSV_OPTIONS",
    "CsvFileHandler",
    "DATE_FORMAT_OPTIONS",
    "FILE_EXTENSIONS",
    "FILE_HANDLERS",
    "FILE_MIME_TYPES",
    "FileFormat",
    "JsonFileHandler",
    "OpenedFile",
    "ParquetFileHandler",
    "PartInfo",
    "TableSource",
    "WorkbookFileHandler",
    "build_csv_handler_config",
    "build_json_handler_config",
    "build_parsing_options",
    "file_format_catalog",
    "handler_for",
    "resolve_part_selection",
]
