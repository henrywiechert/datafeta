# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Tests for scoping carried-over filters to a single-table FROM clause."""
from backend.models.query import Filter
from backend.services.query_components.filter_table_scope import (
    references_query_table,
    scope_filters_to_table,
)

KNOWN_TABLES = {"races", "results"}


def _filter(field: str) -> Filter:
    return Filter(field=field, operator="in", value=["x"])


class TestReferencesQueryTable:
    def test_unprefixed_column_is_always_resolvable(self):
        assert references_query_table("status", KNOWN_TABLES, "races") is True

    def test_resolved_table_prefix_is_resolvable(self):
        assert references_query_table("races.status", KNOWN_TABLES, "races") is True

    def test_other_known_table_prefix_is_not_resolvable(self):
        assert references_query_table("results.points", KNOWN_TABLES, "races") is False

    def test_unknown_prefix_is_a_literal_column_name(self):
        # ClickHouse allows dots in column names.
        assert references_query_table("weird.name", KNOWN_TABLES, "races") is True

    def test_virtual_column_is_resolvable_regardless_of_prefix(self):
        assert references_query_table(
            "results.calc", KNOWN_TABLES, "races",
            is_virtual_column={"results.calc"}.__contains__,
        ) is True


class TestScopeFiltersToTable:
    def test_drops_filters_on_other_known_tables(self):
        scoped = scope_filters_to_table(
            [_filter("results.points"), _filter("races.year")],
            KNOWN_TABLES,
            "races",
        )
        assert [f.field for f in scoped] == ["year"]

    def test_strips_the_resolved_table_prefix(self):
        scoped = scope_filters_to_table([_filter("races.year")], KNOWN_TABLES, "races")
        assert scoped[0].field == "year"

    def test_leaves_unprefixed_and_literal_dotted_names_alone(self):
        scoped = scope_filters_to_table(
            [_filter("status"), _filter("weird.name")],
            KNOWN_TABLES,
            "races",
        )
        assert [f.field for f in scoped] == ["status", "weird.name"]

    def test_does_not_mutate_the_input_filters(self):
        original = _filter("races.year")
        scope_filters_to_table([original], KNOWN_TABLES, "races")
        assert original.field == "races.year"

    def test_empty_and_none_inputs(self):
        assert scope_filters_to_table(None, KNOWN_TABLES, "races") == []
        assert scope_filters_to_table([], KNOWN_TABLES, "races") == []
