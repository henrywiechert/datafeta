"""Unit tests for CardinalityService."""

import pytest
from unittest.mock import Mock, MagicMock
from backend.services.cardinality_service import CardinalityService, CountDistinct
from backend.models.data_source import ConnectionDetails, VirtualColumnDefinition
from backend.exceptions import InvalidInputError, QueryExecutionError


class TestCountDistinct:
    """Test suite for CountDistinct PyPika term."""
    
    def test_count_distinct_get_sql(self):
        """Should generate COUNT(DISTINCT field) SQL."""
        from pypika import Table
        
        table = Table("test_table")
        field_expr = table.name
        
        count_distinct = CountDistinct(field_expr)
        sql = count_distinct.get_sql(quote_char='"')
        
        assert "COUNT(DISTINCT" in sql
        assert "name" in sql


class TestCardinalityService:
    """Test suite for CardinalityService."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.mock_connector = Mock()
        self.clickhouse_details = ConnectionDetails(type="clickhouse", host="localhost")
        self.csv_details = ConnectionDetails(type="csv", file_path="/tmp/test.csv")
        self.default_db = "test_db"
    
    def test_get_distinct_count_basic(self):
        """Should execute count query and return count."""
        service = CardinalityService(self.mock_connector, self.clickhouse_details)
        
        # Mock fetch_data to return count result
        self.mock_connector.fetch_data.return_value = (
            ["count"],
            [[42]]
        )
        
        count = service.get_distinct_count(
            field="category",
            table="products",
            database=self.default_db
        )
        
        assert count == 42
        assert self.mock_connector.fetch_data.called
    
    def test_get_distinct_count_clickhouse_requires_database(self):
        """Should raise error when database missing for ClickHouse."""
        service = CardinalityService(self.mock_connector, self.clickhouse_details)
        
        with pytest.raises(InvalidInputError) as exc_info:
            service.get_distinct_count(
                field="name",
                table="users",
                database=None
            )
        
        assert "database" in str(exc_info.value.detail).lower()
    
    def test_get_distinct_count_clickhouse_with_database(self):
        """Should work when database provided for ClickHouse."""
        service = CardinalityService(self.mock_connector, self.clickhouse_details)
        
        self.mock_connector.fetch_data.return_value = (
            ["count"],
            [[100]]
        )
        
        count = service.get_distinct_count(
            field="status",
            table="orders",
            database="shop_db"
        )
        
        assert count == 100

    def test_clickhouse_wrapper_preserves_datetime_expression(self):
        """Should keep datetime-part extraction when using ClickHouse VIEW wrapper."""
        service = CardinalityService(self.mock_connector, self.clickhouse_details)

        self.mock_connector.fetch_data.return_value = (
            ["count"],
            [[60]],
        )

        count = service.get_distinct_count(
            field="utc",
            table="events_view",
            database="analytics",
            datetime_part="minute",
            datetime_mode="extract",
        )

        assert count == 60
        sql = self.mock_connector.fetch_data.call_args[0][0]
        assert "COUNT(DISTINCT `_expr`)" in sql
        assert "toMinute" in sql or "toSecond" in sql
        assert "FROM (SELECT" in sql and "AS `_expr`" in sql
    
    def test_get_distinct_count_source_table_with_unions(self):
        """Should count source tables for _source_table virtual column."""
        service = CardinalityService(self.mock_connector, self.clickhouse_details)
        
        count = service.get_distinct_count(
            field="_source_table",
            table="main_table",
            union_tables="table2,table3,table4",
            database=self.default_db,
        )
        
        # Primary table (1) + 3 union tables = 4
        assert count == 4
        # Should not execute query
        assert not self.mock_connector.fetch_data.called
    
    def test_get_distinct_count_source_table_no_unions(self):
        """Should handle _source_table without union tables."""
        service = CardinalityService(self.mock_connector, self.clickhouse_details)
        
        count = service.get_distinct_count(
            field="_source_table",
            table="single_table",
            union_tables=None,
            database=self.default_db,
        )
        
        assert count == 1
        assert not self.mock_connector.fetch_data.called

    def test_get_distinct_count_virtual_column_can_reference_source_symbols(self):
        """Virtual-column cardinality queries should resolve _source_database/_source_table as literals."""
        service = CardinalityService(self.mock_connector, self.clickhouse_details)
        self.mock_connector.fetch_data.return_value = (
            ["count"],
            [[7]],
        )

        count = service.get_distinct_count(
            field="source_label",
            table="orders",
            database="shop_db",
            virtual_columns=[
                VirtualColumnDefinition(
                    name="source_label",
                    expression="CONCAT(_source_database, ':', _source_table)",
                    output_type="VARCHAR",
                )
            ],
        )

        assert count == 7
        sql = self.mock_connector.fetch_data.call_args[0][0]
        assert "'shop_db'" in sql
        assert "'orders'" in sql
        assert "_source_database" not in sql
        assert "_source_table" not in sql
    
    def test_get_distinct_count_with_regex_pattern(self):
        """Should apply regex filter in query."""
        service = CardinalityService(self.mock_connector, self.clickhouse_details)
        
        self.mock_connector.fetch_data.return_value = (
            ["count"],
            [[25]]
        )
        
        count = service.get_distinct_count(
            field="name",
            table="users",
            regex_pattern="John",
            database=self.default_db,
        )
        
        assert count == 25
        # Verify SQL contains LIKE pattern
        call_args = self.mock_connector.fetch_data.call_args
        sql = call_args[0][0]
        assert "LIKE" in sql
        assert "%John%" in sql
    
    def test_get_distinct_count_with_datetime_part(self):
        """Should extract datetime part before counting."""
        service = CardinalityService(self.mock_connector, self.clickhouse_details)
        
        self.mock_connector.fetch_data.return_value = (
            ["count"],
            [[12]]  # 12 unique months
        )
        
        count = service.get_distinct_count(
            field="created_at",
            table="events",
            datetime_part="month",
            datetime_mode="extract",
            database=self.default_db,
        )
        
        assert count == 12
        # Verify SQL contains datetime extraction
        call_args = self.mock_connector.fetch_data.call_args
        sql = call_args[0][0]
        assert "EXTRACT" in sql or "toMonth" in sql
    
    def test_get_distinct_count_dict_result(self):
        """Should extract count from dict-based result."""
        service = CardinalityService(self.mock_connector, self.clickhouse_details)
        
        # Some connectors return dicts
        self.mock_connector.fetch_data.return_value = (
            ["count"],
            [{"count": 99}]
        )
        
        count = service.get_distinct_count(
            field="color",
            table="products",
            database=self.default_db,
        )
        
        assert count == 99
    
    def test_get_distinct_count_tuple_result(self):
        """Should extract count from tuple-based result."""
        service = CardinalityService(self.mock_connector, self.clickhouse_details)
        
        self.mock_connector.fetch_data.return_value = (
            ["count"],
            [(88,)]
        )
        
        count = service.get_distinct_count(
            field="region",
            table="sales",
            database=self.default_db,
        )
        
        assert count == 88
    
    def test_get_distinct_count_clickhouse_uniq_exact(self):
        """Should handle ClickHouse uniqExact result format."""
        service = CardinalityService(self.mock_connector, self.clickhouse_details)
        
        # ClickHouse might return uniqExact(field) as key
        self.mock_connector.fetch_data.return_value = (
            ["uniqExact(category)"],
            [{"uniqExact(category)": 50}]
        )
        
        count = service.get_distinct_count(
            field="category",
            table="items",
            database=self.default_db
        )
        
        assert count == 50
    
    def test_get_distinct_count_no_rows_returns_zero(self):
        """Should return 0 when query returns no rows."""
        service = CardinalityService(self.mock_connector, self.clickhouse_details)
        
        self.mock_connector.fetch_data.return_value = (
            ["count"],
            []
        )
        
        count = service.get_distinct_count(
            field="empty_field",
            table="empty_table",
            database=self.default_db,
        )
        
        assert count == 0
    
    def test_get_distinct_count_query_execution_error(self):
        """Should raise QueryExecutionError when query fails."""
        service = CardinalityService(self.mock_connector, self.clickhouse_details)
        
        self.mock_connector.fetch_data.side_effect = Exception("Database error")
        
        with pytest.raises(QueryExecutionError) as exc_info:
            service.get_distinct_count(
                field="bad_field",
                table="bad_table",
                database=self.default_db,
            )
        
        assert "Failed to count distinct values" in str(exc_info.value.detail)
    
    def test_get_distinct_count_with_datetime_and_regex(self):
        """Should combine datetime extraction with regex filtering."""
        service = CardinalityService(self.mock_connector, self.clickhouse_details)
        
        self.mock_connector.fetch_data.return_value = (
            ["count"],
            [[5]]
        )
        
        count = service.get_distinct_count(
            field="timestamp",
            table="logs",
            datetime_part="hour",
            datetime_mode="extract",
            regex_pattern="2024",
            database=self.default_db,
        )
        
        assert count == 5
        # Verify both EXTRACT and LIKE in SQL
        call_args = self.mock_connector.fetch_data.call_args
        sql = call_args[0][0]
        assert "LIKE" in sql
        assert ("EXTRACT" in sql or "toHour" in sql)

    def test_get_distinct_count_joined_tables_queries_source_directly(self):
        """Should query source table directly for joined tables (bypassing JOIN).
        
        When we have joined tables, filter values should return ALL distinct values
        from the source table, not just those matching the JOIN condition.
        """
        from backend.models.data_source import VirtualTableDefinition, TableJoinDefinition
        
        service = CardinalityService(self.mock_connector, self.clickhouse_details)
        
        self.mock_connector.fetch_data.return_value = (
            ["count"],
            [[150]]  # All distinct values from races table
        )
        
        # Create a virtual table with a JOIN
        virtual_table = VirtualTableDefinition(
            primary_table="results",
            mode="join",
            joined_tables=[
                TableJoinDefinition(
                    table_name="races",
                    join_type="LEFT",
                    on_conditions=["results.raceId = races.raceId"]
                )
            ],
            union_tables=[]
        )
        
        # Query for races.status - should query races table directly
        count = service.get_distinct_count(
            field="races.status",  # Qualified field name
            table="results",  # Primary table
            database="f1_db",
            virtual_table=virtual_table
        )
        
        assert count == 150
        # Verify the SQL queries the races table directly, not a JOIN
        call_args = self.mock_connector.fetch_data.call_args
        sql = call_args[0][0]
        # Should NOT contain JOIN
        assert "JOIN" not in sql
        # Should query races table directly
        assert "`f1_db`.`races`" in sql
        # Should count the status column
        assert "status" in sql

    def test_get_distinct_count_non_joined_table_with_dots_in_column_name(self):
        """Should handle column names containing dots when NOT joined.
        
        Some databases have column names like 'tablename.columnname' as literals.
        Without joined tables, these should be treated as literal column names.
        """
        service = CardinalityService(self.mock_connector, self.clickhouse_details)
        
        self.mock_connector.fetch_data.return_value = (
            ["count"],
            [[42]]
        )
        
        # No virtual_table = no joins
        count = service.get_distinct_count(
            field="table.column",  # Literal column name with dot
            table="my_table",
            database="test_db",
            virtual_table=None  # No joins
        )
        
        assert count == 42
        call_args = self.mock_connector.fetch_data.call_args
        sql = call_args[0][0]
        # Should treat "table.column" as a single column name
        assert "`table.column`" in sql or '"table.column"' in sql

    def test_get_distinct_count_dotted_column_not_matching_any_table(self):
        """Should NOT split column name on dot when prefix doesn't match a known table.
        
        Column names like 'dlPreSchedData.raState' where 'dlPreSchedData' is NOT a joined
        table should be treated as literal column names, not as table.column references.
        """
        from backend.models.data_source import VirtualTableDefinition, TableJoinDefinition
        
        service = CardinalityService(self.mock_connector, self.clickhouse_details)
        
        self.mock_connector.fetch_data.return_value = (
            ["count"],
            [[77]]
        )
        
        # Create virtual table — 'unknownPrefix' is NOT a known table
        virtual_table = VirtualTableDefinition(
            primary_table="primary_tbl",
            mode="join",
            joined_tables=[
                TableJoinDefinition(
                    table_name="joined_tbl",
                    join_type="LEFT",
                    on_conditions=["primary_tbl.id = joined_tbl.id"]
                )
            ],
            union_tables=[]
        )
        
        # Field with a dot prefix that does NOT match any table in the virtual table
        count = service.get_distinct_count(
            field="unknownPrefix.raState",
            table="primary_tbl",
            database="test_db",
            virtual_table=virtual_table
        )
        
        assert count == 77
        call_args = self.mock_connector.fetch_data.call_args
        sql = call_args[0][0]
        # Should query the primary table, NOT 'unknownPrefix'
        assert "`test_db`.`primary_tbl`" in sql
        # Should treat full name as column (not split)
        assert "`unknownPrefix.raState`" in sql
        # Should NOT contain 'unknownPrefix' as a table reference
        assert "FROM" in sql
        assert "unknownPrefix`" not in sql.split("FROM")[1].split("SELECT")[0] if "unknownPrefix`" in sql else True

    def test_get_distinct_count_dotted_column_matching_table_name_is_split(self):
        """Should split column name when prefix matches a known joined table.
        
        When the prefix before the dot IS a known table name (from virtual_table),
        this is the merge service's table prefix and should be split normally.
        """
        from backend.models.data_source import VirtualTableDefinition, TableJoinDefinition
        
        service = CardinalityService(self.mock_connector, self.clickhouse_details)
        
        self.mock_connector.fetch_data.return_value = (
            ["count"],
            [[200]]
        )
        
        virtual_table = VirtualTableDefinition(
            primary_table="preambleData",
            mode="join",
            joined_tables=[
                TableJoinDefinition(
                    table_name="dlPreSchedData",
                    join_type="LEFT",
                    on_conditions=["preambleData.id = dlPreSchedData.id"]
                ),
                TableJoinDefinition(
                    table_name="thirdTable",
                    join_type="LEFT",
                    on_conditions=["preambleData.id = thirdTable.id"]
                )
            ],
            union_tables=[]
        )
        
        # Field prefixed with a KNOWN table name — should split
        count = service.get_distinct_count(
            field="thirdTable.raState",
            table="preambleData",
            database="test_db",
            virtual_table=virtual_table
        )
        
        assert count == 200
        call_args = self.mock_connector.fetch_data.call_args
        sql = call_args[0][0]
        # Should query thirdTable directly (not preambleData)
        assert "`test_db`.`thirdTable`" in sql
        # Should use just 'raState' as column (prefix was the table name)
        assert "`raState`" in sql
        # Should NOT join
        assert "JOIN" not in sql

    def test_get_distinct_count_double_dotted_column_from_join(self):
        """Should correctly handle columns with dots when table prefix is added by merge service.
        
        When a DB column is 'dlPreSchedData.raState' (with dot) and it lives in table
        'thirdTable', the merge service creates 'thirdTable.dlPreSchedData.raState'.
        The first split should give table='thirdTable', column='dlPreSchedData.raState'.
        """
        from backend.models.data_source import VirtualTableDefinition, TableJoinDefinition
        
        service = CardinalityService(self.mock_connector, self.clickhouse_details)
        
        self.mock_connector.fetch_data.return_value = (
            ["count"],
            [[33]]
        )
        
        virtual_table = VirtualTableDefinition(
            primary_table="preambleData",
            mode="join",
            joined_tables=[
                TableJoinDefinition(
                    table_name="dlPreSchedData",
                    join_type="LEFT",
                    on_conditions=["preambleData.id = dlPreSchedData.id"]
                ),
                TableJoinDefinition(
                    table_name="thirdTable",
                    join_type="LEFT",
                    on_conditions=["preambleData.id = thirdTable.id"]
                )
            ],
            union_tables=[]
        )
        
        # Field: merge service prefix 'thirdTable' + DB column 'dlPreSchedData.raState'
        count = service.get_distinct_count(
            field="thirdTable.dlPreSchedData.raState",
            table="preambleData",
            database="test_db",
            virtual_table=virtual_table
        )
        
        assert count == 33
        call_args = self.mock_connector.fetch_data.call_args
        sql = call_args[0][0]
        # Should query thirdTable (first prefix is the table name)
        assert "`test_db`.`thirdTable`" in sql
        # Should use 'dlPreSchedData.raState' as the column name (backtick-quoted with dot)
        assert "`dlPreSchedData.raState`" in sql

    def test_get_distinct_count_explicit_source_table(self):
        """Should use explicit source_table parameter to determine the correct table.
        
        When source_table is provided (from Column.table_name), it should be used
        directly instead of trying to parse the field name by splitting on dots.
        This is the most reliable method for multi-table JOIN support.
        """
        service = CardinalityService(self.mock_connector, self.clickhouse_details)
        
        self.mock_connector.fetch_data.return_value = (
            ["count"],
            [[55]]
        )
        
        # source_table tells us the field belongs to 'dlPreSchedData'
        # Field name is 'dlPreSchedData.dlPreSchedData.raState' (merge service prefix + dotted column)
        # No virtual_table needed — source_table is the reliable source of truth
        count = service.get_distinct_count(
            field="dlPreSchedData.dlPreSchedData.raState",
            table="preambleData",  # primary table
            database="test_db",
            source_table="dlPreSchedData"
        )
        
        assert count == 55
        call_args = self.mock_connector.fetch_data.call_args
        sql = call_args[0][0]
        # Should query dlPreSchedData (from source_table), NOT preambleData
        assert "`test_db`.`dlPreSchedData`" in sql
        # Should strip the table prefix and use the actual column name
        assert "`dlPreSchedData.raState`" in sql
        # Should NOT contain preambleData
        assert "preambleData" not in sql

    def test_get_distinct_count_explicit_source_table_simple_column(self):
        """Should handle source_table with non-dotted column names."""
        service = CardinalityService(self.mock_connector, self.clickhouse_details)
        
        self.mock_connector.fetch_data.return_value = (
            ["count"],
            [[88]]
        )
        
        # Field: 'races.status' where 'races' is both the source table and the prefix
        count = service.get_distinct_count(
            field="races.status",
            table="results",  # primary table
            database="f1_db",
            source_table="races"
        )
        
        assert count == 88
        call_args = self.mock_connector.fetch_data.call_args
        sql = call_args[0][0]
        # Should query races table
        assert "`f1_db`.`races`" in sql
        # Should use just 'status' (prefix stripped)
        assert "`status`" in sql
        # Should NOT query results
        assert "results" not in sql

    def test_get_distinct_count_source_table_same_as_primary(self):
        """When source_table matches the primary table, strip prefix and query primary."""
        service = CardinalityService(self.mock_connector, self.clickhouse_details)
        
        self.mock_connector.fetch_data.return_value = (
            ["count"],
            [[100]]
        )
        
        # Field from the primary table itself — prefix matches primary
        count = service.get_distinct_count(
            field="preambleData.someColumn",
            table="preambleData",
            database="test_db",
            source_table="preambleData"
        )
        
        assert count == 100
        call_args = self.mock_connector.fetch_data.call_args
        sql = call_args[0][0]
        # Should query preambleData
        assert "`test_db`.`preambleData`" in sql
        # Should strip prefix and use 'someColumn'
        assert "`someColumn`" in sql

    def test_get_distinct_count_union_mode_dotted_literal_uses_matching_table(self):
        """UNION mode: dotted literal columns should resolve source table without splitting.

        Real-world case: field name can be literally 'dlPreSchedData.raState' and live in
        table 'dlPreSchedData'. We must query that table directly and keep the full column name.
        """
        from backend.models.data_source import VirtualTableDefinition, UnionTableDefinition

        service = CardinalityService(self.mock_connector, self.clickhouse_details)

        self.mock_connector.fetch_data.return_value = (
            ["count"],
            [[123]]
        )

        virtual_table = VirtualTableDefinition(
            primary_table="preambleData",
            mode="union",
            joined_tables=[],
            union_tables=[
                UnionTableDefinition(table_name="dlPreSchedData", database="test_db"),
                UnionTableDefinition(table_name="thirdTable", database="test_db"),
            ]
        )

        count = service.get_distinct_count(
            field="dlPreSchedData.raState",
            table="preambleData",
            database="test_db",
            virtual_table=virtual_table,
            source_table=None,
        )

        assert count == 123
        sql = self.mock_connector.fetch_data.call_args[0][0]
        # Should query the matching union table, not the primary table
        assert "`test_db`.`dlPreSchedData`" in sql
        assert "`test_db`.`preambleData`" not in sql
        # Must keep literal dotted column name intact
        assert "`dlPreSchedData.raState`" in sql
