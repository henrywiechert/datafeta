# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""JSON / NDJSON / JSONL file handler for DuckDB-based reading and validation."""
import os
from typing import Any, Dict

from backend.exceptions import FileProcessingError, InvalidInputError

from .base import BaseFileHandler

_JSON_SNIFF_BYTES = 4096


def build_json_handler_config(connection_details: Dict[str, Any]) -> Dict[str, Any]:
    """Build JsonFileHandler config dict from ConnectionDetails-style keys."""
    return {
        "sample_size": connection_details.get("json_sample_size", 1000),
        "flatten_nested": connection_details.get("json_flatten_nested", True),
    }


class JsonFileHandler(BaseFileHandler):
    """Handles JSON / NDJSON / JSONL file reading via DuckDB and JSON-specific validation.

    All three extensions share this handler. The format parameter controls how
    DuckDB disambiguates the file structure:
      - "auto"              – detect JSON array vs newline-delimited automatically
      - "newline_delimited" – treat each line as an independent JSON object (NDJSON/JSONL)
    """

    FILE_EXTENSION = ".json"

    def __init__(self, config: Dict[str, Any], format: str = "auto") -> None:
        self._config = config
        self._format = format  # "auto" | "newline_delimited"

    @property
    def config(self) -> Dict[str, Any]:
        return self._config

    def build_reader_sql(self, file_path: str) -> str:
        """Build DuckDB read_json_auto SQL function call."""
        sample_size = self._config.get("sample_size", 1000)
        try:
            sample_size = int(sample_size)
        except (TypeError, ValueError):
            sample_size = 1000
        if sample_size == 0 or sample_size < -1:
            sample_size = 1000
        escaped_path = file_path.replace("'", "''")
        # maximum_object_size matches the upload ceiling (1 GB) so large single-object
        # JSON files (e.g. Chrome Trace Format) don't hit the default 16 MB limit.
        return (
            f"read_json_auto('{escaped_path}', "
            f"format='{self._format}', "
            f"sample_size={sample_size}, "
            f"maximum_object_size=1073741824)"
        )

    def validate(self, path: str) -> None:
        """Validate that path points to a valid, non-empty JSON / NDJSON file."""
        if not os.path.exists(path):
            raise FileProcessingError("Temporary file missing during validation.")
        if os.path.getsize(path) == 0:
            raise InvalidInputError("Uploaded JSON file is empty.")
        with open(path, "rb") as f:
            sample_bytes = f.read(_JSON_SNIFF_BYTES)
        # Strip UTF-8 BOM if present, then leading whitespace
        sample = sample_bytes.decode("utf-8", errors="ignore").lstrip("﻿").lstrip()
        if not sample:
            raise InvalidInputError("Uploaded JSON file is empty or unreadable.")
        if sample[0] not in ("[", "{"):
            raise InvalidInputError(
                "Uploaded file does not appear to be valid JSON or NDJSON "
                "(expected '[' or '{' at the start of the file)."
            )
