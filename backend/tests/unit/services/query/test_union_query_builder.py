from unittest.mock import MagicMock

from backend.models.data_source import VirtualColumnDefinition, VirtualTableDefinition, UnionTableDefinition
from backend.models.query import Dimension, Filter, Measure, QueryDescription
from backend.connectors.base import Column
from backend.services.query_service import QueryService


def test_union_query_injects_source_table_column():
    query_description = QueryDescription(
        target_table="sales_2023",
        target_database="analytics",
        dimensions=[Dimension(field="category", flavour="discrete")],
        virtual_table=VirtualTableDefinition(
            primary_table="sales_2023",
            mode="union",
            union_tables=[UnionTableDefinition(table_name="sales_2024")],
        ),
    )

    query_sql, metadata = QueryService().translate_to_sql(
        query_description,
        table_name="sales_2023",
        db_type="duckdb",
        with_optimization=False,
    )

    assert "UNION ALL" in query_sql
    assert "'sales_2023' AS \"_source_table\"" in query_sql
    assert "'sales_2024' AS \"_source_table\"" in query_sql
    assert metadata == []


def test_single_table_query_adds_source_table_column():
    """Test that single-table queries properly add _source_table as a literal."""
    query_description = QueryDescription(
        target_table="sales",
        target_database="analytics",
        dimensions=[
            Dimension(field="category", flavour="discrete"),
            Dimension(field="_source_table", flavour="discrete")
        ],
    )

    query_sql, metadata = QueryService().translate_to_sql(
        query_description,
        table_name="sales",
        db_type="duckdb",
        with_optimization=False,
    )

    # Should add _source_table as a literal in the SELECT clause
    assert "'sales' AS \"_source_table\"" in query_sql or "'sales'" in query_sql
    # Should NOT be wrapped (literals added directly in SELECT)
    # Note: May have grouping/ordering that references _source_table


def test_single_table_query_adds_source_database_column():
    """Test that single-table queries properly add _source_database as a literal."""
    query_description = QueryDescription(
        target_table="sales",
        target_database="analytics",
        dimensions=[
            Dimension(field="category", flavour="discrete"),
            Dimension(field="_source_database", flavour="discrete")
        ],
    )

    query_sql, metadata = QueryService().translate_to_sql(
        query_description,
        table_name="sales",
        db_type="duckdb",
        with_optimization=False,
    )

    # Should add _source_database as a literal in the SELECT clause
    assert "'analytics' AS \"_source_database\"" in query_sql or "'analytics'" in query_sql
    # Literals added directly in SELECT, can be used in GROUP BY and ORDER BY


def test_single_table_query_adds_both_source_columns():
    """Test that single-table queries can add both _source_database and _source_table."""
    query_description = QueryDescription(
        target_table="sales",
        target_database="analytics",
        dimensions=[
            Dimension(field="_source_database", flavour="discrete"),
            Dimension(field="_source_table", flavour="discrete")
        ],
    )

    query_sql, metadata = QueryService().translate_to_sql(
        query_description,
        table_name="sales",
        db_type="duckdb",
        with_optimization=False,
    )

    # Should add both columns as literals in SELECT
    assert "'analytics'" in query_sql  # _source_database
    assert "'sales'" in query_sql  # _source_table


def test_file_connector_empty_database():
    """Test that file connectors (no database) use empty string for _source_database."""
    query_description = QueryDescription(
        target_table="uploaded_file",
        target_database=None,  # File connectors have no database
        dimensions=[
            Dimension(field="_source_database", flavour="discrete"),
            Dimension(field="_source_table", flavour="discrete")
        ],
    )

    query_sql, metadata = QueryService().translate_to_sql(
        query_description,
        table_name="uploaded_file",
        db_type="duckdb",
        with_optimization=False,
    )

    # Should use empty string for database (added as literal in SELECT)
    # PyPika may format empty string as '' or ""
    assert ("''" in query_sql or '""' in query_sql)  # Empty database
    assert "'uploaded_file'" in query_sql  # Table name


def test_union_query_with_qualified_table_names():
    """Test that union queries correctly handle qualified database/table names with '/' separator."""
    query_description = QueryDescription(
        target_table="sales_2023",
        target_database="analytics",
        dimensions=[
            Dimension(field="_source_database", flavour="discrete"),
            Dimension(field="_source_table", flavour="discrete")
        ],
        virtual_table=VirtualTableDefinition(
            primary_table="sales_2023",
            mode="union",
            # Simulating frontend sending qualified names like "other_db/sales_2024"
            # Using '/' separator to avoid conflicts with column names that contain dots
            union_tables=[UnionTableDefinition(table_name="other_db/sales_2024")],
        ),
    )

    query_sql, metadata = QueryService().translate_to_sql(
        query_description,
        table_name="sales_2023",
        db_type="clickhouse",
        with_optimization=False,
    )

    # Should properly parse and quote the qualified table name
    assert "`other_db`.`sales_2024`" in query_sql
    # Should show correct source values
    assert "'other_db'" in query_sql  # _source_database for union table
    assert "'sales_2024'" in query_sql  # _source_table for union table
    assert "'analytics'" in query_sql  # _source_database for primary table
    assert "'sales_2023'" in query_sql  # _source_table for primary table


def test_virtual_column_filter_does_not_cause_where_1_eq_0():
    """A filter on a computable virtual column must not skip the table with WHERE 1=0."""
    mock_connector = MagicMock()

    def list_columns_side_effect(database, table):
        return [
            Column(name="slot", data_type="Int32"),
            Column(name="sfn", data_type="Int32"),
            Column(name="hfnTickCount", data_type="Int64"),
            Column(name="value", data_type="Float64"),
        ]

    mock_connector.list_columns.side_effect = list_columns_side_effect
    mock_connector.estimate_table_size.return_value = 100

    query_description = QueryDescription(
        target_table="ulLaPhr",
        target_database="mydb",
        measures=[Measure(field="cslot", aggregation="min", alias="min_value"),
                  Measure(field="cslot", aggregation="max", alias="max_value")],
        filters=[Filter(field="cslot", operator=">=", value=0)],
        virtual_columns=[
            VirtualColumnDefinition(
                name="cslot",
                expression="slot+sfn*20+hfnTickCount*1024*20",
                output_type="DOUBLE",
            )
        ],
        virtual_table=VirtualTableDefinition(
            primary_table="ulLaPhr",
            mode="union",
            union_tables=[UnionTableDefinition(table_name="dlFdSchedData")],
        ),
    )

    query_sql, _ = QueryService().translate_to_sql(
        query_description,
        table_name="ulLaPhr",
        db_type="clickhouse",
        with_optimization=False,
        connector=mock_connector,
    )

    assert "WHERE 1=0" not in query_sql
    assert "UNION ALL" in query_sql
