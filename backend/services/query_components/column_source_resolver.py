# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Resolving a single column reference to the one table it should be read from.

Distinct counts and field profiles both describe a *single column*, so they must
run against the table that owns that column rather than against the JOIN: a JOIN
would silently drop the values that have no match on the other side.

Column names can legitimately contain dots (`tableName.colName` is one column in
ClickHouse), so a dotted field is only split when its prefix matches a table that
is actually part of the virtual table definition.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field as dataclass_field
from typing import Any, Dict, List, Optional, Set

from pypika import Table

from backend.exceptions import QueryExecutionError
from backend.services import datetime_semantics as semantics
from backend.services.datetime_service import DateTimeService
from backend.services.query_components.schema_type_provider import SchemaTypeProvider

logger = logging.getLogger(__name__)


# Engines whose schema lookups are cheap enough to feed the virtual column
# builder with column types on every call.
_TYPED_VC_ENGINES = {'duckdb', 'csv', 'file', 'sqlite', 'kaggle', 'hive_parquet', 'huggingface'}


@dataclass
class ResolvedColumnSource:
    """A column reference bound to the single table it will be queried from."""

    field: str
    db_table: Table
    table_map: Dict[str, Table]
    resolved_table_name: str
    known_tables: Set[str] = dataclass_field(default_factory=set)
    resolved_from_join: bool = False
    # True when the resolved table's column literally carries the table-name
    # prefix, so sibling filter fields must keep theirs too.
    field_prefix_is_column_name: bool = False
    vc_builder: Optional[Any] = None


def normalize_table_name(table_ref: Optional[str]) -> Optional[str]:
    """Return the bare table name from either 'table' or 'database/table'."""
    if not table_ref:
        return table_ref
    if '/' in table_ref:
        parts = table_ref.split('/', 1)
        return parts[1] if len(parts) == 2 else table_ref
    return table_ref


def collect_known_tables(virtual_table: Optional[Any]) -> Set[str]:
    """Every table name participating in the virtual table definition."""
    known: Set[str] = set()
    if not virtual_table:
        return known
    known.add(normalize_table_name(virtual_table.primary_table))
    for jt in virtual_table.joined_tables:
        known.add(normalize_table_name(jt.table_name))
    for ut in virtual_table.union_tables:
        known.add(normalize_table_name(ut.table_name))
    known.discard(None)
    return known


def _make_table(name: str, database: Optional[str], dialect) -> Table:
    if dialect.supports_schema_prefix and database:
        return Table(name, schema=database)
    return Table(name)


