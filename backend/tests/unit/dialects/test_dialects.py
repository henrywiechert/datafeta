# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for SQL dialect implementations."""
from typing import get_args

import pytest

from backend.dialects import SqlDialect, ClickHouseDialect, DuckDbDialect, get_dialect
from backend.dialects.aggregations import COUNT_STAR, AggregateSpec, FiniteGuard
from backend.models.query import Measure


class TestClickHouseDialect:
    """Tests for ClickHouseDialect."""

    @pytest.fixture
    def dialect(self) -> ClickHouseDialect:
        return ClickHouseDialect()

    def test_name(self, dialect: ClickHouseDialect):
        assert dialect.name == 'clickhouse'

    def test_quote_char(self, dialect: ClickHouseDialect):
        assert dialect.quote_char == '`'

    def test_supports_schema_prefix(self, dialect: ClickHouseDialect):
        assert dialect.supports_schema_prefix is True

    def test_requires_database(self, dialect: ClickHouseDialect):
        assert dialect.requires_database is True

    def test_random_func_name(self, dialect: ClickHouseDialect):
        assert dialect.random_func_name() == 'rand'

    def test_to_string_expr(self, dialect: ClickHouseDialect):
        assert dialect.to_string_expr('column') == 'toString(column)'

    def test_first_value_agg_name(self, dialect: ClickHouseDialect):
        assert dialect.first_value_agg_name() == 'any'

    def test_count_star_spec_takes_no_argument(self, dialect: ClickHouseDialect):
        # ClickHouse counts rows with count(), not COUNT(*).
        spec = dialect.aggregate_spec(COUNT_STAR)
        assert (spec.function, spec.star, spec.star_arg) == ('count', True, False)

    def test_count_distinct_spec_is_exact(self, dialect: ClickHouseDialect):
        # uniq() is approximate; a distinct count that drifts between engines
        # would be worse than a slower exact one.
        spec = dialect.aggregate_spec('count_distinct')
        assert (spec.function, spec.distinct) == ('COUNT', True)

    def test_arg_aggregation_specs(self, dialect: ClickHouseDialect):
        assert dialect.aggregate_spec('arg_max') == AggregateSpec('argMax', order_arg=True)
        assert dialect.aggregate_spec('arg_min') == AggregateSpec('argMin', order_arg=True)

    def test_to_epoch_expr(self, dialect: ClickHouseDialect):
        assert dialect.to_epoch_expr('ts') == 'toUnixTimestamp(ts)'

    def test_cast_null_with_type_hint(self, dialect: ClickHouseDialect):
        result = dialect.cast_null_expr('col', type_hint='number')
        assert result == 'CAST(NULL AS Nullable(Float64)) AS `col`'

    def test_cast_null_for_measure(self, dialect: ClickHouseDialect):
        result = dialect.cast_null_expr('amount', is_measure=True)
        assert result == 'CAST(NULL AS Nullable(Float64)) AS `amount`'

    def test_cast_null_with_column_type(self, dialect: ClickHouseDialect):
        result = dialect.cast_null_expr('name', column_type='Nullable(String)')
        assert result == 'CAST(NULL AS Nullable(String)) AS `name`'

    def test_cast_null_default(self, dialect: ClickHouseDialect):
        result = dialect.cast_null_expr('field')
        assert result == 'CAST(NULL AS Nullable(String)) AS `field`'

    def test_sum_and_avg_guard_against_nan(self, dialect: ClickHouseDialect):
        # ClickHouse propagates NaN through aggregates, so one bad row would
        # otherwise turn a whole group into NaN.
        assert dialect.aggregate_spec('sum') == AggregateSpec(
            'sumIf', finite_guard=FiniteGuard.IF_ARGUMENT
        )
        assert dialect.aggregate_spec('avg') == AggregateSpec(
            'avgIf', finite_guard=FiniteGuard.IF_ARGUMENT
        )

    def test_wrap_datetime_comparison_with_datetime_string(self, dialect: ClickHouseDialect):
        result = dialect.wrap_datetime_comparison('2024-01-15 10:30:00.123', is_datetime_string=True)
        assert result == "parseDateTime64BestEffort('2024-01-15 10:30:00.123', 3)"

    def test_wrap_datetime_comparison_with_non_datetime(self, dialect: ClickHouseDialect):
        result = dialect.wrap_datetime_comparison('hello', is_datetime_string=False)
        assert result == 'hello'

    def test_table_ref_with_database(self, dialect: ClickHouseDialect):
        result = dialect.table_ref('events', database='analytics')
        assert result == '`analytics`.`events`'

    def test_table_ref_without_database(self, dialect: ClickHouseDialect):
        result = dialect.table_ref('events')
        assert result == '`events`'


