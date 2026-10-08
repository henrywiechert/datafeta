# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""JSON / NDJSON / JSONL file handler for DuckDB-based reading and validation.

JSON files are materialised as Parquet once on connect so every subsequent
query hits the fast columnar format instead of re-parsing and re-UNNESTing
the JSON file each time.
"""
import logging
import os
import re
from typing import Any, Dict, List, Optional, Sequence

import duckdb

from backend.exceptions import FileProcessingError, InvalidInputError

from .base import BaseFileHandler, FileFormat, OpenedFile, TableSource, derived_path
from .parquet_handler import ParquetFileHandler

logger = logging.getLogger(__name__)

_JSON_SNIFF_BYTES = 4096

# ---------------------------------------------------------------------------
# JSON nested-type helpers
# ---------------------------------------------------------------------------

def _is_list_type(col_type: str) -> bool:
    """True for DuckDB array/list types: T[], T[N], LIST(T)."""
    s = col_type.strip()
    return bool(re.match(r'.+\[\d*\]$', s)) or s.upper().startswith('LIST(')


def _is_struct_type(col_type: str) -> bool:
    """True when the outermost DuckDB type is STRUCT(...)."""
    return col_type.strip().upper().startswith('STRUCT(')


def _unwrap_list_element(col_type: str) -> str:
    """Return the element type of a LIST column."""
    s = col_type.strip()
    m = re.match(r'^(.+)\[\d*\]$', s)
    if m:
        return m.group(1).strip()
    if s.upper().startswith('LIST(') and s.endswith(')'):
        return s[5:-1].strip()
    return s


def _parse_struct_field_names(type_str: str) -> List[str]:
    """
    Extract field names from a STRUCT type string.

    Handles:
    - Quoted identifiers with spaces/parens: "tickTime (ps per tick)" BIGINT
    - Reserved-keyword quoting:             "action" VARCHAR
    - Nested struct/array types:            items STRUCT(a INT, b INT)[]
    """
    s = type_str.strip()
    if not s.upper().startswith('STRUCT(') or not s.endswith(')'):
        return []
    inner = s[7:-1]  # strip STRUCT( and trailing )
    fields: List[str] = []
    i = 0
    n = len(inner)

    while i < n:
        # Skip leading whitespace between fields
        while i < n and inner[i] in (' ', '\t'):
            i += 1
        if i >= n:
            break

        # --- Parse the field name ---
        if inner[i] == '"':
            # Quoted identifier: read until the matching closing "
            # DuckDB escapes a literal " inside as ""
            i += 1
            name_chars: List[str] = []
            while i < n:
                if inner[i] == '"':
                    if i + 1 < n and inner[i + 1] == '"':  # escaped ""
                        name_chars.append('"')
                        i += 2
                    else:
                        i += 1  # skip closing quote
                        break
                else:
                    name_chars.append(inner[i])
                    i += 1
            fields.append(''.join(name_chars))
        else:
            # Unquoted identifier: read until whitespace or comma
            j = i
            while j < n and inner[j] not in (' ', '\t', ','):
                j += 1
            fields.append(inner[i:j])
            i = j

        # --- Skip the type token until the next top-level comma ---
        depth = 0
        in_quotes = False
        while i < n:
            ch = inner[i]
            if in_quotes:
                if ch == '"':
                    if i + 1 < n and inner[i + 1] == '"':
                        i += 2
                        continue
                    in_quotes = False
            elif ch == '"':
                in_quotes = True
            elif ch in ('(', '['):
                depth += 1
            elif ch in (')', ']'):
                depth -= 1
            elif ch == ',' and depth == 0:
                i += 1  # consume comma; outer loop will skip whitespace
                break
            i += 1

    return fields


def _safe_unnest_expr(col_name: str) -> str:
    """List expression that substitutes a single NULL element for empty/NULL lists.

    ``UNNEST([])`` produces zero rows, which would silently drop any input row whose
    list columns are all empty. Substituting ``[NULL]`` (length 1) keeps the row with
    NULL values instead. The ``[NULL]`` literal type-reconciles with both scalar-list
    (e.g. VARCHAR[]) and struct-list (e.g. STRUCT(...)[]) columns.
    """
    return (
        f'CASE WHEN "{col_name}" IS NULL OR len("{col_name}") = 0 '
        f'THEN [NULL] ELSE "{col_name}" END'
    )


def _build_json_select_parts(describe: list) -> List[str]:
    """
    Build SELECT expressions for a JSON view, expanding nested types:
      STRUCT(...)    → col__field per field (wide)
      T[]            → col__index (1-based) + UNNEST(col) (long)
      STRUCT(...)[]  → col__index + UNNEST(col).field per field (long + wide)
      MAP / other    → pass-through
    Multiple LIST columns are unnested in parallel (DuckDB aligns positionally,
    NULL-pads shorter arrays). Empty/NULL lists are preserved as a single row with
    NULL values (and a NULL __index) rather than being dropped.
    """
    parts: List[str] = []
    for row in describe:
        col_name: str = row[0]
        col_type: str = row[1]

        if _is_list_type(col_type):
            elem_type = _unwrap_list_element(col_type)
            safe = _safe_unnest_expr(col_name)
            # generate_subscripts uses the original column so a genuinely empty
            # list yields a NULL __index (the placeholder row), not index 1.
            parts.append(
                f'generate_subscripts("{col_name}", 1) AS "{col_name}__index"'
            )
            if _is_struct_type(elem_type):
                # LIST of STRUCT → unnest + expand struct fields
                for field in _parse_struct_field_names(elem_type):
                    parts.append(
                        f'UNNEST({safe})."{field}" AS "{col_name}__{field}"'
                    )
            else:
                # LIST of scalar → unnest value, keep original column name
                parts.append(f'UNNEST({safe}) AS "{col_name}"')

        elif _is_struct_type(col_type):
            # Plain STRUCT → expand fields (wide, no row multiplication)
            for field in _parse_struct_field_names(col_type):
                parts.append(f'"{col_name}"."{field}" AS "{col_name}__{field}"')

        else:
            # Scalar, MAP, or unrecognised → pass through unchanged
            parts.append(f'"{col_name}"')

    return parts



def build_json_handler_config(connection_details: Dict[str, Any]) -> Dict[str, Any]:
    """Build JsonFileHandler config dict from ConnectionDetails-style keys."""
    return {
        "sample_size": connection_details.get("json_sample_size", 1000),
        "flatten_nested": connection_details.get("json_flatten_nested", True),
    }


class JsonFileHandler(BaseFileHandler):
    """Handles JSON / NDJSON / JSONL file reading via DuckDB and JSON-specific validation.

    All three extensions share this handler. The extension decides how DuckDB
    disambiguates the file structure:
      - ".json"             – "auto": detect JSON array vs newline-delimited
      - ".ndjson"/".jsonl"  – "newline_delimited": one JSON object per line
    """

    FILE_EXTENSION = ".json"
    FORMAT = FileFormat(
        key="json",
        label="JSON",
        extensions=(".json", ".ndjson", ".jsonl"),
        mime_types=frozenset({
            "application/json",
            "application/x-ndjson",
            "application/jsonl",
        }),
    )

    def __init__(self, options: Optional[Dict[str, Any]] = None, extension: Optional[str] = None) -> None:
        super().__init__(options, extension)
        self._format = "auto" if (extension or ".json") == ".json" else "newline_delimited"

    @property
    def config(self) -> Dict[str, Any]:
        return self._options

    def open(
        self,
        path: str,
        parts: Optional[Sequence[str]] = None,
        display_name: Optional[str] = None,
    ) -> OpenedFile:
        """Flatten nested fields and materialise the JSON file as Parquet."""
        parquet_path = derived_path(path, "flat")
        con = None
        try:
            con = duckdb.connect(database=':memory:', read_only=False)
            con.execute(f"CREATE TEMPORARY VIEW __json_raw AS SELECT * FROM {self.build_reader_sql(path)};")
            describe = con.execute("DESCRIBE __json_raw;").fetchall()
            if self._options.get("flatten_nested", True):
                select_parts = _build_json_select_parts(describe)
            else:
                select_parts = [f'"{row[0]}"' for row in describe]
            escaped = parquet_path.replace("'", "''")
            con.execute(
                f"COPY (SELECT {', '.join(select_parts)} FROM __json_raw) "
                f"TO '{escaped}' (FORMAT PARQUET);"
            )
            logger.info(f"JSON → Parquet materialisation: {path} -> {parquet_path}")
        except Exception:
            if os.path.exists(parquet_path):
                os.remove(parquet_path)
            raise
        finally:
            if con:
                con.close()
        return OpenedFile([TableSource(path=parquet_path, reader=ParquetFileHandler(), generated=True)])

    def build_reader_sql(self, file_path: str) -> str:
        """Build DuckDB read_json_auto SQL function call."""
        sample_size = self._options.get("sample_size", 1000)
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
