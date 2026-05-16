# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for CDF (cumulative distribution function) query generation.

Tests verify quantile-breakpoint SQL patterns for both DuckDB and ClickHouse.
"""

import pytest

from backend.models.query import (
    CdfField,
    Dimension,
    Filter,
    QueryDescription,
)
from backend.models.data_source import UnionTableDefinition, VirtualTableDefinition
from backend.services.query_service import QueryService
from backend.services.query_components.cdf_query_builder import (
    build_cdf_sql,
    _generate_breakpoints,
    _format_float_list,
    DEFAULT_NUM_BREAKPOINTS,
)


@pytest.fixture
def query_service() -> QueryService:
    return QueryService()


def _cdf_desc(**overrides) -> QueryDescription:
    base = {
        "target_table": "measurements",
        "query_mode": "cdf",
        "cdf_fields": [CdfField(field="latency", alias="latency__cdf")],
        "dimensions": [],
        "measures": [],
        "filters": [],
        "orderBy": [],
    }
    base.update(overrides)
    return QueryDescription(**base)


# ── Helpers ─────────────────────────────────────────────────────────────────


class TestHelpers:
    def test_generate_breakpoints_default(self):
        bp = _generate_breakpoints()
        assert len(bp) == DEFAULT_NUM_BREAKPOINTS
        assert bp[0] == 0.0
        assert bp[-1] == 1.0
        assert all(0.0 <= v <= 1.0 for v in bp)

    def test_generate_breakpoints_custom(self):
        bp = _generate_breakpoints(5)
        assert len(bp) == 5
        assert bp == [0.0, 0.25, 0.5, 0.75, 1.0]

    def test_generate_breakpoints_minimum(self):
        bp = _generate_breakpoints(1)
        assert bp == [0.0, 1.0]

    def test_format_float_list(self):
        result = _format_float_list([0.0, 0.5, 1.0])
        assert result == ["0.0", "0.5", "1.0"]

    def test_format_float_list_fractional(self):
        result = _format_float_list([0.005, 0.123])
        assert result == ["0.005", "0.123"]


# ── build_cdf_sql: DuckDB ──────────────────────────────────────────────────


class TestBuildCdfSqlDuckDb:
    def test_single_field(self):
        desc = _cdf_desc()
        sql = build_cdf_sql(desc, "duckdb", '"', num_breakpoints=5)

        assert "quantile_cont" in sql
        assert "unnest" in sql
        assert '"latency"' in sql
        assert '"latency__cdf"' in sql
        assert 'FROM "measurements"' in sql
        assert 'ORDER BY "latency"' in sql

    def test_uses_unnest_with_breakpoints_array(self):
        desc = _cdf_desc()
        sql = build_cdf_sql(desc, "duckdb", '"', num_breakpoints=3)

        assert "unnest(quantile_cont(" in sql
        assert "[0.0, 0.5, 1.0]" in sql
        assert "unnest([0.0, 0.5, 1.0])" in sql

    def test_partition_uses_group_by(self):
        desc = _cdf_desc(cdf_partition_fields=["region"])
        sql = build_cdf_sql(desc, "duckdb", '"', num_breakpoints=3)

        assert 'GROUP BY "region"' in sql
        assert 'ORDER BY "region", "latency"' in sql
        assert sql.startswith('SELECT "region"')
        assert "PARTITION BY" not in sql

    def test_multiple_partition_fields(self):
        desc = _cdf_desc(cdf_partition_fields=["region", "env"])
        sql = build_cdf_sql(desc, "duckdb", '"', num_breakpoints=3)

        assert 'GROUP BY "region", "env"' in sql
        assert 'ORDER BY "region", "env", "latency"' in sql
        assert '"region"' in sql
        assert '"env"' in sql

    def test_multiple_cdf_fields(self):
        desc = _cdf_desc(
            cdf_fields=[
                CdfField(field="latency", alias="latency__cdf"),
                CdfField(field="throughput", alias="throughput__cdf"),
            ]
        )
        sql = build_cdf_sql(desc, "duckdb", '"', num_breakpoints=3)

        assert 'quantile_cont("latency"' in sql
        assert '"latency__cdf"' in sql
        assert 'quantile_cont("throughput"' in sql
        assert '"throughput__cdf"' in sql
        assert 'ORDER BY "latency", "throughput"' in sql

    def test_filter_fragment_injected(self):
        desc = _cdf_desc()
        sql = build_cdf_sql(
            desc, "duckdb", '"',
            filter_sql_fragment='WHERE "status"=\'ok\'',
            num_breakpoints=3,
        )

        assert 'WHERE "status"=\'ok\'' in sql

    def test_custom_from_clause(self):
        desc = _cdf_desc()
        sql = build_cdf_sql(
            desc, "duckdb", '"',
            from_clause='FROM "mydb"."measurements"',
            num_breakpoints=3,
        )

        assert 'FROM "mydb"."measurements"' in sql

    def test_no_limit_or_random(self):
        """Quantile approach produces fixed output size; no LIMIT needed."""
        desc = _cdf_desc()
        sql = build_cdf_sql(desc, "duckdb", '"', num_breakpoints=5)

        assert "LIMIT" not in sql
        assert "random()" not in sql


# ── build_cdf_sql: ClickHouse ──────────────────────────────────────────────


class TestBuildCdfSqlClickHouse:
    def test_single_field(self):
        desc = _cdf_desc()
        sql = build_cdf_sql(desc, "clickhouse", "`", num_breakpoints=5)

        assert "quantilesExactInclusive" in sql
        assert "ARRAY JOIN" in sql
        assert "`latency`" in sql
        assert "`latency__cdf`" in sql
        assert "FROM `measurements`" in sql
        assert "ORDER BY `latency`" in sql

    def test_uses_subselect_with_array_join(self):
        desc = _cdf_desc()
        sql = build_cdf_sql(desc, "clickhouse", "`", num_breakpoints=3)

        assert "FROM (SELECT" in sql
        assert "ARRAY JOIN" in sql
        assert "quantilesExactInclusive(0.0, 0.5, 1.0)" in sql
        assert "[0.0, 0.5, 1.0]" in sql

    def test_partition_uses_group_by(self):
        desc = _cdf_desc(cdf_partition_fields=["region"])
        sql = build_cdf_sql(desc, "clickhouse", "`", num_breakpoints=3)

        assert "GROUP BY `region`" in sql
        assert "ORDER BY `region`, `latency`" in sql
        assert "`region`" in sql
        assert "PARTITION BY" not in sql

    def test_multiple_partition_fields(self):
        desc = _cdf_desc(cdf_partition_fields=["region", "env"])
        sql = build_cdf_sql(desc, "clickhouse", "`", num_breakpoints=3)

        assert "GROUP BY `region`, `env`" in sql
        assert "ORDER BY `region`, `env`, `latency`" in sql
        assert "`region`" in sql
        assert "`env`" in sql

    def test_multiple_cdf_fields(self):
        desc = _cdf_desc(
            cdf_fields=[
                CdfField(field="latency", alias="latency__cdf"),
                CdfField(field="throughput", alias="throughput__cdf"),
            ]
        )
        sql = build_cdf_sql(desc, "clickhouse", "`", num_breakpoints=3)

        assert "quantilesExactInclusive" in sql
        assert "`latency`" in sql
        assert "`latency__cdf`" in sql
        assert "`throughput`" in sql
        assert "`throughput__cdf`" in sql
        assert "ORDER BY `latency`, `throughput`" in sql

    def test_filter_fragment_injected(self):
        desc = _cdf_desc()
        sql = build_cdf_sql(
            desc, "clickhouse", "`",
            filter_sql_fragment="WHERE `status`='ok'",
            num_breakpoints=3,
        )

        assert "WHERE `status`='ok'" in sql

    def test_custom_from_clause(self):
        desc = _cdf_desc()
        sql = build_cdf_sql(
            desc, "clickhouse", "`",
            from_clause="FROM `mydb`.`measurements`",
            num_breakpoints=3,
        )

        assert "FROM `mydb`.`measurements`" in sql

    def test_no_limit_or_rand(self):
        """Quantile approach produces fixed output size; no LIMIT needed."""
        desc = _cdf_desc()
        sql = build_cdf_sql(desc, "clickhouse", "`", num_breakpoints=5)

        assert "LIMIT" not in sql
        assert "rand()" not in sql


# ── Common / edge cases ────────────────────────────────────────────────────


class TestBuildCdfSqlCommon:
    def test_empty_cdf_fields_raises(self):
        desc = _cdf_desc(cdf_fields=[])
        with pytest.raises(ValueError, match="at least one cdf_field"):
            build_cdf_sql(desc, "duckdb", '"')

    def test_default_breakpoints_count(self):
        desc = _cdf_desc()
        sql = build_cdf_sql(desc, "duckdb", '"')
        assert "0.0," in sql
        assert "1.0]" in sql

    def test_duplicate_fields_deduplicated_duckdb(self):
        """Same column appearing twice must not produce duplicate aliases."""
        desc = _cdf_desc(
            cdf_fields=[
                CdfField(field="latency", alias="latency__cdf"),
                CdfField(field="latency", alias="latency__cdf"),
            ]
        )
        sql = build_cdf_sql(desc, "duckdb", '"', num_breakpoints=3)

        assert sql.count('AS "latency"') == 1
        assert sql.count('AS "latency__cdf"') == 1

    def test_duplicate_fields_deduplicated_clickhouse(self):
        """Same column appearing twice must not produce duplicate aliases."""
        desc = _cdf_desc(
            cdf_fields=[
                CdfField(field="latency", alias="latency__cdf"),
                CdfField(field="latency", alias="latency__cdf"),
            ]
        )
        sql = build_cdf_sql(desc, "clickhouse", "`", num_breakpoints=3)

        assert sql.count("AS `latency`") == 1
        assert sql.count("AS `latency__cdf`") == 1


# ── QueryService integration ────────────────────────────────────────────────


class TestQueryServiceCdf:
    def test_translate_cdf_duckdb(self, query_service: QueryService):
        desc = _cdf_desc()
        sql, metadata = query_service.translate_to_sql(
            query_desc=desc,
            table_name="measurements",
            db_type="duckdb",
            with_optimization=False,
        )

        assert "quantile_cont" in sql
        assert "unnest" in sql
        assert '"latency"' in sql
        assert '"latency__cdf"' in sql
        assert metadata["optimizations"] == []

    def test_translate_cdf_clickhouse(self, query_service: QueryService):
        desc = _cdf_desc()
        sql, metadata = query_service.translate_to_sql(
            query_desc=desc,
            table_name="measurements",
            db_type="clickhouse",
            with_optimization=False,
        )

        assert "quantilesExactInclusive" in sql
        assert "ARRAY JOIN" in sql
        assert "`latency`" in sql
        assert "`latency__cdf`" in sql

    def test_translate_cdf_with_partition(self, query_service: QueryService):
        desc = _cdf_desc(cdf_partition_fields=["env"])
        sql, _ = query_service.translate_to_sql(
            query_desc=desc,
            table_name="measurements",
            db_type="duckdb",
            with_optimization=False,
        )

        assert "GROUP BY" in sql
        assert '"env"' in sql

    def test_translate_cdf_with_filter(self, query_service: QueryService):
        desc = _cdf_desc(
            filters=[Filter(field="status", operator="=", value="ok")],
        )
        sql, _ = query_service.translate_to_sql(
            query_desc=desc,
            table_name="measurements",
            db_type="duckdb",
            with_optimization=False,
        )

        assert "WHERE" in sql
        assert "quantile_cont" in sql

    def test_translate_cdf_with_database(self, query_service: QueryService):
        desc = _cdf_desc(target_database="analytics")
        sql, _ = query_service.translate_to_sql(
            query_desc=desc,
            table_name="measurements",
            db_type="clickhouse",
            with_optimization=False,
        )

        assert "`analytics`" in sql
        assert "`measurements`" in sql

    def test_standard_query_mode_unchanged(self, query_service: QueryService):
        """query_mode='standard' (or None) must not trigger CDF path."""
        desc = QueryDescription(
            target_table="sales",
            dimensions=[Dimension(field="category", flavour="discrete")],
            measures=[],
            query_mode="standard",
        )

        sql, _ = query_service.translate_to_sql(
            query_desc=desc,
            table_name="sales",
            db_type="duckdb",
            with_optimization=False,
        )

        assert "quantile_cont" not in sql
        assert "quantilesExactInclusive" not in sql
        assert "cume_dist()" not in sql


# ── CDF + UNION ALL ────────────────────────────────────────────────────────


def _cdf_union_desc(**overrides) -> QueryDescription:
    """Helper that creates a CDF query with a UNION virtual table."""
    base = {
        "target_table": "measurements",
        "target_database": "db_alpha",
        "query_mode": "cdf",
        "cdf_fields": [CdfField(field="latency", alias="latency__cdf")],
        "dimensions": [],
        "measures": [],
        "filters": [],
        "orderBy": [],
        "virtual_table": VirtualTableDefinition(
            primary_table="measurements",
            mode="union",
            union_tables=[
                UnionTableDefinition(table_name="measurements", database="db_beta"),
            ],
        ),
    }
    base.update(overrides)
    return QueryDescription(**base)


class TestCdfUnionClickHouse:
    """CDF queries over UNION ALL tables (ClickHouse dialect)."""

    def test_basic_union_produces_valid_select(self, query_service: QueryService):
        """Regression: CDF + UNION must not produce 'SELECT,' (empty select list)."""
        desc = _cdf_union_desc()
        sql, _ = query_service.translate_to_sql(
            query_desc=desc,
            table_name="measurements",
            db_type="clickhouse",
            with_optimization=False,
        )

        assert "SELECT," not in sql, f"Empty SELECT list detected in: {sql[:300]}"
        assert "UNION ALL" in sql
        assert "quantilesExactInclusive" in sql
        assert "`_source_database`" in sql
        assert "`_source_table`" in sql

    def test_each_sub_query_has_correct_from(self, query_service: QueryService):
        desc = _cdf_union_desc()
        sql, _ = query_service.translate_to_sql(
            query_desc=desc,
            table_name="measurements",
            db_type="clickhouse",
            with_optimization=False,
        )

        assert "`db_alpha`.`measurements`" in sql
        assert "`db_beta`.`measurements`" in sql

    def test_source_tracking_columns_injected(self, query_service: QueryService):
        desc = _cdf_union_desc()
        sql, _ = query_service.translate_to_sql(
            query_desc=desc,
            table_name="measurements",
            db_type="clickhouse",
            with_optimization=False,
        )

        assert "'db_alpha' AS `_source_database`" in sql
        assert "'db_beta' AS `_source_database`" in sql
        assert "'measurements' AS `_source_table`" in sql

    def test_partition_fields_preserved(self, query_service: QueryService):
        desc = _cdf_union_desc(cdf_partition_fields=["region"])
        sql, _ = query_service.translate_to_sql(
            query_desc=desc,
            table_name="measurements",
            db_type="clickhouse",
            with_optimization=False,
        )

        assert "GROUP BY `region`" in sql
        assert "`region`" in sql

    def test_source_filters_applied_in_outer_query(self, query_service: QueryService):
        desc = _cdf_union_desc(
            filters=[Filter(field="_source_database", operator="in", value=["db_alpha"])],
        )
        sql, _ = query_service.translate_to_sql(
            query_desc=desc,
            table_name="measurements",
            db_type="clickhouse",
            with_optimization=False,
        )

        assert "WHERE" in sql
        assert "`_source_database` IN" in sql

    def test_source_partition_field_stripped_from_sub_queries(self, query_service: QueryService):
        """_source_database as partition field must not appear in per-table GROUP BY."""
        desc = _cdf_union_desc(cdf_partition_fields=["_source_database"])
        sql, _ = query_service.translate_to_sql(
            query_desc=desc,
            table_name="measurements",
            db_type="clickhouse",
            with_optimization=False,
        )

        assert "SELECT," not in sql
        assert "GROUP BY `_source_database`" not in sql
        assert "UNION ALL" in sql
        assert "'db_alpha' AS `_source_database`" in sql

    def test_mixed_real_and_source_partition_fields(self, query_service: QueryService):
        """Real partition fields kept; synthetic source fields stripped."""
        desc = _cdf_union_desc(cdf_partition_fields=["region", "_source_database"])
        sql, _ = query_service.translate_to_sql(
            query_desc=desc,
            table_name="measurements",
            db_type="clickhouse",
            with_optimization=False,
        )

        assert "GROUP BY `region`" in sql
        assert "GROUP BY `_source_database`" not in sql


class TestCdfUnionDuckDb:
    """CDF queries over UNION ALL tables (DuckDB dialect)."""

    def test_basic_union_produces_valid_select(self, query_service: QueryService):
        desc = _cdf_union_desc()
        sql, _ = query_service.translate_to_sql(
            query_desc=desc,
            table_name="measurements",
            db_type="duckdb",
            with_optimization=False,
        )

        assert "SELECT," not in sql
        assert "UNION ALL" in sql
        assert "quantile_cont" in sql
        assert '"_source_database"' in sql
        assert '"_source_table"' in sql
