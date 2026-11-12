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

# Engine names (and the legacy 'file' alias). Connector ids such as 'csv' or
# 'kaggle' resolve through the connector registry, which declares each
# connector's dialect, so a new connector needs no entry here.
_DIALECT_MAP = {
    'clickhouse': _clickhouse_dialect,
    'duckdb': _duckdb_dialect,
    'file': _duckdb_dialect,
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
    if dialect is not None:
        return dialect

    # Imported lazily: the registry imports the connectors, which import this module.
    from backend.connectors.registry import get_connector_registry

    specs = get_connector_registry().list_specs()
    spec = specs.get(normalized)
    if spec is None:
        known = sorted(set(_DIALECT_MAP) | set(specs))
        raise ValueError(f"Unknown db_type: {db_type}. Known types: {known}")
    return spec.dialect


def engine_name(db_type) -> str:
    """The query engine ('duckdb', 'clickhouse', ...) behind a db_type or dialect.

    Unknown strings are returned lower-cased, unchanged.
    """
    if hasattr(db_type, "name"):
        return db_type.name
    normalized = str(db_type).lower()
    try:
        return get_dialect(normalized).name
    except ValueError:
        return normalized


__all__ = [
    'SqlDialect',
    'ClickHouseDialect',
    'DuckDbDialect',
    'get_dialect',
    'engine_name',
]
