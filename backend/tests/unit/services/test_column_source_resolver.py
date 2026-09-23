# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for build_column_expression's datetime handling."""

from typing import Optional

from pypika import Table

from backend.services.query_components.column_source_resolver import (
    ResolvedColumnSource,
    build_column_expression,
)


class _StubTypeProvider:
    """Reports one physical type for every column."""

    def __init__(self, source_type: Optional[str]):
        self._source_type = source_type

    def source_type(self, field, database, table) -> Optional[str]:
        return self._source_type


def _resolved(field: str = "ts") -> ResolvedColumnSource:
    table = Table("events")
    return ResolvedColumnSource(
        field=field,
        db_table=table,
        table_map={"events": table},
        resolved_table_name="events",
    )


def _sql(source_type, date_part, date_mode, dialect="duckdb") -> str:
    expr = build_column_expression(
        _resolved(),
        dialect=dialect,
        database=None,
        type_provider=_StubTypeProvider(source_type),
        datetime_part=date_part,
        datetime_mode=date_mode,
    )
    return expr.get_sql(quote_char='"')


class TestBuildColumnExpressionDateTime:
    def test_full_datetime_parses_a_string_column(self):
        """Mode-only gate: "Full DateTime" has a mode but no part, and must still
        parse a text-stored column. Gating on part AND mode gave distinct counts
        and field profiles a lexicographic view of the raw source strings."""
        sql = _sql("VARCHAR", None, "timeline")

        assert "try_strptime" in sql
        assert "EXTRACT" not in sql
        assert "date_trunc" not in sql

    def test_full_datetime_on_a_native_timestamp_is_passthrough(self):
        assert _sql("TIMESTAMP", None, "timeline") == '"ts"'

    def test_explicit_part_still_truncates(self):
        sql = _sql("TIMESTAMP", "hour", "timeline")

        assert "date_trunc" in sql

    def test_no_mode_leaves_the_column_untouched(self):
        """A non-datetime column must not be wrapped, whatever its physical type."""
        assert _sql("VARCHAR", None, None) == '"ts"'