def resolve_column_source(
    *,
    field: str,
    table: str,
    database: Optional[str],
    dialect,
    db_type: str,
    type_provider: SchemaTypeProvider,
    virtual_columns: Optional[list] = None,
    virtual_table: Optional[Any] = None,
    source_table: Optional[str] = None,
    log_context: str = "Column source",
) -> ResolvedColumnSource:
    """Bind `field` to the single table that owns it.

    Source table resolution priority:
    1. Explicit `source_table` (from `Column.table_name`, supplied by the frontend)
    2. Virtual table + field prefix matching (legacy fallback)
    3. The primary table
    """
    # Imported here to avoid a circular dependency at module import time.
    from backend.services.query_components.virtual_column_builder import (
        VirtualColumnExpressionBuilder,
    )

    has_joined_tables = bool(virtual_table and virtual_table.joined_tables)
    has_union_tables = bool(
        virtual_table and virtual_table.mode == 'union' and virtual_table.union_tables
    )

    known_tables = collect_known_tables(virtual_table)

    resolved_from_join = False
    resolved_table_name = table
    field_prefix_is_column_name = False

    # Priority 1: explicit source table from Column.table_name (most reliable).
    if source_table and source_table != table:
        # Merged-schema field names are prefixed "sourceTable.actualColumnName".
        prefix = source_table + '.'
        if field.startswith(prefix):
            field = field[len(prefix):]

        db_table = _make_table(source_table, database, dialect)
        table_map = {source_table: db_table}
        resolved_from_join = True
        resolved_table_name = source_table
        logger.info(
            "%s: using explicit source table '%s' for field '%s' (from Column.table_name)",
            log_context, source_table, field,
        )

    # Priority 2: virtual table + field prefix matching (legacy fallback).
    elif has_joined_tables and '.' in field:
        potential_table_name, remaining = field.split('.', 1)
        if potential_table_name in known_tables:
            db_table = _make_table(potential_table_name, database, dialect)
            table_map = {potential_table_name: db_table}
            field = remaining
            resolved_from_join = True
            resolved_table_name = potential_table_name
            logger.info(
                "%s: using source table '%s' directly for field '%s' "
                "(bypassing JOIN, from field prefix)",
                log_context, potential_table_name, remaining,
            )
        else:
            # The dot is part of the column name, not a table prefix.
            logger.info(
                "%s: field '%s' has a dot but prefix '%s' is not a known table (%s). "
                "Treating the full name as a column name.",
                log_context, field, potential_table_name, known_tables,
            )
            db_table = _make_table(table, database, dialect)
            table_map = {table: db_table}

    # Priority 2b: UNION mode + dotted field whose prefix matches a known table.
    # Here the dotted value may be a *literal* column name (e.g.
    # 'dlPreSchedData.raState'), so switch source table but do NOT split field.
    elif has_union_tables and '.' in field:
        potential_table_name = field.split('.', 1)[0]
        if potential_table_name in known_tables:
            db_table = _make_table(potential_table_name, database, dialect)
            table_map = {potential_table_name: db_table}
            resolved_from_join = True
            resolved_table_name = potential_table_name
            field_prefix_is_column_name = True
            logger.info(
                "%s: UNION mode resolved source table '%s' for dotted field '%s' "
                "without splitting the column name",
                log_context, potential_table_name, field,
            )
        else:
            db_table = _make_table(table, database, dialect)
            table_map = {table: db_table}

    # Priority 3: source_table is the primary table — just strip the prefix.
    elif source_table and source_table == table and field.startswith(source_table + '.'):
        field = field[len(source_table) + 1:]
        db_table = _make_table(table, database, dialect)
        table_map = {table: db_table}
        logger.info(
            "%s: stripped primary table prefix, using '%s' from '%s'",
            log_context, field, table,
        )

    else:
        db_table = _make_table(table, database, dialect)
        table_map = {table: db_table}

    # JOIN queries: expand table_map so virtual column expressions can resolve
    # table-qualified refs (e.g. drivers.givenName -> drivers.givenName).
    if virtual_columns and has_joined_tables:
        table_map = _expand_table_map(table_map, known_tables, database, dialect)

    vc_builder = None
    if virtual_columns:
        column_types = None
        if db_type in _TYPED_VC_ENGINES:
            column_types = type_provider.get_types(None, resolved_table_name)
        vc_builder = VirtualColumnExpressionBuilder(
            table_map=table_map,
            default_table=db_table,
            db_type=db_type,
            column_types=column_types,
            source_database=database,
            source_table=resolved_table_name,
        )
        for vc in virtual_columns:
            try:
                vc_builder.register_virtual_column(vc)
            except Exception as e:
                logger.error("Failed to register virtual column '%s': %s", vc.name, e)
                raise QueryExecutionError(f"Invalid virtual column '{vc.name}': {e}")

    # A virtual column may reference a non-primary joined table — read that table directly.
    if vc_builder and vc_builder.is_virtual_column(field):
        inferred_table = _infer_single_source_table(
            vc_builder.get_source_fields(field), known_tables, table
        )
        if inferred_table and inferred_table != resolved_table_name:
            resolved_table_name = inferred_table
            resolved_from_join = True
            db_table = _make_table(inferred_table, database, dialect)
            logger.info(
                "%s: virtual column '%s' resolved to source table '%s'",
                log_context, field, inferred_table,
            )

    return ResolvedColumnSource(
        field=field,
        db_table=db_table,
        table_map=table_map,
        resolved_table_name=resolved_table_name,
        known_tables=known_tables,
        resolved_from_join=resolved_from_join,
        field_prefix_is_column_name=field_prefix_is_column_name,
        vc_builder=vc_builder,
    )


def build_column_expression(
    resolved: ResolvedColumnSource,
    *,
    dialect,
    database: Optional[str],
    type_provider: SchemaTypeProvider,
    datetime_part: Optional[str] = None,
    datetime_mode: Optional[str] = None,
):
    """PyPika term for the resolved column, including virtual/datetime handling."""
    if resolved.vc_builder and resolved.vc_builder.is_virtual_column(resolved.field):
        return resolved.vc_builder.get_virtual_column_term(resolved.field)

    # Mode-only, matching FieldTermResolver.apply_datetime: "Full DateTime" has a
    # mode but no part, and still needs the parse below to reach the client as a
    # real timestamp rather than the raw source string.
    if semantics.applies_datetime(datetime_mode):
        # Columns overridden from String to DateTime must be parsed before any
        # datetime function is applied, else the engine raises an illegal type.
        source_type = type_provider.source_type(
            resolved.field, database, resolved.resolved_table_name
        )
        return DateTimeService.get_datetime_part_expression(
            resolved.db_table[resolved.field],
            datetime_part,
            datetime_mode,
            dialect,
            source_type=source_type,
        )

    return resolved.db_table[resolved.field]


def _expand_table_map(
    table_map: Dict[str, Table],
    known_tables: Set[str],
    database: Optional[str],
    dialect,
) -> Dict[str, Table]:
    """Include all joined tables so virtual column names can be resolved."""
    expanded = dict(table_map)
    for tname in known_tables:
        if tname not in expanded:
            expanded[tname] = _make_table(tname, database, dialect)
    return expanded


def _infer_single_source_table(
    source_fields: List[str],
    known_tables: Set[str],
    default_table: str,
) -> Optional[str]:
    """When all source fields belong to one table, return that table name."""
    tables: Set[str] = set()
    for field_name in source_fields:
        if '.' in field_name:
            prefix = field_name.split('.', 1)[0]
            if prefix in known_tables:
                tables.add(prefix)
                continue
        tables.add(default_table)
    return next(iter(tables)) if len(tables) == 1 else None
