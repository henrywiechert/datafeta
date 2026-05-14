# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Build WHERE clauses and queries for source tracking columns."""

from __future__ import annotations

from typing import List

from backend.models.query import Filter


def build_source_filter_where_clauses(
    filters: List[Filter],
    quote_char: str,
) -> List[str]:
    """
    Build WHERE clauses for source tracking filters (_source_database, _source_table).
    
    Args:
        filters: List of Filter objects for source tracking columns
        quote_char: Quote character for identifiers
        
    Returns:
        List of WHERE clause strings
    """
    where_clauses = []
    
    for filt in filters:
        field_quoted = f"{quote_char}{filt.field}{quote_char}"
        
        if filt.operator == '=':
            where_clauses.append(f"{field_quoted} = '{filt.value}'")
        elif filt.operator == '!=':
            where_clauses.append(f"{field_quoted} != '{filt.value}'")
        elif filt.operator == 'in':
            values = "', '".join(str(v) for v in filt.value)
            where_clauses.append(f"{field_quoted} IN ('{values}')")
        elif filt.operator == 'not in':
            values = "', '".join(str(v) for v in filt.value)
            where_clauses.append(f"{field_quoted} NOT IN ('{values}')")
        elif filt.operator == 'like':
            where_clauses.append(f"{field_quoted} LIKE '{filt.value}'")
    
    return where_clauses


def build_source_only_query(
    database: str,
    table_name: str,
    has_source_db_dim: bool,
    has_source_table_dim: bool,
    quote_char: str,
) -> str:
    """
    Build a simple query when only source tracking columns are requested.
    
    Args:
        database: Database name
        table_name: Table name
        has_source_db_dim: Whether _source_database is requested
        has_source_table_dim: Whether _source_table is requested
        quote_char: Quote character to use
        
    Returns:
        SQL query string
    """
    if database:
        table_reference = f"{quote_char}{database}{quote_char}.{quote_char}{table_name}{quote_char}"
    else:
        table_reference = f"{quote_char}{table_name}{quote_char}"
    
    source_cols = []
    if has_source_db_dim:
        source_cols.append(f"'{database}' AS {quote_char}_source_database{quote_char}")
    if has_source_table_dim:
        source_cols.append(f"'{table_name}' AS {quote_char}_source_table{quote_char}")
    
    return f"SELECT {', '.join(source_cols)} FROM {table_reference} LIMIT 1"
