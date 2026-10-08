# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""CSV file handler for DuckDB-based reading and validation."""
import csv
import os
from typing import Any, Dict, List, Sequence

from backend.exceptions import FileProcessingError, InvalidInputError

from .base import CSV_OPTIONS, DATE_FORMAT_OPTIONS, BaseFileHandler, FileFormat

_CSV_SNIFF_BYTES = 16384


def build_csv_handler_config(connection_details: Dict[str, Any]) -> Dict[str, Any]:
    """Build CsvFileHandler config dict from ConnectionDetails-style keys."""
    return {
        "delimiter": connection_details.get("csv_delimiter", ","),
        "header": connection_details.get("csv_has_header", True),
        "decimal_separator": connection_details.get("csv_decimal_separator", "."),
        "thousands_separator": connection_details.get("csv_thousands_separator", ""),
        "date_format": connection_details.get("csv_date_format", "%Y-%m-%d"),
        "timestamp_format": connection_details.get(
            "csv_timestamp_format", "%Y-%m-%d %H:%M:%S"
        ),
        "sample_size": (
            -1
            if connection_details.get("csv_sample_full_dataset", False)
            else connection_details.get("csv_sample_size", 1000)
        ),
        "trim_numeric_whitespace": connection_details.get("csv_trim_numeric_whitespace", False),
    }


class CsvFileHandler(BaseFileHandler):
    """Handles CSV file reading via DuckDB and CSV-specific validation."""

    FILE_EXTENSION = ".csv"
    FORMAT = FileFormat(
        key="csv",
        label="CSV",
        extensions=(".csv",),
        mime_types=frozenset({
            "text/csv",
            "application/csv",
            "application/vnd.ms-excel",  # how Windows browsers often report .csv
            "text/plain",
        }),
        options=frozenset({CSV_OPTIONS, DATE_FORMAT_OPTIONS}),
    )

    @property
    def config(self) -> Dict[str, Any]:
        return self._options

    def build_reader_sql(self, file_path: str) -> str:
        """Build DuckDB read_csv_auto SQL function call with proper parameter escaping."""
        params = []

        # Delimiter
        delimiter = self._options.get("delimiter", ",")
        if delimiter == "\\t":
            delimiter = "\t"
        params.append(f"delim='{delimiter.replace(chr(39), chr(39)*2)}'")

        # Header
        header = self._options.get("header", True)
        params.append(f"header={str(header).lower()}")

        # RFC 4180 double-quote; do not rely on auto-detect (fails when quoted
        # fields with commas appear only after sample_size rows).
        params.append("quote='\"'")

        # Decimal separator
        decimal_sep = self._options.get("decimal_separator", ".")
        params.append(f"decimal_separator='{decimal_sep.replace(chr(39), chr(39)*2)}'")

        # Note: DuckDB's read_csv_auto() does NOT support a thousands_separator parameter.
        # Thousands separators in quoted numbers (e.g., "217,351") are kept as strings by
        # DuckDB. The config value is stored for potential future use but not passed to DuckDB.

        # Date and timestamp formats
        date_fmt = self._options.get("date_format", "%Y-%m-%d")
        timestamp_fmt = self._options.get("timestamp_format", "%Y-%m-%d %H:%M:%S")
        params.append(f"dateformat='{date_fmt.replace(chr(39), chr(39)*2)}'")
        params.append(f"timestampformat='{timestamp_fmt.replace(chr(39), chr(39)*2)}'")

        sample_size = self._options.get("sample_size", 1000)
        if sample_size == "full":
            sample_size = -1
        try:
            sample_size = int(sample_size)
        except (TypeError, ValueError):
            sample_size = 1000
        if sample_size == 0 or sample_size < -1:
            sample_size = 1000
        params.append(f"sample_size={sample_size}")

        params_str = ", ".join(params)
        escaped_path = file_path.replace("'", "''")
        return (
            f"read_csv_auto('{escaped_path}', {params_str},"
            " nullstr=['', 'NULL', 'null', 'NaN', 'nan', 'N/A', 'n/a', 'NA'])"
        )

    def view_select_list(self, con, raw_view: str, describe: Sequence[tuple]) -> List[str]:
        """Optionally re-cast VARCHAR columns that are numbers with stray whitespace.

        DuckDB's CSV sniffer fails to detect a column as DOUBLE when values
        have trailing whitespace (e.g. "123.5 "), falling back to VARCHAR,
        even though leading whitespace and TRY_CAST both parse it fine. When
        trim_numeric_whitespace is on, any VARCHAR column that fully
        round-trips through TRIM + TRY_CAST(... AS DOUBLE) is re-cast so
        numeric CSV data with stray whitespace still gets a numeric type.
        """
        varchar_cols = (
            [row[0] for row in describe if row[1].upper() == "VARCHAR"]
            if self._options.get("trim_numeric_whitespace", False)
            else []
        )

        numeric_cols = set()
        if varchar_cols:
            checks = ", ".join(
                f'COUNT(*) FILTER (WHERE "{c}" IS NOT NULL AND TRY_CAST(TRIM("{c}") AS DOUBLE) IS NULL) AS "{c}__bad", '
                f'COUNT(*) FILTER (WHERE "{c}" IS NOT NULL) AS "{c}__present"'
                for c in varchar_cols
            )
            check_result = con.execute(f"SELECT {checks} FROM {raw_view};").fetchone()
            column_names = [desc[0] for desc in con.description]
            checks_by_col = dict(zip(column_names, check_result))
            numeric_cols = {
                c for c in varchar_cols
                if checks_by_col[f"{c}__present"] > 0 and checks_by_col[f"{c}__bad"] == 0
            }

        return [
            f'TRY_CAST(TRIM("{row[0]}") AS DOUBLE) AS "{row[0]}"' if row[0] in numeric_cols else f'"{row[0]}"'
            for row in describe
        ]

    def validate(self, path: str) -> None:
        """Validate that path points to a valid, non-empty CSV file."""
        if not os.path.exists(path):
            raise FileProcessingError("Temporary file missing during validation.")
        with open(path, "rb") as f:
            sample_bytes = f.read(_CSV_SNIFF_BYTES)
        sample = sample_bytes.decode("utf-8", errors="ignore")
        if not sample or not sample.strip():
            raise InvalidInputError("Uploaded CSV file is empty or unreadable.")
        try:
            csv.Sniffer().sniff(sample)
        except csv.Error:
            try:
                next(csv.reader(sample.splitlines()))
            except Exception:
                raise InvalidInputError(
                    "Uploaded file does not appear to be valid CSV."
                )
