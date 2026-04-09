"""Unit tests for SQL dialect implementations."""
import pytest

from backend.dialects import SqlDialect, ClickHouseDialect, DuckDbDialect


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

    def test_count_star_expr(self, dialect: ClickHouseDialect):
        assert dialect.count_star_expr() == 'count()'

    def test_count_distinct_expr(self, dialect: ClickHouseDialect):
        assert dialect.count_distinct_expr('field') == 'uniq(field)'

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

    def test_needs_nan_safe_aggregation(self, dialect: ClickHouseDialect):
        assert dialect.needs_nan_safe_aggregation() is True

    def test_nan_safe_sum_expr(self, dialect: ClickHouseDialect):
        result = dialect.nan_safe_sum_expr('value')
        assert result == 'sumIf(value, isFinite(value))'

    def test_nan_safe_avg_expr(self, dialect: ClickHouseDialect):
        result = dialect.nan_safe_avg_expr('value')
        assert result == 'avgIf(value, isFinite(value))'

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

    def test_count_star_expr(self, dialect: DuckDbDialect):
        assert dialect.count_star_expr() == 'COUNT(*)'

    def test_count_distinct_expr(self, dialect: DuckDbDialect):
        assert dialect.count_distinct_expr('field') == 'COUNT(DISTINCT field)'

    def test_to_epoch_expr(self, dialect: DuckDbDialect):
        assert dialect.to_epoch_expr('ts') == 'epoch(ts)'

    def test_cast_null_ignores_type_hints(self, dialect: DuckDbDialect):
        result = dialect.cast_null_expr('col', type_hint='number')
        assert result == 'NULL AS "col"'

    def test_cast_null_for_measure(self, dialect: DuckDbDialect):
        result = dialect.cast_null_expr('amount', is_measure=True)
        assert result == 'NULL AS "amount"'

    def test_needs_nan_safe_aggregation(self, dialect: DuckDbDialect):
        assert dialect.needs_nan_safe_aggregation() is False

    def test_nan_safe_sum_expr(self, dialect: DuckDbDialect):
        result = dialect.nan_safe_sum_expr('value')
        assert result == 'COALESCE(SUM(value), 0)'

    def test_nan_safe_avg_expr(self, dialect: DuckDbDialect):
        result = dialect.nan_safe_avg_expr('value')
        assert result == 'COALESCE(AVG(value), 0)'

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

    def test_count_star_returns_string(self, dialect: SqlDialect):
        assert isinstance(dialect.count_star_expr(), str)

    def test_count_distinct_returns_string(self, dialect: SqlDialect):
        assert isinstance(dialect.count_distinct_expr('x'), str)

    def test_to_epoch_returns_string(self, dialect: SqlDialect):
        assert isinstance(dialect.to_epoch_expr('x'), str)

    def test_cast_null_returns_string(self, dialect: SqlDialect):
        assert isinstance(dialect.cast_null_expr('x'), str)

    def test_nan_safe_flag_is_bool(self, dialect: SqlDialect):
        assert isinstance(dialect.needs_nan_safe_aggregation(), bool)

    def test_nan_safe_sum_returns_string(self, dialect: SqlDialect):
        assert isinstance(dialect.nan_safe_sum_expr('x'), str)

    def test_nan_safe_avg_returns_string(self, dialect: SqlDialect):
        assert isinstance(dialect.nan_safe_avg_expr('x'), str)

    def test_table_ref_returns_string(self, dialect: SqlDialect):
        assert isinstance(dialect.table_ref('t'), str)
        assert isinstance(dialect.table_ref('t', database='d'), str)
