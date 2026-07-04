# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""
Service responsible for datetime field handling and transformations.

This module provides centralized datetime functionality including:
- Database-specific datetime part extraction (distinct mode)
- Timeline truncation (timeline mode)
- Support for ClickHouse, DuckDB, PostgreSQL, and other SQL databases
"""

from typing import TYPE_CHECKING, Any, Dict, Callable, Optional, Union
from pypika.terms import Function

from backend.exceptions import QueryGenerationError
from backend.services.query_components.terms import CastField, CustomFunction, ExtractTerm
from backend.services import datetime_semantics as semantics

if TYPE_CHECKING:
    from backend.dialects import SqlDialect


class DateTimeService:
    """
    Centralized service for datetime field operations.
    
    Handles two modes of datetime operations:
    1. Distinct mode: Extracts just the part (e.g., hour → 0-23, month → 1-12)
    2. Timeline mode: Truncates to preserve timeline (e.g., hour → "2024-01-15 14:00:00")
    """
    
    # Physical column types (case-insensitive substring match) that hold datetime
    # values as text and therefore must be parsed before datetime functions are
    # applied. Covers ClickHouse (String / Nullable(String) / LowCardinality(String))
    # and DuckDB / standard SQL (VARCHAR / TEXT / CHAR / STRING).
    _STRING_TYPE_TOKENS = ('STRING', 'VARCHAR', 'TEXT', 'CHAR')

    @staticmethod
    def resolve_source_type(
        field_name: str,
        column_types: Optional[Dict[str, str]],
    ) -> Optional[str]:
        """
        Look up a field's physical column type from a name -> type map.

        Handles table-qualified names (e.g. 'events.ts') by falling back to the
        bare column name when the qualified name is not present. Returns None when
        the type is unknown so callers default to unchanged behavior.
        """
        if not column_types:
            return None
        if field_name in column_types:
            return column_types[field_name]
        if '.' in field_name:
            return column_types.get(field_name.split('.', 1)[1])
        return None

    @staticmethod
    def _is_string_source_type(source_type: Optional[str]) -> bool:
        """Return True when the column's physical type stores datetimes as text."""
        if not source_type:
            return False
        upper = source_type.upper()
        return any(token in upper for token in DateTimeService._STRING_TYPE_TOKENS)

    @staticmethod
    def _parse_string_to_datetime(field_term: Any, normalized_db_type: str) -> Any:
        """
        Parse a text column into a real datetime so datetime functions can be applied.

        Used when a column is physically a string (e.g. ISO8601 like
        '2023-08-16T07:44:23.000Z') but the user overrode its type to DateTime in the
        UI. Without this, ClickHouse/DuckDB raise an illegal-argument error because the
        downstream functions (toTimeZone / date_trunc / EXTRACT) require a datetime.
        """
        if normalized_db_type == 'clickhouse':
            # Best-effort parser handles ISO8601 incl. trailing 'Z'; precision 3 (ms).
            return CustomFunction('parseDateTime64BestEffort', [field_term, 3])
        # DuckDB / standard SQL: CAST(... AS TIMESTAMP) accepts ISO8601 (drops 'Z').
        return CastField(field_term, 'TIMESTAMP')

    @staticmethod
    def _to_utc_clickhouse(field_term: Any) -> Any:
        """
        Normalize a ClickHouse DateTime/DateTime64 term to UTC before extracting/truncating parts.
        """
        return Function('toTimeZone', field_term, 'UTC')

    @staticmethod
    def _to_datetime64_utc_clickhouse(expr: Any) -> Any:
        """
        Wrap a Date-typed truncation result as DateTime64(0, 'UTC').

        ClickHouse toStartOfYear/toStartOfMonth return the Date type. The Arrow
        output format serializes Date as raw UInt16 days-since-epoch, which the
        frontend cannot distinguish from an epoch-seconds number — year/month
        timeline axes then collapse to dates near 1970-01-01. Converting to
        DateTime64 makes the wire type a real Arrow timestamp.
        """
        return Function('toDateTime64', expr, 0, 'UTC')

    @staticmethod
    def _to_utc_sql(field_term: Any, db_type: str) -> Any:
        """
        Best-effort UTC normalization for SQL engines.

        For DuckDB, timestamps are typically timezone-naive; we still apply a UTC wrapper
        when available so part extraction is consistently interpreted as UTC.
        """
        if db_type == 'duckdb':
            # DuckDB supports timezone('UTC', ts) for tz conversions / interpretation.
            return Function('timezone', 'UTC', field_term)
        return field_term

    # DISTINCT MODE: Extract just the part (e.g., hour 0-23, month 1-12)
    CLICKHOUSE_DATE_PART_MAP: Dict[str, Callable[[Any], Any]] = {
        'year': lambda f: Function('toYear', DateTimeService._to_utc_clickhouse(f)),
        'month': lambda f: Function('toMonth', DateTimeService._to_utc_clickhouse(f)),
        'day': lambda f: Function('toDayOfMonth', DateTimeService._to_utc_clickhouse(f)),
        # ClickHouse toDayOfWeek is ISO: Monday=1 ... Sunday=7
        'weekday': lambda f: Function('toDayOfWeek', DateTimeService._to_utc_clickhouse(f)),
        'hour': lambda f: Function('toHour', DateTimeService._to_utc_clickhouse(f)),
        'minute': lambda f: Function('toMinute', DateTimeService._to_utc_clickhouse(f)),
        'second': lambda f: Function('toSecond', DateTimeService._to_utc_clickhouse(f)),
        'millisecond': lambda f: Function('toUnixTimestamp64Milli', DateTimeService._to_utc_clickhouse(f)) % 1000,
        'microsecond': lambda f: Function('toUnixTimestamp64Micro', DateTimeService._to_utc_clickhouse(f)) % 1000000,
        'nanosecond': lambda f: Function('toUnixTimestamp64Nano', DateTimeService._to_utc_clickhouse(f)) % 1000000000,
    }
    
    # TIMELINE MODE: Truncate to preserve timeline (e.g., "2024-01-15 14:00:00")
    # Note: year/month truncations return the ClickHouse Date type and must be
    # wrapped to DateTime64 (see _to_datetime64_utc_clickhouse). The other parts
    # already return DateTime/DateTime64.
    CLICKHOUSE_TIMELINE_MAP: Dict[str, Callable[[Any], Any]] = {
        'year': lambda f: DateTimeService._to_datetime64_utc_clickhouse(
            Function('toStartOfYear', DateTimeService._to_utc_clickhouse(f))
        ),
        'month': lambda f: DateTimeService._to_datetime64_utc_clickhouse(
            Function('toStartOfMonth', DateTimeService._to_utc_clickhouse(f))
        ),
        'day': lambda f: Function('toStartOfDay', DateTimeService._to_utc_clickhouse(f)),
        'weekday': lambda f: Function('toStartOfDay', DateTimeService._to_utc_clickhouse(f)),  # Group by day for weekday timeline
        'hour': lambda f: Function('toStartOfHour', DateTimeService._to_utc_clickhouse(f)),
        'minute': lambda f: Function('toStartOfMinute', DateTimeService._to_utc_clickhouse(f)),
        'second': lambda f: Function('toStartOfSecond', DateTimeService._to_utc_clickhouse(f)),
        'millisecond': lambda f: Function('toStartOfMillisecond', DateTimeService._to_utc_clickhouse(f)),
        'microsecond': lambda f: Function('toStartOfMicrosecond', DateTimeService._to_utc_clickhouse(f)),
        'nanosecond': lambda f: Function('toStartOfNanosecond', DateTimeService._to_utc_clickhouse(f)),
    }
    
    # SQL DISTINCT MODE: EXTRACT parts
    SQL_DATE_PART_MAP: Dict[str, str] = semantics.DISTINCT_EXTRACT_PART
    
    # SQL TIMELINE MODE: date_trunc units
    SQL_TIMELINE_UNIT_MAP: Dict[str, str] = semantics.TIMELINE_UNITS
    
    @classmethod
    def get_datetime_part_expression(
        cls,
        field_term: Any,
        date_part: str,
        date_mode: str,
        db_type: Union[str, "SqlDialect"],
        source_type: Optional[str] = None,
    ) -> Any:
        """
        Generate database-specific SQL expression for datetime operations.
        
        Args:
            field_term: The field/column to extract from (PyPika term)
            date_part: The part to extract (year, month, day, hour, etc.)
            date_mode: Either 'distinct' or 'timeline'
            db_type: The database type (clickhouse, duckdb, etc.)
            source_type: Optional physical column type. When it is a string type
                (e.g. ClickHouse 'String', DuckDB 'VARCHAR'), the column is parsed
                to a datetime first so datetime functions can be applied. This
                supports UI type overrides where a text column is treated as
                DateTime. When None (default), behavior is unchanged.
        
        Returns:
            PyPika expression for the datetime operation
            
        Behavior:
            - distinct mode: Extracts just the part (e.g., hour → 0-23, month → 1-12)
            - timeline mode: Truncates to preserve timeline (e.g., hour → "2024-01-15 14:00:00")
            
        Examples:
            >>> # Distinct mode - ClickHouse
            >>> get_datetime_part_expression(field, 'hour', 'distinct', 'clickhouse')
            >>> # Generates: toHour(field) → 0-23
            
            >>> # Timeline mode - ClickHouse
            >>> get_datetime_part_expression(field, 'hour', 'timeline', 'clickhouse')
            >>> # Generates: toStartOfHour(field) → "2024-01-15 14:00:00"
            
            >>> # Timeline mode - DuckDB
            >>> get_datetime_part_expression(field, 'hour', 'timeline', 'duckdb')
            >>> # Generates: date_trunc('hour', field) → "2024-01-15 14:00:00"
        """
        # Migration-friendly: accept either a db_type string or a SqlDialect.
        normalized = db_type.name if hasattr(db_type, "name") else str(db_type).lower()
        if normalized in {'csv', 'file', 'kaggle', 'hive_parquet'}:
            normalized = 'duckdb'

        # Parse text columns to datetime before applying datetime functions. This
        # makes UI "treat as DateTime" overrides on string columns work instead of
        # raising an illegal-argument error from the database.
        if cls._is_string_source_type(source_type):
            field_term = cls._parse_string_to_datetime(field_term, normalized)

        if normalized == 'clickhouse':
            return cls._get_clickhouse_expression(field_term, date_part, date_mode)
        else:
            return cls._get_sql_expression(field_term, date_part, date_mode, normalized)
    
    @classmethod
    def _get_clickhouse_expression(
        cls,
        field_term: Any,
        date_part: str,
        date_mode: str
    ) -> Any:
        """Generate ClickHouse-specific datetime expression."""
        if date_mode == 'timeline':
            # Use timeline functions that preserve the full datetime
            extractor = cls.CLICKHOUSE_TIMELINE_MAP.get(date_part)
            if not extractor:
                raise QueryGenerationError(
                    f"Unsupported datetime part '{date_part}' for ClickHouse timeline mode"
                )
            return extractor(field_term)
        else:
            # Use distinct mode (extract just the part)
            extractor = cls.CLICKHOUSE_DATE_PART_MAP.get(date_part)
            if not extractor:
                raise QueryGenerationError(
                    f"Unsupported datetime part '{date_part}' for ClickHouse"
                )
            return extractor(field_term)
    
    @classmethod
    def _get_sql_expression(
        cls,
        field_term: Any,
        date_part: str,
        date_mode: str,
        db_type: str
    ) -> Any:
        """Generate SQL-standard datetime expression (DuckDB, PostgreSQL, etc.)."""
        field_utc = cls._to_utc_sql(field_term, db_type)
        if date_mode == 'timeline':
            # Use date_trunc for timeline mode
            unit = cls.SQL_TIMELINE_UNIT_MAP.get(date_part)
            if not unit:
                raise QueryGenerationError(
                    f"Unsupported datetime part '{date_part}' for SQL timeline mode"
                )
            return Function('date_trunc', unit, field_utc)
        else:
            # Use EXTRACT for distinct mode
            if date_part == 'weekday':
                # ISO weekday: Mon=1 ... Sun=7
                # Most SQL engines (incl DuckDB, Postgres) use DOW as 0=Sun..6=Sat.
                dow = ExtractTerm('DOW', field_utc)
                return ((dow + 6) % 7) + 1

            # Handle sub-second parts: EXTRACT(MILLISECOND ...) in DuckDB/Postgres returns
            # total ms including seconds (0-59999), so we need modulo to get just the part.
            modulo = semantics.get_modulo(date_part)
            if modulo:
                return ExtractTerm(cls.SQL_DATE_PART_MAP.get(date_part, date_part.upper()), field_utc) % modulo

            extract_part = cls.SQL_DATE_PART_MAP.get(date_part, date_part.upper())
            return ExtractTerm(extract_part, field_utc)
    
    @classmethod
    def get_supported_parts(cls) -> list[str]:
        """
        Get list of all supported datetime parts.
        
        Returns:
            List of supported datetime part names
        """
        return list(cls.CLICKHOUSE_DATE_PART_MAP.keys())
    
    @classmethod
    def is_valid_part(cls, date_part: str) -> bool:
        """
        Check if a datetime part is supported.
        
        Args:
            date_part: The datetime part to check
            
        Returns:
            True if the part is supported, False otherwise
        """
        return date_part in cls.CLICKHOUSE_DATE_PART_MAP
    
    @classmethod
    def is_valid_mode(cls, date_mode: str) -> bool:
        """
        Check if a datetime mode is valid.
        
        Args:
            date_mode: The datetime mode to check
            
        Returns:
            True if the mode is valid, False otherwise
        """
        return date_mode in ('distinct', 'timeline')

