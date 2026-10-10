# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for SchemaTypeProvider's JOIN-aware type merging.

Regression coverage for a bug where a JOINed query's column-type lookup only
fetched the primary table's schema, so a field on a joined table (e.g.
"statistics.start_ts") resolved to source_type=None and skipped numeric/string
DateTime conversion -- producing invalid SQL like timezone('UTC', <DOUBLE>).
"""

from typing import Dict, List, Optional

from backend.models.data_source import Column
from backend.models.query import Dimension, QueryDescription
from backend.models.data_source import TableJoinDefinition, VirtualTableDefinition
from backend.services.query_components.schema_type_provider import SchemaTypeProvider


class _FakeConnector:
    """Reports column types per table from a fixed schema map."""

    def __init__(self, schema: Dict[str, Dict[str, str]]):
        self._schema = schema

    def list_columns(self, database: Optional[str] = None, table: Optional[str] = None) -> List[Column]:
        return [
            Column(name=name, data_type=dtype)
            for name, dtype in self._schema.get(table, {}).items()
        ]


def _join_query_desc() -> QueryDescription:
    return QueryDescription(
        target_table="statistics_meta",
        dimensions=[
            Dimension(field="statistics.start_ts", flavour="continuous", date_part="month", date_mode="timeline"),
        ],
        virtual_table=VirtualTableDefinition(
            primary_table="statistics_meta",
            mode="join",
            joined_tables=[
                TableJoinDefinition(
                    table_name="statistics",
                    join_type="LEFT",
                    on_conditions=["statistics_meta.id = statistics.metadata_id"],
                )
            ],
        ),
    )


class TestGetMergedTypes:
    def test_merges_joined_table_types(self):
        connector = _FakeConnector({
            "statistics_meta": {"id": "BIGINT", "statistic_id": "VARCHAR"},
            "statistics": {"start_ts": "DOUBLE", "sum": "DOUBLE"},
        })
        provider = SchemaTypeProvider(connector)
        query_desc = _join_query_desc()

        types = provider.get_merged_types(None, "statistics_meta", query_desc)

        assert types["statistics.start_ts"] == "DOUBLE"
        assert types["start_ts"] == "DOUBLE"
        assert types["statistics_meta.id"] == "BIGINT"

    def test_source_type_for_query_resolves_joined_column(self):
        connector = _FakeConnector({
            "statistics_meta": {"id": "BIGINT"},
            "statistics": {"start_ts": "DOUBLE"},
        })
        provider = SchemaTypeProvider(connector)
        query_desc = _join_query_desc()

        assert provider.source_type_for_query("statistics.start_ts", query_desc) == "DOUBLE"

    def test_no_virtual_table_returns_only_primary_types(self):
        connector = _FakeConnector({"events": {"ts": "VARCHAR"}})
        provider = SchemaTypeProvider(connector)
        query_desc = QueryDescription(target_table="events")

        types = provider.get_merged_types(None, "events", query_desc)

        assert types == {"ts": "VARCHAR", "events.ts": "VARCHAR"}
