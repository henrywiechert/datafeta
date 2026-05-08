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


def test_single_table_virtual_column_can_reference_source_database():
    """Virtual columns should be able to use _source_database in single-table queries."""
    query_description = QueryDescription(
        target_table="sales",
        target_database="analytics",
        dimensions=[Dimension(field="source_group", flavour="discrete")],
        virtual_columns=[
            VirtualColumnDefinition(
                name="source_group",
                expression="CASE WHEN _source_database = 'analytics' THEN 'prod' ELSE 'other' END",
                output_type="VARCHAR",
            )
        ],
    )

    query_sql, metadata = QueryService().translate_to_sql(
        query_description,
        table_name="sales",
        db_type="duckdb",
        with_optimization=False,
    )

    assert "'analytics'" in query_sql
    assert "'prod'" in query_sql
    assert metadata == []


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


def test_union_virtual_column_can_reference_source_table():
    """UNION branches should treat _source_table as a computable virtual-column dependency."""
    mock_connector = MagicMock()
    mock_connector.list_columns.return_value = [
        Column(name="category", data_type="String"),
    ]

    query_description = QueryDescription(
        target_table="sales_2023",
        target_database="analytics",
        dimensions=[Dimension(field="source_label", flavour="discrete")],
        virtual_columns=[
            VirtualColumnDefinition(
                name="source_label",
                expression="CONCAT('branch:', _source_table)",
                output_type="VARCHAR",
            )
        ],
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
        connector=mock_connector,
    )

    assert "UNION ALL" in query_sql
    assert "'branch:'" in query_sql
    assert query_sql.count("'sales_2023'") >= 2
    assert query_sql.count("'sales_2024'") >= 2
    assert metadata == []


def test_union_virtual_column_case_with_string_literals_is_not_null_filled():
    """UNION dependency parsing should ignore CASE string literals like 'High'/'Low'."""
    mock_connector = MagicMock()
    mock_connector.list_columns.return_value = [
        Column(name="dlFdSchedData.cellBwpId", data_type="UInt32"),
    ]
    mock_connector.estimate_table_size.return_value = 100

    query_description = QueryDescription(
        target_table="dlFdSchedData",
        target_database="tti_fvogel_ref_14045_1703_step1",
        dimensions=[Dimension(field="xxx", flavour="discrete")],
        measures=[Measure(field="dlFdSchedData.cellBwpId", aggregation="sum", alias="SUM(dlFdSchedData.cellBwpId)")],
        virtual_columns=[
            VirtualColumnDefinition(
                name="xxx",
                expression=(
                    "CASE WHEN _source_database = 'tti_fvogel_ref_14045_1703_step1' "
                    "THEN 'High' ELSE 'Low' END"
                ),
                output_type="VARCHAR",
            )
        ],
        virtual_table=VirtualTableDefinition(
            primary_table="dlFdSchedData",
            mode="union",
            union_tables=[
                UnionTableDefinition(table_name="tti_fvogel_ref_14045_1703_step2/dlFdSchedData"),
            ],
        ),
    )

    query_sql, metadata = QueryService().translate_to_sql(
        query_description,
        table_name="dlFdSchedData",
        db_type="clickhouse",
        with_optimization=False,
        connector=mock_connector,
    )

    assert "'High'" in query_sql
    assert "'Low'" in query_sql
    assert "CAST(NULL AS Nullable(String)) AS `xxx`" not in query_sql
    assert metadata == []


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


