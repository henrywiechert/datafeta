# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""JSON / NDJSON / JSONL file handler for DuckDB-based reading and validation.

JSON files are materialised as Parquet once on connect so every subsequent
query hits the fast columnar format instead of re-parsing and re-UNNESTing
the JSON file each time.

Records (an array of objects, NDJSON) become one table. So does a single
object wrapping one array plus small metadata (Chrome Trace Format, API
responses): the metadata repeats on each row. Any other single object is a
document of independent sections - several arrays, or large maps such as a
git statistics report - and each top-level key becomes its own table, chosen
in the parts picker. Flattening such a document as one record would zip its
unrelated arrays together and repeat every map on every row.
"""
import json
import logging
import os
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

import duckdb
from duckdb.sqltypes import DuckDBPyType

from backend.exceptions import FileProcessingError, InvalidInputError

from .base import (
    BaseFileHandler,
    FileFormat,
    OpenedFile,
    PartInfo,
    TableSource,
    derived_path,
    quote_identifier,
    resolve_part_selection,
)
from .parquet_handler import ParquetFileHandler

logger = logging.getLogger(__name__)

_JSON_SNIFF_BYTES = 4096
# maximum_object_size for DuckDB's JSON readers: the upload ceiling (1 GB), so
# large single-object files don't hit DuckDB's 16 MB default.
_MAX_OBJECT_BYTES = 1073741824

# A single object with at most one top-level array is a wrapper (one table)
# while its other values stay below this size: they repeat on every row, so
# beyond it they are data, not metadata, and the object is split into sections.
_WRAPPER_FIELDS_MAX_BYTES = 64 * 1024
# Part holding a document's top-level scalars (renamed if a section has the name).
_SUMMARY_SECTION = "summary"

# read_json's map_inference_threshold: objects with at least this many keys (and
# type-compatible values) are inferred as MAP instead of STRUCT. 200 is DuckDB's default.
_DEFAULT_MAP_INFERENCE_THRESHOLD = 200
# Below 2 keys no object can hold a case collision, so lowering further cannot help.
_MIN_MAP_INFERENCE_THRESHOLD = 2
_CASE_COLLISION_RE = re.compile(r'Duplicate name "(.*)" in struct auto-detected in JSON')

# ---------------------------------------------------------------------------
# JSON nested-type helpers
# ---------------------------------------------------------------------------
# Types are inspected as structured DuckDBPyType objects, never by parsing their
# string form: JSON keys can be anything (empty, quoted, reserved words), and
# DuckDB's rendering of such names is not reliably re-parseable.

def _list_element_type(col_type: DuckDBPyType) -> Optional[DuckDBPyType]:
    """Element type of a LIST (T[]) or ARRAY (T[N]) type, else None."""
    if col_type.id in ('list', 'array'):
        return dict(col_type.children)['child']
    return None


def _expandable_fields(col_type: DuckDBPyType) -> Optional[List[str]]:
    """Field names of a STRUCT that can be expanded into columns, else None.

    DuckDB cannot extract a field whose name is empty (JSON key ``""``) — not by
    name, and by index only in first position — so such a struct is kept whole,
    like a MAP. It still round-trips through Parquet losslessly.
    """
    if col_type.id != 'struct':
        return None
    names = [name for name, _ in col_type.children]
    return names if all(names) else None


def _safe_unnest_expr(col_name: str) -> str:
    """List expression that substitutes a single NULL element for empty/NULL lists.

    ``UNNEST([])`` produces zero rows, which would silently drop any input row whose
    list columns are all empty. Substituting ``[NULL]`` (length 1) keeps the row with
    NULL values instead. The ``[NULL]`` literal type-reconciles with both scalar-list
    (e.g. VARCHAR[]) and struct-list (e.g. STRUCT(...)[]) columns.
    """
    col = quote_identifier(col_name)
    return f'CASE WHEN {col} IS NULL OR len({col}) = 0 THEN [NULL] ELSE {col} END'


def _build_json_select_parts(
    columns: Sequence[Tuple[str, DuckDBPyType]],
) -> List[str]:
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
    for col_name, col_type in columns:
        col = quote_identifier(col_name)
        elem_type = _list_element_type(col_type)

        if elem_type is not None:
            safe = _safe_unnest_expr(col_name)
            # generate_subscripts uses the original column so a genuinely empty
            # list yields a NULL __index (the placeholder row), not index 1.
            parts.append(
                f'generate_subscripts({col}, 1) AS {quote_identifier(col_name + "__index")}'
            )
            fields = _expandable_fields(elem_type)
            if fields is not None:
                # LIST of STRUCT → unnest + expand struct fields
                for field in fields:
                    parts.append(
                        f'UNNEST({safe}).{quote_identifier(field)} '
                        f'AS {quote_identifier(f"{col_name}__{field}")}'
                    )
            else:
                # LIST of scalar → unnest value, keep original column name
                parts.append(f'UNNEST({safe}) AS {col}')
            continue

        fields = _expandable_fields(col_type)
        if fields is not None:
            # Plain STRUCT → expand fields (wide, no row multiplication)
            for field in fields:
                parts.append(f'{col}.{quote_identifier(field)} AS {quote_identifier(f"{col_name}__{field}")}')
        else:
            # Scalar, MAP, or unrecognised → pass through unchanged
            parts.append(col)

    return parts


def _unique_name(base: str, taken: Set[str]) -> str:
    """``base``, or ``base_1``, ``base_2``... - the first not in ``taken``
    (lower-cased names; DuckDB identifiers are case-insensitive). Claims it."""
    name, n = base, 0
    while name.lower() in taken:
        n += 1
        name = f"{base}_{n}"
    taken.add(name.lower())
    return name


def _entry_select_sql(columns: Sequence[Tuple[str, DuckDBPyType]], source: str) -> str:
    """Shape a section's entries - ``{key|index, value}`` records - into rows.

    Map values are exploded into further key columns (long format: one row per
    leaf, e.g. author -> file -> count becomes key, key_2, value), and a struct
    value's fields become columns of their own. The record flattening then
    applies to the result as to any JSON records.
    """
    (key_name, _), (_, value_type) = columns
    levels = 1
    sql = f'SELECT {quote_identifier(key_name)} AS __k1, "value" AS __v FROM {source}'
    while value_type.id == 'map':
        levels += 1
        outer = ", ".join(f"__k{i}" for i in range(1, levels))
        # An empty map keeps its row (NULL key and value) instead of vanishing.
        keys = "CASE WHEN cardinality(__v) > 0 THEN map_keys(__v) ELSE [NULL] END"
        values = "CASE WHEN cardinality(__v) > 0 THEN map_values(__v) ELSE [NULL] END"
        sql = (
            f"SELECT {outer}, UNNEST({keys}) AS __k{levels}, UNNEST({values}) AS __v "
            f"FROM ({sql}) AS __level{levels}"
        )
        value_type = dict(value_type.children)['value']

    fields = _expandable_fields(value_type)
    value_cols = [(f"__v.{quote_identifier(f)}", f) for f in fields] if fields else [("__v", "value")]
    taken = {name.lower() for _, name in value_cols}
    level_names = iter(n for n in ["key"] + [f"key_{i}" for i in range(2, levels + 1)] if n != key_name)
    key_cols = [("__k1", _unique_name(key_name, taken))]
    key_cols += [(f"__k{i}", _unique_name(next(level_names), taken)) for i in range(2, levels + 1)]
    select = ", ".join(f"{expr} AS {quote_identifier(name)}" for expr, name in key_cols + value_cols)
    return f"SELECT {select} FROM ({sql}) AS __entries"


@dataclass(frozen=True)
class _Section:
    """A top-level part of a JSON document, loaded as its own table."""
    name: str
    kind: str        # "summary" (the scalars), "object" (row per key) or "array" (row per element)
    size: int        # entries; an empty section cannot be selected
    pos: int = 0     # position in __json_top (object / array sections)

    @property
    def part(self) -> PartInfo:
        return PartInfo(self.name, self.size > 0, None if self.size else "empty")

    def write_entries(self, con: duckdb.DuckDBPyConnection, path: str) -> None:
        """Write the section as NDJSON records for the JSON records reader."""
        if self.kind == "summary":
            # One record of the scalars; values are JSON text and written verbatim.
            rows = con.execute(
                "SELECT key, value FROM __json_top "
                "WHERE coalesce(json_type(value), 'NULL') NOT IN ('OBJECT', 'ARRAY') ORDER BY pos"
            ).fetchall()
            with open(path, "w", encoding="utf-8") as f:
                f.write("{" + ",".join(f"{json.dumps(k)}:{v or 'null'}" for k, v in rows) + "}\n")
            return
        if self.kind == "object":
            entries = (
                'SELECT UNNEST(map_keys(m)) AS "key", UNNEST(map_values(m)) AS "value" '
                f"FROM (SELECT CAST(value AS MAP(VARCHAR, JSON)) AS m FROM __json_top WHERE pos = {self.pos})"
            )
        else:
            entries = (
                'SELECT generate_subscripts(l, 1) AS "index", UNNEST(l) AS "value" '
                f"FROM (SELECT CAST(value AS JSON[]) AS l FROM __json_top WHERE pos = {self.pos})"
            )
        escaped = path.replace("'", "''")
        con.execute(f"COPY ({entries}) TO '{escaped}' (FORMAT JSON);")


def _sniff(path: str) -> str:
    """Start of the file as text, without UTF-8 BOM and leading whitespace."""
    with open(path, "rb") as f:
        sample_bytes = f.read(_JSON_SNIFF_BYTES)
    return sample_bytes.decode("utf-8", errors="ignore").lstrip("﻿").lstrip()


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
        # Only documents have parts (list_parts is None for records and wrappers).
        part_label="section",
    )

    def __init__(self, options: Optional[Dict[str, Any]] = None, extension: Optional[str] = None) -> None:
        super().__init__(options, extension)
        self._format = "auto" if (extension or ".json") == ".json" else "newline_delimited"

    @property
    def config(self) -> Dict[str, Any]:
        return self._options

    def list_parts(self, path: str) -> Optional[List[PartInfo]]:
        con = duckdb.connect(database=':memory:')
        try:
            sections = self._document_sections(con, path)
        finally:
            con.close()
        return None if sections is None else [s.part for s in sections]

    def open(
        self,
        path: str,
        parts: Optional[Sequence[str]] = None,
        display_name: Optional[str] = None,
    ) -> OpenedFile:
        """Flatten nested fields and materialise the JSON file as Parquet.

        A document becomes one table per selected section, each named
        "<file>_<section>" (just "<file>" when it has a single loadable section);
        anything else becomes one table and ``parts`` does not apply.
        """
        con = duckdb.connect(database=':memory:')
        try:
            sections = self._document_sections(con, path)
            if sections is not None:
                return self._open_sections(con, path, sections, parts, display_name or os.path.basename(path))
            parquet_path = derived_path(path, "flat")
            self._materialise(con, path, parquet_path)
            return OpenedFile([TableSource(path=parquet_path, reader=ParquetFileHandler(), generated=True)])
        finally:
            con.close()

    def _open_sections(
        self,
        con: duckdb.DuckDBPyConnection,
        path: str,
        sections: List[_Section],
        parts: Optional[Sequence[str]],
        filename: str,
    ) -> OpenedFile:
        available = [s.part for s in sections]
        selected = resolve_part_selection(available, parts, filename, "section")
        if not selected:
            raise InvalidInputError(f"'{filename}' has no sections with data to load.")
        single_section = sum(1 for p in available if p.selectable) == 1
        by_name = {s.name: s for s in sections}
        # Entries are records; infer their types from all of them, as the
        # document itself was (a single JSON record is inferred in full).
        entry_reader = JsonFileHandler({**self._options, "sample_size": -1}, ".ndjson")

        opened = OpenedFile([])
        try:
            for index, name in enumerate(selected):
                section = by_name[name]
                entries_path = f"{os.path.splitext(path)[0]}__section{index}.ndjson"
                parquet_path = derived_path(path, f"section{index}")
                try:
                    section.write_entries(con, entries_path)
                    rows = entry_reader._materialise(
                        con, entries_path, parquet_path, entries=section.kind != "summary"
                    )
                finally:
                    if os.path.exists(entries_path):
                        os.remove(entries_path)
                if rows == 0:
                    os.remove(parquet_path)
                    opened.skipped_parts.append(name)
                    continue
                opened.tables.append(TableSource(
                    path=parquet_path,
                    reader=ParquetFileHandler(),
                    part=None if single_section else name,
                    generated=True,
                ))
        except Exception:
            for table in opened.tables:
                if os.path.exists(table.path):
                    os.remove(table.path)
            raise

        if not opened.tables:
            raise InvalidInputError(f"The selected sections of '{filename}' contain no data.")
        return opened

    def _materialise(
        self,
        con: duckdb.DuckDBPyConnection,
        path: str,
        parquet_path: str,
        entries: bool = False,
    ) -> int:
        """Write the JSON records at ``path`` to Parquet, flattened; returns the row count.

        ``entries`` marks a document section's ``{key|index, value}`` records,
        which are shaped into rows (see _entry_select_sql) before flattening.
        """
        try:
            self._create_raw_view(con, path)
            raw = con.table("__json_raw")
            columns = list(zip(raw.columns, raw.types))
            source = "__json_raw"
            if entries:
                source = f"({_entry_select_sql(columns, source)}) AS __section"
                shaped = con.sql(f"SELECT * FROM {source}")
                columns = list(zip(shaped.columns, shaped.types))
            if self._options.get("flatten_nested", True):
                select_parts = _build_json_select_parts(columns)
            else:
                select_parts = [quote_identifier(name) for name, _ in columns]
            escaped = parquet_path.replace("'", "''")
            rows = con.execute(
                f"COPY (SELECT {', '.join(select_parts)} FROM {source}) "
                f"TO '{escaped}' (FORMAT PARQUET);"
            ).fetchone()[0]
            logger.info(f"JSON → Parquet materialisation: {path} -> {parquet_path} ({rows} rows)")
            return rows
        except Exception:
            if os.path.exists(parquet_path):
                os.remove(parquet_path)
            raise

    def _document_sections(self, con: duckdb.DuckDBPyConnection, path: str) -> Optional[List[_Section]]:
        """The sections of a JSON document, or None when the file is one table.

        Leaves the document's top-level entries in the ``__json_top`` table
        (pos, key, value as JSON text) for _Section.write_entries.
        """
        if self._format != "auto" or not _sniff(path).startswith("{"):
            return None  # an array of records, or NDJSON
        escaped_path = path.replace("'", "''")
        objects = (
            f"read_json_objects('{escaped_path}', format='auto', "
            f"maximum_object_size={_MAX_OBJECT_BYTES})"
        )
        if con.execute(f"SELECT count(*) FROM (SELECT 1 FROM {objects} LIMIT 2)").fetchone()[0] != 1:
            return None  # several objects: newline-delimited records
        try:
            con.execute(
                "CREATE OR REPLACE TEMPORARY TABLE __json_top AS "
                "SELECT generate_subscripts(map_keys(m), 1) AS pos, "
                "UNNEST(map_keys(m)) AS key, UNNEST(map_values(m)) AS value "
                f"FROM (SELECT CAST(json AS MAP(VARCHAR, JSON)) AS m FROM {objects})"
            )
        except duckdb.InvalidInputException:
            return None  # e.g. duplicate keys: let the records reader report or cope
        top = con.execute(
            "SELECT pos, key, coalesce(json_type(value), 'NULL'), "
            "CASE json_type(value) WHEN 'OBJECT' THEN len(json_keys(value)) "
            "WHEN 'ARRAY' THEN json_array_length(value) END, "
            "coalesce(length(value::VARCHAR), 4) "
            "FROM __json_top ORDER BY pos"
        ).fetchall()

        arrays = sum(1 for _, _, kind, _, _ in top if kind == 'ARRAY')
        other_bytes = sum(size for _, _, kind, _, size in top if kind != 'ARRAY')
        if arrays <= 1 and other_bytes <= _WRAPPER_FIELDS_MAX_BYTES:
            # Records wrapped with small metadata: one table, as before. Free the
            # copy of the document before the records reader parses it again.
            con.execute("DROP TABLE __json_top")
            return None

        nested = [
            _Section(key, "object" if kind == 'OBJECT' else "array", entries, pos)
            for pos, key, kind, entries, _ in top
            if kind in ('OBJECT', 'ARRAY')
        ]
        scalars = len(top) - len(nested)
        if not scalars:
            return nested
        summary_name = _unique_name(_SUMMARY_SECTION, {s.name.lower() for s in nested})
        return [_Section(summary_name, "summary", scalars)] + nested

    def _create_raw_view(self, con: duckdb.DuckDBPyConnection, path: str) -> None:
        """Create the ``__json_raw`` view, recovering from case-colliding object keys.

        DuckDB struct field names are case-insensitive, so an object whose keys
        differ only in case (``"onlineConfig/a.hpp"`` and ``"onlineconfig/a.hpp"``)
        cannot be inferred as a STRUCT. Such objects are keyed by data (paths,
        names, ids) and belong in a case-sensitive MAP, which DuckDB only infers
        for objects with at least ``map_inference_threshold`` keys. On a collision
        the threshold is halved until inference succeeds; stopping at the first
        success keeps as many genuine record structs expanded as possible.
        """
        threshold = _DEFAULT_MAP_INFERENCE_THRESHOLD
        while True:
            reader_sql = self.build_reader_sql(path, map_inference_threshold=threshold)
            try:
                con.execute(f"CREATE OR REPLACE TEMPORARY VIEW __json_raw AS SELECT * FROM {reader_sql};")
                return
            except duckdb.NotImplementedException as exc:
                collision = _CASE_COLLISION_RE.search(str(exc))
                if not collision:
                    raise
                if threshold <= _MIN_MAP_INFERENCE_THRESHOLD:
                    # Map inference needs type-compatible values; these differ.
                    raise InvalidInputError(
                        f'The JSON file contains object keys that differ only in letter case '
                        f'(e.g. "{collision.group(1)}") and hold values of different types. '
                        f'Column names are case-insensitive, so these keys cannot be loaded.'
                    ) from exc
                threshold = max(threshold // 2, _MIN_MAP_INFERENCE_THRESHOLD)
                logger.info(
                    f'JSON keys collide by case ("{collision.group(1)}"); '
                    f'retrying with map_inference_threshold={threshold}'
                )

    def build_reader_sql(
        self,
        file_path: str,
        map_inference_threshold: int = _DEFAULT_MAP_INFERENCE_THRESHOLD,
    ) -> str:
        """Build DuckDB read_json_auto SQL function call."""
        sample_size = self._options.get("sample_size", 1000)
        try:
            sample_size = int(sample_size)
        except (TypeError, ValueError):
            sample_size = 1000
        if sample_size == 0 or sample_size < -1:
            sample_size = 1000
        escaped_path = file_path.replace("'", "''")
        return (
            f"read_json_auto('{escaped_path}', "
            f"format='{self._format}', "
            f"sample_size={sample_size}, "
            f"map_inference_threshold={int(map_inference_threshold)}, "
            f"maximum_object_size={_MAX_OBJECT_BYTES})"
        )

    def validate(self, path: str) -> None:
        """Validate that path points to a valid, non-empty JSON / NDJSON file."""
        if not os.path.exists(path):
            raise FileProcessingError("Temporary file missing during validation.")
        if os.path.getsize(path) == 0:
            raise InvalidInputError("Uploaded JSON file is empty.")
        sample = _sniff(path)
        if not sample:
            raise InvalidInputError("Uploaded JSON file is empty or unreadable.")
        if sample[0] not in ("[", "{"):
            raise InvalidInputError(
                "Uploaded file does not appear to be valid JSON or NDJSON "
                "(expected '[' or '{' at the start of the file)."
            )