class TestDuckDbDialect:
    """Tests for DuckDbDialect."""

    @pytest.fixture
    def dialect(self) -> DuckDbDialect:
        return DuckDbDialect()

    def test_name(self, dialect: DuckDbDialect):
        assert dialect.name == 'duckdb'

    def test_quote_char(self, dialect: DuckDbDialect):
        assert dialect.quote_char == '"'

    def test_supports_schema_prefix(self, dialect: DuckDbDialect):
        assert dialect.supports_schema_prefix is False

    def test_requires_database(self, dialect: DuckDbDialect):
        assert dialect.requires_database is False

    def test_random_func_name(self, dialect: DuckDbDialect):
        assert dialect.random_func_name() == 'random'

    def test_to_string_expr(self, dialect: DuckDbDialect):
        assert dialect.to_string_expr('column') == 'CAST(column AS VARCHAR)'

    def test_first_value_agg_name(self, dialect: DuckDbDialect):
        assert dialect.first_value_agg_name() == 'first'

    def test_count_star_spec_passes_star(self, dialect: DuckDbDialect):
        spec = dialect.aggregate_spec(COUNT_STAR)
        assert (spec.function, spec.star, spec.star_arg) == ('COUNT', True, True)

    def test_count_distinct_spec(self, dialect: DuckDbDialect):
        spec = dialect.aggregate_spec('count_distinct')
        assert (spec.function, spec.distinct) == ('COUNT', True)

    def test_arg_aggregation_specs(self, dialect: DuckDbDialect):
        assert dialect.aggregate_spec('arg_max') == AggregateSpec('arg_max', order_arg=True)
        assert dialect.aggregate_spec('arg_min') == AggregateSpec('arg_min', order_arg=True)

    def test_to_epoch_expr(self, dialect: DuckDbDialect):
        assert dialect.to_epoch_expr('ts') == 'epoch(ts)'

    def test_cast_null_ignores_type_hints(self, dialect: DuckDbDialect):
        result = dialect.cast_null_expr('col', type_hint='number')
        assert result == 'NULL AS "col"'

    def test_cast_null_for_measure(self, dialect: DuckDbDialect):
        result = dialect.cast_null_expr('amount', is_measure=True)
        assert result == 'NULL AS "amount"'

    def test_sum_and_avg_are_guarded_and_coalesced(self, dialect: DuckDbDialect):
        # DuckDB does propagate NaN through SUM/AVG, so the FILTER guard is not
        # optional; the COALESCE keeps an empty group reading as 0.
        assert dialect.aggregate_spec('sum') == AggregateSpec(
            'SUM', coalesce_zero=True, finite_guard=FiniteGuard.FILTER_CLAUSE
        )
        assert dialect.aggregate_spec('avg') == AggregateSpec(
            'AVG', coalesce_zero=True, finite_guard=FiniteGuard.FILTER_CLAUSE
        )

    def test_table_ref_ignores_database(self, dialect: DuckDbDialect):
        result = dialect.table_ref('events', database='analytics')
        assert result == '"events"'


class TestDialectInterface:
    """Tests to verify both dialects implement the full interface."""

    @pytest.fixture(params=[ClickHouseDialect, DuckDbDialect])
    def dialect(self, request) -> SqlDialect:
        return request.param()

    def test_is_sql_dialect(self, dialect: SqlDialect):
        assert isinstance(dialect, SqlDialect)

    def test_has_name(self, dialect: SqlDialect):
        assert isinstance(dialect.name, str)
        assert len(dialect.name) > 0

    def test_has_quote_char(self, dialect: SqlDialect):
        assert isinstance(dialect.quote_char, str)
        assert len(dialect.quote_char) == 1

    def test_has_schema_prefix_flag(self, dialect: SqlDialect):
        assert isinstance(dialect.supports_schema_prefix, bool)

    def test_has_requires_database_flag(self, dialect: SqlDialect):
        assert isinstance(dialect.requires_database, bool)

    def test_random_func_returns_string(self, dialect: SqlDialect):
        assert isinstance(dialect.random_func_name(), str)

    def test_to_string_returns_string(self, dialect: SqlDialect):
        assert isinstance(dialect.to_string_expr('x'), str)

    def test_first_value_agg_returns_string(self, dialect: SqlDialect):
        assert isinstance(dialect.first_value_agg_name(), str)

    def test_every_declared_aggregation_has_a_spec(self, dialect: SqlDialect):
        """A dialect must render every aggregation the API accepts.

        Guards the seam that adding a value to Measure.aggregation without a
        matching spec would otherwise only surface at query time, on one engine.
        """
        declared = set(get_args(Measure.model_fields['aggregation'].annotation))
        assert declared <= set(dialect.aggregate_specs())

    def test_count_star_spec_is_present(self, dialect: SqlDialect):
        assert dialect.aggregate_spec(COUNT_STAR) is not None

    def test_unknown_aggregation_has_no_spec(self, dialect: SqlDialect):
        assert dialect.aggregate_spec('no_such_aggregation') is None

    def test_to_epoch_returns_string(self, dialect: SqlDialect):
        assert isinstance(dialect.to_epoch_expr('x'), str)

    def test_cast_null_returns_string(self, dialect: SqlDialect):
        assert isinstance(dialect.cast_null_expr('x'), str)


    def test_table_ref_returns_string(self, dialect: SqlDialect):
        assert isinstance(dialect.table_ref('t'), str)
        assert isinstance(dialect.table_ref('t', database='d'), str)


class TestGetDialectByConnectorType:
    """get_dialect maps connector type strings onto dialect instances."""

    @pytest.mark.parametrize("db_type", ["csv", "file", "sqlite", "kaggle", "hive_parquet", "duckdb"])
    def test_duckdb_backed_connectors_resolve_to_duckdb_dialect(self, db_type):
        assert get_dialect(db_type).name == "duckdb"

    def test_clickhouse_resolves_to_clickhouse_dialect(self):
        assert get_dialect("clickhouse").name == "clickhouse"

    def test_unknown_type_raises(self):
        with pytest.raises(ValueError, match="Unknown db_type"):
            get_dialect("postgres")
