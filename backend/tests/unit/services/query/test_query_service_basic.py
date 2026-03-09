"""Unit tests covering the refactored QueryService helpers."""

import pytest

from backend.models.data_source import TableJoinDefinition, VirtualTableDefinition
from backend.models.query import Dimension, Filter, Measure, QueryDescription
from backend.services.query_service import QueryService


@pytest.fixture
def query_service() -> QueryService:
    """Provide a fresh QueryService instance for each test."""
    return QueryService()


def _make_base_description(**overrides) -> QueryDescription:
    """Utility to build a minimal QueryDescription for unit tests."""
    base = {
        "target_table": "sales",
        "dimensions": [],
        "measures": [],
        "filters": [],
        "orderBy": [],
    }
    base.update(overrides)
    return QueryDescription(**base)


def test_discrete_dimension_queries_apply_distinct(query_service: QueryService) -> None:
    """DISTINCT should be added for discrete-only queries to deduplicate filter results."""
    description = _make_base_description(
        dimensions=[Dimension(field="category", flavour="discrete")]
    )

    sql, metadata = query_service.translate_to_sql(
        query_desc=description,
        table_name="sales",
        db_type="clickhouse",
        with_optimization=False,
    )

    assert "SELECT DISTINCT" in sql
    assert "`category`" in sql
    assert metadata == {"optimizations": [], "hints_used": None, "override": None}


def test_column_casts_wrap_selected_fields(query_service: QueryService) -> None:
    """Configured column casts should result in CAST() expressions in the SELECT clause."""
    description = _make_base_description(
        dimensions=[Dimension(field="revenue", flavour="continuous")],
        column_casts={"revenue": {"cast_type": "DOUBLE"}},
    )

    sql, _ = query_service.translate_to_sql(
        query_desc=description,
        table_name="sales",
        db_type="clickhouse",
        with_optimization=False,
    )

    assert "CAST(" in sql
    assert "AS DOUBLE" in sql
    assert "`revenue`" in sql  # Alias restored after casting


def test_metadata_structure_present_without_optimizer(query_service: QueryService) -> None:
    """Even without an optimizer, translate_to_sql should emit the extended metadata structure."""
    description = _make_base_description(
        dimensions=[Dimension(field="category", flavour="discrete")],
    )

    _, metadata = query_service.translate_to_sql(
        query_desc=description,
        table_name="sales",
        db_type="duckdb",
        with_optimization=False,
    )

    assert metadata == {"optimizations": [], "hints_used": None, "override": None}


def test_measure_query_groups_by_dimension(query_service: QueryService) -> None:
    """Aggregated queries should include SUM expressions and corresponding GROUP BY clauses.

    For ClickHouse, SUM is rendered as sumIf(field, isFinite(field)) to avoid NaN/Inf
    propagation. For other databases, a standard SUM() is used.
    """
    description = _make_base_description(
        dimensions=[Dimension(field="category", flavour="discrete")],
        measures=[Measure(field="revenue", aggregation="sum", alias="total_revenue")],
    )

    sql_ch, _ = query_service.translate_to_sql(
        query_desc=description,
        table_name="sales",
        db_type="clickhouse",
        with_optimization=False,
    )

    # ClickHouse uses NaN-safe sumIf instead of plain SUM
    assert "sumIf(" in sql_ch
    assert "isFinite(" in sql_ch
    assert "GROUP BY" in sql_ch
    assert "`category`" in sql_ch

    sql_duck, _ = query_service.translate_to_sql(
        query_desc=description,
        table_name="sales",
        db_type="duckdb",
        with_optimization=False,
    )

    assert "SUM(" in sql_duck
    assert "GROUP BY" in sql_duck


def test_filters_render_in_where_clause(query_service: QueryService) -> None:
    """Filter definitions should appear as a WHERE clause in the rendered SQL."""
    description = _make_base_description(
        dimensions=[Dimension(field="category", flavour="discrete")],
        filters=[Filter(field="category", operator="=", value="Books")],
    )

    sql, _ = query_service.translate_to_sql(
        query_desc=description,
        table_name="sales",
        db_type="clickhouse",
        with_optimization=False,
    )

    assert "WHERE" in sql
    # QueryService currently renders equality without a space before the value
    assert "`category`='Books'" in sql


def test_limit_and_offset_appended(query_service: QueryService) -> None:
    """Translate should propagate limit and offset values to the final SQL string."""
    description = _make_base_description(
        dimensions=[Dimension(field="category", flavour="discrete")],
        limit=25,
        offset=10,
    )

    sql, _ = query_service.translate_to_sql(
        query_desc=description,
        table_name="sales",
        db_type="duckdb",
        with_optimization=False,
    )

    assert "LIMIT 25" in sql
    assert "OFFSET 10" in sql


def test_date_part_dimension_uses_extract_alias(query_service: QueryService) -> None:
    """Date part dimensions should render EXTRACT expressions with stable aliases."""
    description = _make_base_description(
        dimensions=[
            Dimension(
                field="sale_date",
                flavour="discrete",
                date_part="year",
                date_mode="distinct",
            )
        ]
    )

    sql, _ = query_service.translate_to_sql(
        query_desc=description,
        table_name="sales",
        db_type="duckdb",
        with_optimization=False,
    )

    # DuckDB EXTRACT should include timezone wrapper for UTC normalization
    assert "EXTRACT(YEAR FROM timezone('UTC'," in sql
    assert "\"sale_date_year_distinct\"" in sql


