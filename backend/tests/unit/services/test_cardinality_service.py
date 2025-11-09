"""Unit tests for CardinalityService."""

import pytest
from unittest.mock import Mock, MagicMock
from backend.services.cardinality_service import CardinalityService, CountDistinct
from backend.models.data_source import ConnectionDetails
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
        self.duckdb_details = ConnectionDetails(type="duckdb", file_path=":memory:")
    
    def test_get_distinct_count_basic(self):
        """Should execute count query and return count."""
        service = CardinalityService(self.mock_connector, self.duckdb_details)
        
        # Mock fetch_data to return count result
        self.mock_connector.fetch_data.return_value = (
            ["count"],
            [[42]]
        )
        
        count = service.get_distinct_count(
            field="category",
            table="products",
            database=None
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
    
    def test_get_distinct_count_source_table_with_unions(self):
        """Should count source tables for _source_table virtual column."""
        service = CardinalityService(self.mock_connector, self.duckdb_details)
        
        count = service.get_distinct_count(
            field="_source_table",
            table="main_table",
            union_tables="table2,table3,table4"
        )
        
        # Primary table (1) + 3 union tables = 4
        assert count == 4
        # Should not execute query
        assert not self.mock_connector.fetch_data.called
    
    def test_get_distinct_count_source_table_no_unions(self):
        """Should handle _source_table without union tables."""
        service = CardinalityService(self.mock_connector, self.csv_details)
        
        count = service.get_distinct_count(
            field="_source_table",
            table="single_table",
            union_tables=None
        )
        
        assert count == 0
        assert not self.mock_connector.fetch_data.called
    
    def test_get_distinct_count_with_regex_pattern(self):
        """Should apply regex filter in query."""
        service = CardinalityService(self.mock_connector, self.duckdb_details)
        
        self.mock_connector.fetch_data.return_value = (
            ["count"],
            [[25]]
        )
        
        count = service.get_distinct_count(
            field="name",
            table="users",
            regex_pattern="John"
        )
        
        assert count == 25
        # Verify SQL contains LIKE pattern
        call_args = self.mock_connector.fetch_data.call_args
        sql = call_args[0][0]
        assert "LIKE" in sql
        assert "%John%" in sql
    
    def test_get_distinct_count_with_datetime_part(self):
        """Should extract datetime part before counting."""
        service = CardinalityService(self.mock_connector, self.duckdb_details)
        
        self.mock_connector.fetch_data.return_value = (
            ["count"],
            [[12]]  # 12 unique months
        )
        
        count = service.get_distinct_count(
            field="created_at",
            table="events",
            datetime_part="month",
            datetime_mode="extract"
        )
        
        assert count == 12
        # Verify SQL contains datetime extraction
        call_args = self.mock_connector.fetch_data.call_args
        sql = call_args[0][0]
        assert "EXTRACT" in sql or "toMonth" in sql
    
    def test_get_distinct_count_dict_result(self):
        """Should extract count from dict-based result."""
        service = CardinalityService(self.mock_connector, self.csv_details)
        
        # Some connectors return dicts
        self.mock_connector.fetch_data.return_value = (
            ["count"],
            [{"count": 99}]
        )
        
        count = service.get_distinct_count(
            field="color",
            table="products"
        )
        
        assert count == 99
    
    def test_get_distinct_count_tuple_result(self):
        """Should extract count from tuple-based result."""
        service = CardinalityService(self.mock_connector, self.duckdb_details)
        
        self.mock_connector.fetch_data.return_value = (
            ["count"],
            [(88,)]
        )
        
        count = service.get_distinct_count(
            field="region",
            table="sales"
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
            database="test_db"
        )
        
        assert count == 50
    
    def test_get_distinct_count_no_rows_returns_zero(self):
        """Should return 0 when query returns no rows."""
        service = CardinalityService(self.mock_connector, self.csv_details)
        
        self.mock_connector.fetch_data.return_value = (
            ["count"],
            []
        )
        
        count = service.get_distinct_count(
            field="empty_field",
            table="empty_table"
        )
        
        assert count == 0
    
    def test_get_distinct_count_query_execution_error(self):
        """Should raise QueryExecutionError when query fails."""
        service = CardinalityService(self.mock_connector, self.duckdb_details)
        
        self.mock_connector.fetch_data.side_effect = Exception("Database error")
        
        with pytest.raises(QueryExecutionError) as exc_info:
            service.get_distinct_count(
                field="bad_field",
                table="bad_table"
            )
        
        assert "Failed to count distinct values" in str(exc_info.value.detail)
    
    def test_get_distinct_count_with_datetime_and_regex(self):
        """Should combine datetime extraction with regex filtering."""
        service = CardinalityService(self.mock_connector, self.duckdb_details)
        
        self.mock_connector.fetch_data.return_value = (
            ["count"],
            [[5]]
        )
        
        count = service.get_distinct_count(
            field="timestamp",
            table="logs",
            datetime_part="hour",
            datetime_mode="extract",
            regex_pattern="2024"
        )
        
        assert count == 5
        # Verify both EXTRACT and LIKE in SQL
        call_args = self.mock_connector.fetch_data.call_args
        sql = call_args[0][0]
        assert "LIKE" in sql
        assert ("EXTRACT" in sql or "toHour" in sql)
