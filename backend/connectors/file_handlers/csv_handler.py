"""CSV file handler for DuckDB-based reading and validation."""
import csv
import os
from typing import Any, Dict

from backend.exceptions import FileProcessingError, InvalidInputError

from .base import BaseFileHandler

_CSV_SNIFF_BYTES = 16384


class CsvFileHandler(BaseFileHandler):
    """Handles CSV file reading via DuckDB and CSV-specific validation."""

    FILE_EXTENSION = ".csv"

    def __init__(self, config: Dict[str, Any]) -> None:
        self._config = config

    @property
    def config(self) -> Dict[str, Any]:
        return self._config

    def build_reader_sql(self, file_path: str) -> str:
        """Build DuckDB read_csv_auto SQL function call with proper parameter escaping."""
        params = []

        # Delimiter
        delimiter = self._config.get("delimiter", ",")
        if delimiter == "\\t":
            delimiter = "\t"
        params.append(f"delim='{delimiter.replace(chr(39), chr(39)*2)}'")

        # Header
        header = self._config.get("header", True)
        params.append(f"header={str(header).lower()}")

        # Decimal separator
        decimal_sep = self._config.get("decimal_separator", ".")
        params.append(f"decimal_separator='{decimal_sep.replace(chr(39), chr(39)*2)}'")

        # Note: DuckDB's read_csv_auto() does NOT support a thousands_separator parameter.
        # Thousands separators in quoted numbers (e.g., "217,351") are kept as strings by
        # DuckDB. The config value is stored for potential future use but not passed to DuckDB.

        # Date and timestamp formats
        date_fmt = self._config.get("date_format", "%Y-%m-%d")
        timestamp_fmt = self._config.get("timestamp_format", "%Y-%m-%d %H:%M:%S")
        params.append(f"dateformat='{date_fmt.replace(chr(39), chr(39)*2)}'")
        params.append(f"timestampformat='{timestamp_fmt.replace(chr(39), chr(39)*2)}'")

        params.append("sample_size=1000")

        params_str = ", ".join(params)
        escaped_path = file_path.replace("'", "''")
        return (
            f"read_csv_auto('{escaped_path}', {params_str},"
            " nullstr=['', 'NULL', 'null', 'NaN', 'nan', 'N/A', 'n/a', 'NA'])"
        )

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