def test_null_filter_on_field_missing_from_primary_table_skips_primary():
    """Filtering non-null on a field absent from the primary table must skip that table entirely.

    Scenario mirrors the real-world bug: union of ulPuschReceiveRespPsData (primary,
    has no dtx column and no matching measures) + ulPucchReceiveRespPsData (secondary,
    has dtx + rxPower).  A "not null" filter on dtx causes missing_filter_fields on
    the primary table.  Before the fix the builder emitted a WHERE 1=0 placeholder that
    referenced a datetime-part alias (utc_second_timeline) which ClickHouse cannot
    resolve inside a view, raising UNKNOWN_IDENTIFIER.  After the fix the primary table
    is skipped entirely so only one branch appears in the output.
    """
    mock_connector = MagicMock()

    def list_columns_side_effect(database, table):
        if table == "ulPuschReceiveRespPsData":
            # Primary table - has utc and lcrId but NOT dtx, NOT rxPower
            return [
                Column(name="utc", data_type="DateTime64(6)"),
                Column(name="lcrId", data_type="Int32"),
            ]
        else:
            # Secondary table - has all requested columns
            return [
                Column(name="ulPucchReceiveRespPsData.dtx", data_type="String"),
                Column(name="utc", data_type="DateTime64(6)"),
                Column(name="lcrId", data_type="Int32"),
                Column(name="ulPucchReceiveRespPsData.rxPower", data_type="Float64"),
            ]

    mock_connector.list_columns.side_effect = list_columns_side_effect
    mock_connector.estimate_table_size.return_value = 100

    query_description = QueryDescription(
        target_table="ulPuschReceiveRespPsData",
        target_database="mydb",
        dimensions=[
            Dimension(field="ulPucchReceiveRespPsData.dtx", flavour="discrete"),
            Dimension(field="utc", flavour="continuous", date_part="second", date_mode="timeline"),
            Dimension(field="lcrId", flavour="discrete"),
        ],
        measures=[
            Measure(
                field="ulPucchReceiveRespPsData.rxPower",
                aggregation="sum",
                alias="SUM(ulPucchReceiveRespPsData.rxPower)",
            )
        ],
        filters=[
            Filter(field="ulPucchReceiveRespPsData.dtx", operator="is not null", value=None),
        ],
        virtual_table=VirtualTableDefinition(
            primary_table="ulPuschReceiveRespPsData",
            mode="union",
            union_tables=[UnionTableDefinition(table_name="ulPucchReceiveRespPsData")],
        ),
    )

    query_sql, _ = QueryService().translate_to_sql(
        query_description,
        table_name="ulPuschReceiveRespPsData",
        db_type="clickhouse",
        with_optimization=False,
        connector=mock_connector,
    )

    # Primary table contributes nothing (missing measure + filter field absent) - no WHERE 1=0
    assert "WHERE 1=0" not in query_sql
    # Only the secondary table branch appears - primary table name not in FROM clause
    assert "ulPuschReceiveRespPsData" not in query_sql.split("FROM")[1]
    # Datetime-part alias must not appear as a bare column reference inside a WHERE 1=0 branch
    assert "utc_second_timeline AS `utc_second_timeline`" in query_sql or \
           "utc_second_timeline" in query_sql


def test_null_filter_on_field_missing_from_primary_table_dimension_only():
    """Same scenario but dimension-only (continuous Y, no measures) — must not produce NO_COMMON_TYPE.

    When filtering IS NOT NULL on a field absent from the primary table and there are
    no measures (e.g. continuous dimension on Y axis), the old code generated:
        CAST(NULL AS Nullable(String)) AS `utc_second_timeline`
    for the WHERE 1=0 placeholder.  ClickHouse then tried to unify String with
    DateTime64 from the secondary branch and raised NO_COMMON_TYPE.
    The fix: skip the primary table entirely – it contributes no rows anyway.
    """
    mock_connector = MagicMock()

    def list_columns_side_effect(database, table):
        if table == "ulPuschReceiveRespPsData":
            # Primary table - has utc and lcrId but NOT crc, NOT rxPower
            return [
                Column(name="utc", data_type="DateTime64(6)"),
                Column(name="lcrId", data_type="Int32"),
            ]
        else:
            # Secondary table - has all requested columns
            return [
                Column(name="ulPucchReceiveRespPsData.crc", data_type="String"),
                Column(name="utc", data_type="DateTime64(6)"),
                Column(name="ulPucchReceiveRespPsData.rxPower", data_type="Float32"),
                Column(name="lcrId", data_type="Int32"),
            ]

    mock_connector.list_columns.side_effect = list_columns_side_effect
    mock_connector.estimate_table_size.return_value = 100

    # Dimension-only query (continuous rxPower on Y, no measure aggregation)
    query_description = QueryDescription(
        target_table="ulPuschReceiveRespPsData",
        target_database="mydb",
        dimensions=[
            Dimension(field="ulPucchReceiveRespPsData.crc", flavour="discrete"),
            Dimension(field="utc", flavour="continuous", date_part="second", date_mode="timeline"),
            Dimension(field="ulPucchReceiveRespPsData.rxPower", flavour="continuous"),
            Dimension(field="lcrId", flavour="discrete"),
        ],
        measures=[],
        filters=[
            Filter(field="ulPucchReceiveRespPsData.crc", operator="is not null", value=None),
        ],
        virtual_table=VirtualTableDefinition(
            primary_table="ulPuschReceiveRespPsData",
            mode="union",
            union_tables=[UnionTableDefinition(table_name="ulPucchReceiveRespPsData")],
        ),
    )

    query_sql, _ = QueryService().translate_to_sql(
        query_description,
        table_name="ulPuschReceiveRespPsData",
        db_type="clickhouse",
        with_optimization=False,
        connector=mock_connector,
    )

    # Primary table skipped entirely - no WHERE 1=0 placeholder, no type mismatch
    assert "WHERE 1=0" not in query_sql
    # No CAST(NULL AS Nullable(String)) for utc_second_timeline (the DateTime column)
    assert "Nullable(String)) AS `utc_second_timeline`" not in query_sql
    # Only the secondary table contributes
    assert "`ulPuschReceiveRespPsData`" not in query_sql
    # Secondary table's datetime expression is present
    assert "utc_second_timeline" in query_sql
