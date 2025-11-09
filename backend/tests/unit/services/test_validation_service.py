"""Unit tests for ValidationService."""

import pytest
from backend.services.validation_service import ValidationService
from backend.models.data_source import ConnectionDetails
from backend.exceptions import InvalidInputError


class TestValidationService:
    """Test suite for ValidationService validation methods."""
    
    def test_require_database_for_clickhouse_with_database(self):
        """Should not raise when database is provided for ClickHouse."""
        conn_details = ConnectionDetails(type="clickhouse", host="localhost")
        
        # Should not raise
        ValidationService.require_database_for_clickhouse(
            database="test_db",
            conn_details=conn_details,
            operation="testing"
        )
    
    def test_require_database_for_clickhouse_without_database(self):
        """Should raise InvalidInputError when database missing for ClickHouse."""
        conn_details = ConnectionDetails(type="clickhouse", host="localhost")
        
        with pytest.raises(InvalidInputError) as exc_info:
            ValidationService.require_database_for_clickhouse(
                database=None,
                conn_details=conn_details,
                operation="listing tables"
            )
        
        assert "database" in str(exc_info.value.detail).lower()
        assert "clickhouse" in str(exc_info.value.detail).lower()
        assert "listing tables" in str(exc_info.value.detail)
    
    def test_require_database_for_clickhouse_with_csv(self):
        """Should not raise for CSV connections (database not required)."""
        conn_details = ConnectionDetails(type="csv", file_path="/tmp/test.csv")
        
        # Should not raise even without database
        ValidationService.require_database_for_clickhouse(
            database=None,
            conn_details=conn_details,
            operation="testing"
        )
    
    def test_require_database_for_clickhouse_with_duckdb(self):
        """Should not raise for DuckDB connections (database optional)."""
        conn_details = ConnectionDetails(type="duckdb", file_path=":memory:")
        
        # Should not raise even without database
        ValidationService.require_database_for_clickhouse(
            database=None,
            conn_details=conn_details,
            operation="testing"
        )
    
    def test_require_target_database_for_clickhouse_with_database(self):
        """Should not raise when target_database is provided for ClickHouse."""
        conn_details = ConnectionDetails(type="clickhouse", host="localhost")
        
        class MockQueryDesc:
            target_database = "test_db"
        
        query_desc = MockQueryDesc()
        
        # Should not raise
        ValidationService.require_target_database_for_clickhouse(
            query_desc=query_desc,
            conn_details=conn_details
        )
    
    def test_require_target_database_for_clickhouse_without_database(self):
        """Should raise InvalidInputError when target_database missing for ClickHouse."""
        conn_details = ConnectionDetails(type="clickhouse", host="localhost")
        
        class MockQueryDesc:
            target_database = None
        
        query_desc = MockQueryDesc()
        
        with pytest.raises(InvalidInputError) as exc_info:
            ValidationService.require_target_database_for_clickhouse(
                query_desc=query_desc,
                conn_details=conn_details
            )
        
        assert "target_database" in str(exc_info.value.detail)
        assert "clickhouse" in str(exc_info.value.detail).lower()
    
    def test_require_target_database_for_clickhouse_with_csv(self):
        """Should not raise for CSV connections."""
        conn_details = ConnectionDetails(type="csv", file_path="/tmp/test.csv")
        
        class MockQueryDesc:
            target_database = None
        
        query_desc = MockQueryDesc()
        
        # Should not raise
        ValidationService.require_target_database_for_clickhouse(
            query_desc=query_desc,
            conn_details=conn_details
        )
    
    def test_validate_csv_table_match_success(self):
        """Should not raise when CSV table names match."""
        conn_details = ConnectionDetails(type="csv", file_path="/tmp/test.csv")
        
        class MockConnector:
            _table_name = "test_table"
        
        connector = MockConnector()
        
        # Should not raise
        ValidationService.validate_csv_table_match(
            target_table="test_table",
            connector=connector,
            conn_details=conn_details
        )
    
    def test_validate_csv_table_match_mismatch(self):
        """Should raise InvalidInputError when CSV table names don't match."""
        conn_details = ConnectionDetails(type="csv", file_path="/tmp/test.csv")
        
        class MockConnector:
            _table_name = "actual_table"
        
        connector = MockConnector()
        
        with pytest.raises(InvalidInputError) as exc_info:
            ValidationService.validate_csv_table_match(
                target_table="different_table",
                connector=connector,
                conn_details=conn_details
            )
        
        assert "different_table" in str(exc_info.value.detail)
        assert "actual_table" in str(exc_info.value.detail)
    
    def test_validate_csv_table_match_no_table_name(self):
        """Should raise InvalidInputError when connector has no _table_name."""
        conn_details = ConnectionDetails(type="csv", file_path="/tmp/test.csv")
        
        class MockConnector:
            pass  # No _table_name attribute
        
        connector = MockConnector()
        
        with pytest.raises(InvalidInputError) as exc_info:
            ValidationService.validate_csv_table_match(
                target_table="some_table",
                connector=connector,
                conn_details=conn_details
            )
        
        assert "some_table" in str(exc_info.value.detail)
    
    def test_validate_csv_table_match_with_clickhouse(self):
        """Should not raise for ClickHouse connections (CSV validation not applicable)."""
        conn_details = ConnectionDetails(type="clickhouse", host="localhost")
        
        class MockConnector:
            pass
        
        connector = MockConnector()
        
        # Should not raise for non-CSV connections
        ValidationService.validate_csv_table_match(
            target_table="any_table",
            connector=connector,
            conn_details=conn_details
        )