def test_date_part_timeline_mode_uses_date_trunc(query_service: QueryService) -> None:
    """Timeline mode datetime parts should use date_trunc to preserve timeline."""
    description = _make_base_description(
        dimensions=[
            Dimension(
                field="created_at",
                flavour="continuous",
                date_part="hour",
                date_mode="timeline",
            )
        ]
    )

    sql, _ = query_service.translate_to_sql(
        query_desc=description,
        table_name="events",
        db_type="duckdb",
        with_optimization=False,
    )

    # Timeline mode should use date_trunc, not EXTRACT
    assert "date_trunc('hour'," in sql.lower()
    assert "\"created_at_hour_timeline\"" in sql


def test_date_part_timeline_mode_clickhouse(query_service: QueryService) -> None:
    """Timeline mode in ClickHouse should use toStartOf* functions."""
    description = _make_base_description(
        dimensions=[
            Dimension(
                field="timestamp",
                flavour="continuous",
                date_part="day",
                date_mode="timeline",
            )
        ]
    )

    sql, _ = query_service.translate_to_sql(
        query_desc=description,
        table_name="logs",
        db_type="clickhouse",
        with_optimization=False,
    )

    # ClickHouse timeline mode should use toStartOfDay
    assert "toStartOfDay(" in sql
    assert "`timestamp_day_timeline`" in sql


def test_date_part_distinct_vs_timeline_difference(query_service: QueryService) -> None:
    """Verify distinct and timeline modes produce different SQL."""
    # Distinct mode
    desc_distinct = _make_base_description(
        dimensions=[
            Dimension(
                field="event_time",
                flavour="discrete",
                date_part="month",
                date_mode="distinct",
            )
        ]
    )

    sql_distinct, _ = query_service.translate_to_sql(
        query_desc=desc_distinct,
        table_name="events",
        db_type="clickhouse",
        with_optimization=False,
    )

    # Timeline mode
    desc_timeline = _make_base_description(
        dimensions=[
            Dimension(
                field="event_time",
                flavour="continuous",
                date_part="month",
                date_mode="timeline",
            )
        ]
    )

    sql_timeline, _ = query_service.translate_to_sql(
        query_desc=desc_timeline,
        table_name="events",
        db_type="clickhouse",
        with_optimization=False,
    )

    # Distinct uses toMonth (returns 1-12)
    assert "toMonth(" in sql_distinct
    # Timeline uses toStartOfMonth (returns full date)
    assert "toStartOfMonth(" in sql_timeline
    # Different aliases
    assert "`event_time_month_distinct`" in sql_distinct
    assert "`event_time_month_timeline`" in sql_timeline


def test_rounding_config_wraps_continuous_dimension(query_service: QueryService) -> None:
    """Rounding config should wrap continuous dimensions in ROUND() expressions."""
    description = _make_base_description(
        dimensions=[Dimension(field="price", flavour="continuous")]
    )

    context = query_service._build_table_context(description, "duckdb", "sales")
    select_result = query_service._build_select_clause(
        description,
        context.table_map,
        context.default_table,
        "duckdb",
        rounding_config={"price": 2},
        binning_config={},
        use_category_dedup=False,
    )

    field_sql = select_result.fields[0].get_sql(quote_char="\"")
    assert "ROUND(" in field_sql
    # Ensure the alias is rendered in the SQL (don't rely on private attributes)
    assert '"price"' in field_sql


def test_binning_config_applies_date_trunc(query_service: QueryService) -> None:
    """Timeline binning should wrap dimensions in date_trunc with original alias."""
    description = _make_base_description(
        dimensions=[
            Dimension(field="event_time", flavour="continuous", date_mode="timeline")
        ]
    )

    context = query_service._build_table_context(description, "duckdb", "events")
    select_result = query_service._build_select_clause(
        description,
        context.table_map,
        context.default_table,
        "duckdb",
        rounding_config={},
        binning_config={"event_time": "day"},
        use_category_dedup=False,
    )

    field_sql = select_result.fields[0].get_sql(quote_char="\"")
    assert "date_trunc" in field_sql
    assert "'day'" in field_sql
    # Alias should be present in the rendered SQL rather than checking private attrs
    assert '"event_time"' in field_sql


def test_parse_field_reference_retains_nested_name(query_service: QueryService) -> None:
    """Single-table columns containing dots should not be split into table references."""
    description = _make_base_description()
    context = query_service._build_table_context(description, "duckdb", "sales")

    field = query_service._parse_field_reference(
        "sales.metric.value", context.table_map, context.default_table
    )

    # Single-table queries treat the entire dotted name as a single column identifier
    assert field.get_sql(quote_char="\"") == '"sales.metric.value"'


def test_parse_field_reference_with_join_prefix(query_service: QueryService) -> None:
    """Multi-table references should resolve to the correct joined table."""
    virtual_table = VirtualTableDefinition(
        primary_table="customers",
        joined_tables=[
            TableJoinDefinition(
                table_name="orders",
                join_type="INNER",
                on_conditions=["customers.id = orders.customer_id"],
            )
        ],
    )

    description = _make_base_description()
    description.virtual_table = virtual_table

    context = query_service._build_table_context(description, "duckdb", None)

    field = query_service._parse_field_reference(
        "orders.total", context.table_map, context.default_table
    )

    # Ensure the returned field object points to the joined table's field
    assert field == context.table_map['orders']['total']


def test_in_filter_with_null_includes_is_null_branch(query_service: QueryService) -> None:
    """IN filters containing NULL should expand to include an OR IS NULL criterion."""
    description = _make_base_description(
        dimensions=[Dimension(field="category", flavour="discrete")],
        filters=[Filter(field="category", operator="in", value=["Books", None])],
    )

    sql, _ = query_service.translate_to_sql(
        query_desc=description,
        table_name="sales",
        db_type="duckdb",
        with_optimization=False,
    )

    assert '"category" IN (\'Books\')' in sql
    assert '"category" IS NULL' in sql
