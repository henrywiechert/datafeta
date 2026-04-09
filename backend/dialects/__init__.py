"""
SQL dialect abstractions for database-specific query generation.

This module provides a unified interface for SQL dialects, allowing query
services to work with different database backends without scattered
conditional logic.

Usage:
    from backend.dialects import SqlDialect, ClickHouseDialect, DuckDbDialect
    
    dialect = connector.sql_dialect
    quote_char = dialect.quote_char
    random_fn = dialect.random_func_name()
"""

from backend.dialects.base import SqlDialect
from backend.dialects.clickhouse import ClickHouseDialect
from backend.dialects.duckdb import DuckDbDialect

__all__ = [
    'SqlDialect',
    'ClickHouseDialect',
    'DuckDbDialect',
]
