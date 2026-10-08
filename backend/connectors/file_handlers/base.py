# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Abstract base class and value types for file format handlers.

A handler owns everything format-specific about an uploaded file: how to
validate it, which parts (e.g. workbook sheets) it offers, and how to turn
it into one or more queryable tables. FileConnector, ConnectionService and
the frontend only see the declared FileFormat, so adding a format means
adding a handler and registering it - nothing else.
"""
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, ClassVar, Dict, FrozenSet, List, Mapping, Optional, Sequence, Tuple

from backend.exceptions import InvalidInputError

# Parsing option groups a format can honour (FileFormat.options). The
# frontend shows the matching settings when such a file is selected.
CSV_OPTIONS = "csv"              # delimiter, header, separators, sampling, whitespace fix
DATE_FORMAT_OPTIONS = "date_formats"  # date / timestamp patterns for dates stored as text


@dataclass(frozen=True)
class FileFormat:
    """Public description of an uploadable file format."""
    key: str
    label: str
    extensions: Tuple[str, ...]
    mime_types: FrozenSet[str] = frozenset()
    options: FrozenSet[str] = frozenset()
    # Singular noun for selectable parts (e.g. "sheet"); None = one table per file.
    part_label: Optional[str] = None

    def to_public(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "extensions": list(self.extensions),
            "options": sorted(self.options),
            "partLabel": self.part_label,
        }


@dataclass(frozen=True)
class PartInfo:
    """A selectable part of a multi-part file (e.g. a workbook sheet)."""
    name: str
    selectable: bool
    reason: Optional[str] = None  # why the part cannot be selected

    def to_dict(self) -> Dict[str, Any]:
        return {"name": self.name, "selectable": self.selectable, "reason": self.reason}


@dataclass
class TableSource:
    """One queryable table produced from an uploaded file."""
    path: str                       # file read by ``reader``
    reader: "BaseFileHandler"
    part: Optional[str] = None      # appended to the file name to form the table name
    generated: bool = False         # derived from the upload; its owner deletes it


@dataclass
class OpenedFile:
    """Result of BaseFileHandler.open: the tables plus parts skipped for having no data."""
    tables: List[TableSource]
    skipped_parts: List[str] = field(default_factory=list)


class BaseFileHandler(ABC):
    """Abstract handler for a specific file format.

    Single-table formats implement build_reader_sql (and validate); open()
    then returns the file itself as the only table. Formats that convert or
    split their input override open() and return derived TableSources read
    by another handler (typically ParquetFileHandler).
    """

    FORMAT: ClassVar[FileFormat]

    def __init__(self, options: Optional[Mapping[str, Any]] = None, extension: Optional[str] = None):
        self._options: Dict[str, Any] = dict(options or {})
        self._extension = extension

    @property
    def options(self) -> Dict[str, Any]:
        return self._options

    @property
    def file_type(self) -> str:
        """Short name for the file type."""
        return self.FORMAT.key

    @abstractmethod
    def validate(self, path: str) -> None:
        """Synchronously validate that path points to a valid file of this type.

        Raises InvalidInputError or FileProcessingError on failure.
        Intended to be called via run_in_threadpool from async callers.
        """
        ...

    def build_reader_sql(self, file_path: str) -> str:
        """Return a DuckDB SQL expression that reads the file at file_path."""
        raise NotImplementedError(f"{type(self).__name__} is not read directly")

    def view_select_list(self, con, raw_view: str, describe: Sequence[tuple]) -> List[str]:
        """SELECT expressions for the table view over the raw reader view.

        Hook for per-format column fixes (e.g. CSV numeric whitespace).
        """
        return [f'"{row[0]}"' for row in describe]

    def list_parts(self, path: str) -> Optional[List[PartInfo]]:
        """Selectable parts of the file, or None when the file is always one table."""
        return None

    def open(
        self,
        path: str,
        parts: Optional[Sequence[str]] = None,
        display_name: Optional[str] = None,
    ) -> OpenedFile:
        """Turn the file into tables.

        ``parts`` selects parts (None = all selectable); ``display_name`` is
        the uploaded filename, for messages.
        """
        return OpenedFile([TableSource(path=path, reader=self)])


def resolve_part_selection(
    parts: Sequence[PartInfo],
    requested: Optional[Sequence[str]],
    filename: str,
    part_label: str = "part",
) -> List[str]:
    """Validate requested part names; ``None`` selects every selectable part.

    Returns the selection in file order regardless of the order requested.
    """
    selectable = [p.name for p in parts if p.selectable]
    if requested is None:
        return selectable
    missing = [name for name in requested if name not in selectable]
    if missing:
        raise InvalidInputError(
            f"{part_label.capitalize()}(s) {', '.join(repr(m) for m in missing)} not found or not "
            f"loadable in '{filename}'. Available {part_label}s: {', '.join(selectable) or '(none)'}"
        )
    if not requested:
        raise InvalidInputError(f"Select at least one {part_label} from '{filename}'.")
    wanted = set(requested)
    return [name for name in selectable if name in wanted]


def derived_path(source_path: str, suffix: str) -> str:
    """Path for a file derived from an upload, next to it in the session directory."""
    return f"{os.path.splitext(source_path)[0]}__{suffix}.parquet"
