"""
Service responsible for datetime field handling and transformations.

This module provides centralized datetime functionality including:
- Database-specific datetime part extraction (distinct mode)
- Timeline truncation (timeline mode)
- Support for ClickHouse, DuckDB, PostgreSQL, and other SQL databases
"""

from typing import Any, Dict, Callable
from pypika.terms import Function

from backend.exceptions import QueryGenerationError
from backend.services.query_components.terms import ExtractTerm


class DateTimeService:
    """
    Centralized service for datetime field operations.
    
    Handles two modes of datetime operations:
    1. Distinct mode: Extracts just the part (e.g., hour → 0-23, month → 1-12)
    2. Timeline mode: Truncates to preserve timeline (e.g., hour → "2024-01-15 14:00:00")
    """
    
    # DISTINCT MODE: Extract just the part (e.g., hour 0-23, month 1-12)
    CLICKHOUSE_DATE_PART_MAP: Dict[str, Callable[[Any], Any]] = {
        'year': lambda f: Function('toYear', f),
        'month': lambda f: Function('toMonth', f),
        'day': lambda f: Function('toDayOfMonth', f),
        'weekday': lambda f: Function('toDayOfWeek', f),
        'hour': lambda f: Function('toHour', f),
        'minute': lambda f: Function('toMinute', f),
        'second': lambda f: Function('toSecond', f),
        'millisecond': lambda f: Function('toUnixTimestamp64Milli', f) % 1000,
        'microsecond': lambda f: Function('toUnixTimestamp64Micro', f) % 1000000,
        'nanosecond': lambda f: Function('toUnixTimestamp64Nano', f) % 1000000000,
    }
    
    # TIMELINE MODE: Truncate to preserve timeline (e.g., "2024-01-15 14:00:00")
    CLICKHOUSE_TIMELINE_MAP: Dict[str, Callable[[Any], Any]] = {
        'year': lambda f: Function('toStartOfYear', f),
        'month': lambda f: Function('toStartOfMonth', f),
        'day': lambda f: Function('toStartOfDay', f),
        'weekday': lambda f: Function('toStartOfDay', f),  # Group by day for weekday timeline
        'hour': lambda f: Function('toStartOfHour', f),
        'minute': lambda f: Function('toStartOfMinute', f),
        'second': lambda f: Function('toStartOfSecond', f),
        'millisecond': lambda f: Function('toStartOfMillisecond', f),
        'microsecond': lambda f: Function('toStartOfMicrosecond', f),
        'nanosecond': lambda f: Function('toStartOfNanosecond', f),
    }
    
    # SQL DISTINCT MODE: EXTRACT parts
    SQL_DATE_PART_MAP: Dict[str, str] = {
        'year': 'YEAR',
        'month': 'MONTH',
        'day': 'DAY',
        'weekday': 'DOW',
        'hour': 'HOUR',
        'minute': 'MINUTE',
        'second': 'SECOND',
        'millisecond': 'MILLISECOND',
        'microsecond': 'MICROSECOND',
        'nanosecond': 'NANOSECOND',
    }
    
    # SQL TIMELINE MODE: date_trunc units
    SQL_TIMELINE_UNIT_MAP: Dict[str, str] = {
        'year': 'year',
        'month': 'month',
        'day': 'day',
        'weekday': 'day',  # Group by day for weekday timeline
        'hour': 'hour',
        'minute': 'minute',
        'second': 'second',
        'millisecond': 'millisecond',
        'microsecond': 'microsecond',
        'nanosecond': 'nanosecond',
    }
    
    @classmethod
    def get_datetime_part_expression(
        cls,
        field_term: Any,
        date_part: str,
        date_mode: str,
        db_type: str
    ) -> Any:
        """
        Generate database-specific SQL expression for datetime operations.
        
        Args:
            field_term: The field/column to extract from (PyPika term)
            date_part: The part to extract (year, month, day, hour, etc.)
            date_mode: Either 'distinct' or 'timeline'
            db_type: The database type (clickhouse, duckdb, etc.)
        
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
        if db_type == 'clickhouse':
            return cls._get_clickhouse_expression(field_term, date_part, date_mode)
        else:
            return cls._get_sql_expression(field_term, date_part, date_mode)
    
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
        date_mode: str
    ) -> Any:
        """Generate SQL-standard datetime expression (DuckDB, PostgreSQL, etc.)."""
        if date_mode == 'timeline':
            # Use date_trunc for timeline mode
            unit = cls.SQL_TIMELINE_UNIT_MAP.get(date_part)
            if not unit:
                raise QueryGenerationError(
                    f"Unsupported datetime part '{date_part}' for SQL timeline mode"
                )
            return Function('date_trunc', unit, field_term)
        else:
            # Use EXTRACT for distinct mode
            extract_part = cls.SQL_DATE_PART_MAP.get(date_part, date_part.upper())
            return ExtractTerm(extract_part, field_term)
    
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

