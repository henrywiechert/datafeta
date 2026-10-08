# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Excel / OpenDocument workbook handler (python-calamine).

A workbook holds several sheets: they are its selectable parts, and each
selected sheet is converted once into a Parquet file that FileConnector then
queries like any other Parquet upload.

Spreadsheets are messy: report titles sit above the header row, a column can
mix numbers and text, and every number is stored as a float. The conversion
therefore detects the header row and infers each column's type from all of
its cells rather than from the first few rows.
"""
import datetime as dt
import logging
import os
from typing import Any, Iterable, List, Optional, Sequence, Tuple

import pyarrow as pa
import pyarrow.parquet as pq
from python_calamine import (
    CalamineError,
    CalamineWorkbook,
    PasswordError,
    SheetTypeEnum,
    SheetVisibleEnum,
)

from backend.exceptions import InvalidInputError

from .base import (
    DATE_FORMAT_OPTIONS,
    BaseFileHandler,
    FileFormat,
    OpenedFile,
    PartInfo,
    TableSource,
    derived_path,
    resolve_part_selection,
)
from .parquet_handler import ParquetFileHandler

logger = logging.getLogger(__name__)

# xlsx/xlsm/xlsb/ods are zip containers; legacy xls is an OLE2 compound file.
_ZIP_MAGIC = b"PK\x03\x04"
_OLE2_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"

# Non-empty rows scanned for the header row (title rows sit above it).
_HEADER_SCAN_ROWS = 30
# Rows buffered per Parquet row group while writing a sheet.
_WRITE_CHUNK_ROWS = 65536

_INT64_LIMIT = 2 ** 63

# Text cells read as NULL; matches the CSV reader's nullstr list.
_NULL_TOKENS = {"NULL", "null", "NaN", "nan", "N/A", "n/a", "NA"}



def _open_workbook(path: str) -> CalamineWorkbook:
    try:
        return CalamineWorkbook.from_path(path)
    except PasswordError:
        raise InvalidInputError("Password-protected workbooks are not supported.")
    except (CalamineError, OSError, ValueError) as e:
        raise InvalidInputError(f"Uploaded file is not a readable Excel/OpenDocument workbook: {e}")


def validate_workbook(path: str) -> None:
    """Check the container signature, then open the workbook to read its sheet list."""
    try:
        with open(path, "rb") as handle:
            header = handle.read(len(_OLE2_MAGIC))
    except OSError as e:
        raise InvalidInputError(f"Could not read uploaded file: {e}")
    if not (header.startswith(_ZIP_MAGIC) or header == _OLE2_MAGIC):
        raise InvalidInputError(
            "Uploaded file does not appear to be a valid Excel/OpenDocument workbook."
        )
    workbook = _open_workbook(path)
    try:
        if not workbook.sheet_names:
            raise InvalidInputError("Uploaded workbook contains no sheets.")
    finally:
        workbook.close()


def _sheet_info(metadata) -> PartInfo:
    if metadata.visible != SheetVisibleEnum.Visible:
        return PartInfo(metadata.name, False, "hidden")
    if metadata.typ == SheetTypeEnum.ChartSheet:
        return PartInfo(metadata.name, False, "chart sheet")
    if metadata.typ != SheetTypeEnum.WorkSheet:
        return PartInfo(metadata.name, False, "not a worksheet")
    return PartInfo(metadata.name, True)


def list_sheets(path: str) -> List[PartInfo]:
    """List every sheet; only visible worksheets are selectable."""
    workbook = _open_workbook(path)
    try:
        return [_sheet_info(m) for m in workbook.sheets_metadata]
    finally:
        workbook.close()


class WorkbookFileHandler(BaseFileHandler):
    """Excel / OpenDocument workbooks: one table per selected sheet.

    Dates stored as text are parsed with the shared date/timestamp formats
    (``date_format`` / ``timestamp_format`` options); real date cells need none.
    """

    FORMAT = FileFormat(
        key="workbook",
        label="Excel",
        extensions=(".xlsx", ".xlsm", ".xls", ".xlsb", ".ods"),
        mime_types=frozenset({
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel.sheet.macroEnabled.12",
            "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
            "application/vnd.oasis.opendocument.spreadsheet",
            "application/vnd.ms-excel",
            "application/octet-stream",
        }),
        options=frozenset({DATE_FORMAT_OPTIONS}),
        part_label="sheet",
    )

    def validate(self, path: str) -> None:
        validate_workbook(path)

    def list_parts(self, path: str) -> List[PartInfo]:
        return list_sheets(path)

    def open(
        self,
        path: str,
        parts: Optional[Sequence[str]] = None,
        display_name: Optional[str] = None,
    ) -> OpenedFile:
        """Convert the selected sheets to Parquet.

        A workbook with a single loadable sheet becomes one table named after
        the file; with several, each table is "<workbook>_<sheet>". Names
        depend only on the file, so a restored saved state finds the same tables.
        """
        filename = display_name or os.path.basename(path)
        available = list_sheets(path)
        selected = resolve_part_selection(available, parts, filename, "sheet")
        if not selected:
            raise InvalidInputError(f"'{filename}' has no visible worksheets to load.")
        single_sheet = sum(1 for s in available if s.selectable) == 1

        opened = OpenedFile([])
        try:
            for index, sheet in enumerate(selected):
                parquet_path = derived_path(path, f"sheet{index}")
                converted = convert_sheet_to_parquet(
                    path,
                    sheet,
                    parquet_path,
                    date_format=self._options.get("date_format"),
                    timestamp_format=self._options.get("timestamp_format"),
                )
                if not converted:
                    opened.skipped_parts.append(sheet)
                    continue
                opened.tables.append(TableSource(
                    path=parquet_path,
                    reader=ParquetFileHandler(),
                    part=None if single_sheet else sheet,
                    generated=True,
                ))
        except Exception:
            for table in opened.tables:
                if os.path.exists(table.path):
                    os.remove(table.path)
            raise

        if not opened.tables:
            raise InvalidInputError(f"The selected sheets of '{filename}' contain no data.")
        return opened


# ---------------------------------------------------------------------------
# Sheet -> Parquet conversion
# ---------------------------------------------------------------------------

def _is_blank(value: Any) -> bool:
    """calamine returns '' for empty and error cells."""
    return isinstance(value, str) and value == ""


def _clean(value: Any) -> Any:
    """Blank cells and null tokens ("n/a", "NULL", ...) become NULL."""
    if _is_blank(value) or (isinstance(value, str) and value in _NULL_TOKENS):
        return None
    return value


def _kind(value: Any) -> str:
    # bool before numbers (bool is an int subclass) and datetime before date.
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, int):
        return "int" if -_INT64_LIMIT <= value < _INT64_LIMIT else "float"
    if isinstance(value, float):
        if value.is_integer() and -_INT64_LIMIT <= value < _INT64_LIMIT:
            return "int"
        return "float"
    if isinstance(value, dt.datetime):
        return "datetime"
    if isinstance(value, dt.date):
        return "date"
    if isinstance(value, dt.time):
        return "time"
    if isinstance(value, dt.timedelta):
        return "duration"
    return "str"


def _resolve_type(kinds: set) -> Tuple[str, pa.DataType]:
    if not kinds or "str" in kinds:
        return "str", pa.string()
    if kinds == {"bool"}:
        return "bool", pa.bool_()
    if kinds == {"int"}:
        return "int", pa.int64()
    if kinds <= {"int", "float"}:
        return "float", pa.float64()
    if kinds == {"date"}:
        return "date", pa.date32()
    if kinds <= {"date", "datetime"}:
        return "datetime", pa.timestamp("us")
    if kinds == {"time"}:
        return "time", pa.time64("us")
    if kinds == {"duration"}:
        # Durations are stored as seconds so they can be aggregated and plotted.
        return "duration", pa.float64()
    return "str", pa.string()


class _TextDateProbe:
    """Tracks whether every text cell of a column parses with the configured formats.

    Exports often store dates as text (``"10/04/2026 22:00"``), and only a
    user-chosen format settles whether that is October 4 or April 10. The
    probe stops parsing once both formats have failed, so ordinary text
    columns cost a single failed attempt.
    """

    def __init__(self, date_format: Optional[str], timestamp_format: Optional[str]):
        self.date_format = date_format
        self.timestamp_format = timestamp_format
        self.date_ok = bool(date_format)
        self.timestamp_ok = bool(timestamp_format)

    def observe(self, text: str) -> None:
        text = text.strip()
        if self.timestamp_ok and not _parses(text, self.timestamp_format):
            self.timestamp_ok = False
        if self.date_ok and not _parses(text, self.date_format):
            self.date_ok = False

    @property
    def active(self) -> bool:
        return self.date_ok or self.timestamp_ok


def _parses(text: str, fmt: Optional[str]) -> bool:
    try:
        dt.datetime.strptime(text, fmt)
        return True
    except (TypeError, ValueError):
        return False


def _resolve_column(kinds: set, probe: Optional[_TextDateProbe]) -> Tuple[str, pa.DataType, Optional[str]]:
    """Column target, Arrow type and the strptime format for its text cells (if any)."""
    if (
        "str" in kinds
        and probe is not None
        and probe.active
        and kinds - {"str"} <= {"date", "datetime"}
    ):
        if probe.timestamp_ok:
            return "datetime", pa.timestamp("us"), probe.timestamp_format
        if "datetime" in kinds:
            return "datetime", pa.timestamp("us"), probe.date_format
        return "date", pa.date32(), probe.date_format
    target, arrow_type = _resolve_type(kinds)
    return target, arrow_type, None


def _as_text(value: Any) -> str:
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, float) and value.is_integer() and abs(value) < _INT64_LIMIT:
        return str(int(value))
    if isinstance(value, dt.datetime):
        return value.isoformat(sep=" ")
    if isinstance(value, (dt.date, dt.time)):
        return value.isoformat()
    return str(value)


def _convert(value: Any, target: str, text_format: Optional[str] = None) -> Any:
    if value is None:
        return None
    if text_format and isinstance(value, str):
        parsed = dt.datetime.strptime(value.strip(), text_format)
        return parsed.date() if target == "date" else parsed
    if target == "str":
        return _as_text(value)
    if target == "int":
        return int(value)
    if target == "float":
        return float(value)
    if target == "datetime" and not isinstance(value, dt.datetime):
        return dt.datetime.combine(value, dt.time())
    if target == "duration":
        return value.total_seconds()
    return value


def _non_empty_count(row: Sequence[Any]) -> int:
    return sum(1 for v in row if not _is_blank(v))


def _detect_header(rows: Iterable[Sequence[Any]]) -> Optional[int]:
    """Return the index of the header row, or None when the sheet has no header.

    Report-style sheets put a title (and blank rows) above the real header,
    so the header is the first row that is at least half as wide as the
    widest of the first rows and consists mostly of text. A sheet whose
    leading rows are all numbers or dates has no header at all.
    """
    window: List[Tuple[int, Sequence[Any]]] = []
    for index, row in enumerate(rows):
        if _non_empty_count(row):
            window.append((index, row))
            if len(window) >= _HEADER_SCAN_ROWS:
                break
    if not window:
        return None
    widest = max(_non_empty_count(row) for _, row in window)
    threshold = max(1, (widest + 1) // 2)
    for index, row in window:
        values = [v for v in row if not _is_blank(v)]
        if len(values) < threshold:
            continue
        text_count = sum(1 for v in values if isinstance(v, str))
        if text_count * 2 >= len(values):
            return index
        # The first wide row is data, so there is no header row.
        return None
    return None


def _header_name(value: Any) -> str:
    return "" if _is_blank(value) else _as_text(value).strip()


def _unique_column_names(raw: List[str]) -> List[str]:
    """Fill empty headers and de-duplicate case-insensitively (DuckDB identifiers are)."""
    names: List[str] = []
    seen = set()
    for position, name in enumerate(raw, start=1):
        base = name or f"column_{position}"
        candidate, counter = base, 2
        while candidate.lower() in seen:
            candidate = f"{base}_{counter}"
            counter += 1
        seen.add(candidate.lower())
        names.append(candidate)
    return names


def convert_sheet_to_parquet(
    path: str,
    sheet_name: str,
    out_path: str,
    date_format: Optional[str] = None,
    timestamp_format: Optional[str] = None,
) -> bool:
    """Write one sheet as a Parquet file.

    ``date_format`` / ``timestamp_format`` (strptime patterns, shared with the
    CSV options) turn columns of dates stored as text into DATE / TIMESTAMP
    when every text cell parses; real date cells need no format.

    Returns False (writing nothing) when the sheet holds no data rows, so the
    caller can skip it instead of creating an empty table.
    """
    try:
        return _convert_sheet(path, sheet_name, out_path, date_format, timestamp_format)
    except BaseException as e:
        if os.path.exists(out_path):
            os.remove(out_path)
        if isinstance(e, CalamineError):
            raise InvalidInputError(f"Could not read sheet '{sheet_name}': {e}")
        # calamine surfaces Rust panics as pyo3 PanicException, which derives
        # from BaseException and would slip past ``except Exception`` handlers.
        if type(e).__name__ == "PanicException":
            raise InvalidInputError(
                f"Could not read sheet '{sheet_name}': the workbook is malformed."
            )
        raise


def _convert_sheet(
    path: str,
    sheet_name: str,
    out_path: str,
    date_format: Optional[str],
    timestamp_format: Optional[str],
) -> bool:
    workbook = _open_workbook(path)
    try:
        sheet = workbook.get_sheet_by_name(sheet_name)
        # Iterating an empty sheet panics inside calamine.
        if sheet.start is None or sheet.height == 0:
            return False
        header_index = _detect_header(sheet.iter_rows())

        # Pass 1: column bounds and per-column value kinds over every data row.
        header_row: Sequence[Any] = []
        width = 0
        kinds: List[set] = []
        probes: List[_TextDateProbe] = []
        data_rows = 0
        first_col: Optional[int] = None
        last_col = -1
        non_blank_cols: set = set()
        for index, row in enumerate(sheet.iter_rows()):
            if header_index is not None and index < header_index:
                continue
            if index == header_index:
                header_row = row
                for col, value in enumerate(row):
                    if not _is_blank(value):
                        first_col = col if first_col is None else min(first_col, col)
                        last_col = max(last_col, col)
                continue
            if len(row) > width:
                kinds.extend(set() for _ in range(len(row) - width))
                probes.extend(
                    _TextDateProbe(date_format, timestamp_format) for _ in range(len(row) - width)
                )
                width = len(row)
            has_value = False
            for col, value in enumerate(row):
                if _is_blank(value):
                    continue
                has_value = True
                non_blank_cols.add(col)
                value = _clean(value)
                if value is not None:
                    kind = _kind(value)
                    kinds[col].add(kind)
                    if kind == "str" and probes[col].active:
                        probes[col].observe(value)
                first_col = col if first_col is None else min(first_col, col)
                last_col = max(last_col, col)
            if has_value:
                data_rows += 1

        if data_rows == 0 or first_col is None:
            return False

        columns = range(first_col, last_col + 1)
        raw_names = [
            _header_name(header_row[col]) if col < len(header_row) else "" for col in columns
        ]
        # Drop columns with neither a header nor any non-blank cell inside the bounds.
        keep = [
            col for col, name in zip(columns, raw_names)
            if name or col in non_blank_cols
        ]
        names = _unique_column_names([raw_names[col - first_col] for col in keep])
        targets = [
            _resolve_column(kinds[col], probes[col]) if col < width else _resolve_column(set(), None)
            for col in keep
        ]
        schema = pa.schema([(name, arrow_type) for name, (_, arrow_type, _) in zip(names, targets)])

        # Pass 2: convert and write in chunks to bound memory use.
        writer = pq.ParquetWriter(out_path, schema)
        try:
            buffers: List[List[Any]] = [[] for _ in keep]

            def flush() -> None:
                if not buffers[0]:
                    return
                arrays = [
                    pa.array(values, type=arrow_type)
                    for values, (_, arrow_type, _) in zip(buffers, targets)
                ]
                writer.write_table(pa.Table.from_arrays(arrays, schema=schema))
                for values in buffers:
                    values.clear()

            for index, row in enumerate(sheet.iter_rows()):
                if header_index is not None and index <= header_index:
                    continue
                raw = [row[col] if col < len(row) else "" for col in keep]
                # Same rule as pass 1: only fully blank rows are dropped.
                if all(_is_blank(v) for v in raw):
                    continue
                for buffer, value, (target, _, text_format) in zip(buffers, raw, targets):
                    buffer.append(_convert(_clean(value), target, text_format))
                if len(buffers[0]) >= _WRITE_CHUNK_ROWS:
                    flush()
            flush()
        finally:
            writer.close()
    finally:
        workbook.close()

    logger.info(f"Workbook sheet -> Parquet: {path} [{sheet_name}] -> {out_path} ({data_rows} rows)")
    return True
