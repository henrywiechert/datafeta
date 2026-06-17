# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""
SQL dialect abstractions for database-specific query generation.

This module provides a unified interface for SQL dialects, allowing query
services to work with different database backends without scattered
conditional logic.

Usage:
    from backend.dialects import SqlDialect, ClickHouseDialect, DuckDbDialect, get_dialect
    
    # From connector
    dialect = connector.sql_dialect
    
    # From db_type string (migration helper)
    dialect = get_dialect('clickhouse')
    
    quote_char = dialect.quote_char
    random_fn = dialect.random_func_name()
"""

from backend.dialects.base import SqlDialect
from backend.dialects.clickhouse import ClickHouseDialect
from backend.dialects.duckdb import DuckDbDialect

_clickhouse_dialect = ClickHouseDialect()
_duckdb_dialect = DuckDbDialect()

_DIALECT_MAP = {
    'clickhouse': _clickhouse_dialect,
    'duckdb': _duckdb_dialect,
    'csv': _duckdb_dialect,
    'file': _duckdb_dialect,
    'kaggle': _duckdb_dialect,
    'huggingface': _duckdb_dialect,
    'hive_parquet': _duckdb_dialect,
}


def get_dialect(db_type: str) -> SqlDialect:
    """
    Get a dialect instance for the given db_type string.
    
    This is a migration helper to allow services that currently receive
    db_type as a string to obtain a dialect. Prefer using connector.sql_dialect
    when the connector is available.
    
    Args:
        db_type: Database type string (e.g., 'clickhouse', 'duckdb', 'csv')
        
    Returns:
        The appropriate SqlDialect instance
        
    Raises:
        ValueError: If db_type is not recognized
    """
    normalized = db_type.lower()
    dialect = _DIALECT_MAP.get(normalized)
    if dialect is None:
        raise ValueError(f"Unknown db_type: {db_type}. Known types: {list(_DIALECT_MAP.keys())}")
    return dialect


__all__ = [
    'SqlDialect',
    'ClickHouseDialect',
    'DuckDbDialect',
    'get_dialect',
]
