"""
Legacy tests for database-specific estimators.
"""

import sys
from pathlib import Path
from unittest.mock import Mock, MagicMock

# Ensure backend package imports resolve in legacy tests
CURRENT_FILE = Path(__file__).resolve()
BACKEND_ROOT = CURRENT_FILE.parents[2]
PROJECT_ROOT = CURRENT_FILE.parents[3]
sys.path.insert(0, str(BACKEND_ROOT))
sys.path.insert(0, str(PROJECT_ROOT))

import pytest
from pypika import Query, Table

from models.query import QueryDescription, Dimension
from services.optimization.estimators.clickhouse import ClickHouseEstimator
from services.optimization.estimators.duckdb import DuckDBEstimator
from services.optimization.estimators.base import EstimationResult


class TestClickHouseEstimator:
    """Tests for ClickHouseEstimator."""
    
    def test_initialization(self):
        """Test estimator initialization."""
        connector = Mock()
        estimator = ClickHouseEstimator(connector)
        
        assert estimator.connector == connector
        assert estimator.use_exact is False
    
    def test_initialization_with_exact(self):
        """Test estimator initialization with exact mode."""
        connector = Mock()
        estimator = ClickHouseEstimator(connector, use_exact=True)
        
        assert estimator.use_exact is True
    
    def test_estimate_result_size(self):
        """Test basic result size estimation."""
        connector = Mock()
        connector.fetch_data = Mock(return_value=(
            [],
            [{'total_rows': 10000, 'unique_pairs': 3000}]
        ))
        
        estimator = ClickHouseEstimator(connector)
        
        query_desc = QueryDescription(
            target_table='test_table',
            dimensions=[
                Dimension(field='x', flavour='continuous', axis='x'),
                Dimension(field='y', flavour='continuous', axis='y')
            ],
            measures=[]
        )
        
        table = Table('test_table')
        query = Query.from_(table).select(table.x, table.y)
        
        result = estimator.estimate_result_size(query, query_desc, table)
        
        assert isinstance(result, EstimationResult)
        assert result.total_rows == 10000
        assert result.unique_pairs == 3000
    
    def test_estimate_distinct_reduction(self):
        """Test DISTINCT reduction estimation."""
        connector = Mock()
        connector.fetch_data = Mock(return_value=([], [
            {'total_rows': 10000, 'unique_pairs': 3000}]))
        
        estimator = ClickHouseEstimator(connector)
        
        query_desc = QueryDescription(
            target_table='test_table',
            dimensions=[
                Dimension(field='price', flavour='continuous', axis='x'),
                Dimension(field='quantity', flavour='continuous', axis='y')
            ],
            measures=[]
        )
        
        table = Table('test_table')
        query = Query.from_(table).select(table.price, table.quantity)
        
        reduction = estimator.estimate_distinct_reduction(query, query_desc, table)
        
        assert reduction == pytest.approx(0.7, abs=0.01)
    
    def test_builds_correct_sql_for_pairs(self):
        """Test that SQL is built correctly for pair estimation."""
        connector = Mock()
        connector.fetch_data = Mock(return_value=([], [
            {'total_rows': 1000, 'unique_pairs': 500}]))
        
        estimator = ClickHouseEstimator(connector)
        
        query_desc = QueryDescription(
            target_table='sales',
            dimensions=[
                Dimension(field='x', flavour='continuous', axis='x'),
                Dimension(field='y', flavour='continuous', axis='y')
            ],
            measures=[]
        )
        
        table = Table('sales')
        query = Query.from_(table).select(table.x, table.y)
        
        estimator.estimate_result_size(query, query_desc, table)
        
        assert connector.fetch_data.called
        sql = connector.fetch_data.call_args[0][0]
        
        assert 'uniq' in sql.lower() or 'uniqexact' in sql.lower()
        assert 'tuple' in sql.lower()
    
    def test_handles_single_dimension(self):
        """Test estimation with single dimension."""
        connector = Mock()
        connector.fetch_data = Mock(return_value=([], [
            {'total_rows': 5000, 'unique_pairs': 4000}]))
        
        estimator = ClickHouseEstimator(connector)
        
        query_desc = QueryDescription(
            target_table='data',
            dimensions=[
                Dimension(field='value', flavour='continuous', axis='x')
            ],
            measures=[]
        )
        
        table = Table('data')
        query = Query.from_(table).select(table.value)
        
        result = estimator.estimate_result_size(query, query_desc, table)
        
        assert result.total_rows == 5000
        assert result.unique_pairs == 4000
    
    def test_handles_estimation_error(self):
        """Test graceful handling of estimation errors."""
        connector = Mock()
        connector.execute_query = Mock(side_effect=Exception("Database error"))
        
        estimator = ClickHouseEstimator(connector)
        
        query_desc = QueryDescription(
            target_table='data',
            dimensions=[
                Dimension(field='x', flavour='continuous', axis='x'),
                Dimension(field='y', flavour='continuous', axis='y')
            ],
            measures=[]
        )
        
        table = Table('data')
        query = Query.from_(table).select(table.x, table.y)
        
        result = estimator.estimate_result_size(query, query_desc, table)
        
        assert result.total_rows == 0


class TestDuckDBEstimator:
    """Tests for DuckDBEstimator."""
    
    def test_initialization(self):
        """Test estimator initialization."""
        connector = Mock()
        estimator = DuckDBEstimator(connector)
        
        assert estimator.connector == connector
        assert estimator.use_exact is False
    
    def test_estimate_result_size(self):
        """Test basic result size estimation."""
        connector = Mock()
        connector.fetch_data = Mock(return_value=([], [
            {'total_rows': 8000, 'unique_pairs': 2500}]))
        
        estimator = DuckDBEstimator(connector)
        
        query_desc = QueryDescription(
            target_table='test_data',
            dimensions=[
                Dimension(field='lat', flavour='continuous', axis='x'),
                Dimension(field='lon', flavour='continuous', axis='y')
            ],
            measures=[]
        )
        
        table = Table('test_data')
        query = Query.from_(table).select(table.lat, table.lon)
        
        result = estimator.estimate_result_size(query, query_desc, table)
        
        assert isinstance(result, EstimationResult)
        assert result.total_rows == 8000
        assert result.unique_pairs == 2500
    
    def test_estimate_distinct_reduction(self):
        """Test DISTINCT reduction estimation."""
        connector = Mock()
        connector.fetch_data = Mock(return_value=([], [
            {'total_rows': 5000, 'unique_pairs': 1000}]))
        
        estimator = DuckDBEstimator(connector)
        
        query_desc = QueryDescription(
            target_table='events',
            dimensions=[
                Dimension(field='x_coord', flavour='continuous', axis='x'),
                Dimension(field='y_coord', flavour='continuous', axis='y')
            ],
            measures=[]
        )
        
        table = Table('events')
        query = Query.from_(table).select(table.x_coord, table.y_coord)
        
        reduction = estimator.estimate_distinct_reduction(query, query_desc, table)
        
        assert reduction == pytest.approx(0.8, abs=0.01)
    
    def test_builds_correct_sql_for_pairs(self):
        """Test that SQL is built correctly for pair estimation."""
        connector = Mock()
        connector.fetch_data = Mock(return_value=([], [
            {'total_rows': 2000, 'unique_pairs': 800}]))
        
        estimator = DuckDBEstimator(connector)
        
        query_desc = QueryDescription(
            target_table='measurements',
            dimensions=[
                Dimension(field='temp', flavour='continuous', axis='x'),
                Dimension(field='pressure', flavour='continuous', axis='y')
            ],
            measures=[]
        )
        
        table = Table('measurements')
        query = Query.from_(table).select(table.temp, table.pressure)
        
        estimator.estimate_result_size(query, query_desc, table)
        
        assert connector.fetch_data.called
        sql = connector.fetch_data.call_args[0][0]
        
        assert 'approx_count_distinct' in sql.lower()
        assert 'row' in sql.lower()
    
    def test_handles_estimation_error(self):
        """Test graceful handling of estimation errors."""
        connector = Mock()
        connector.execute_query = Mock(side_effect=Exception("Connection failed"))
        
        estimator = DuckDBEstimator(connector)
        
        query_desc = QueryDescription(
            target_table='data',
            dimensions=[
                Dimension(field='a', flavour='continuous', axis='x'),
                Dimension(field='b', flavour='continuous', axis='y')
            ],
            measures=[]
        )
        
        table = Table('data')
        query = Query.from_(table).select(table.a, table.b)
        
        result = estimator.estimate_result_size(query, query_desc, table)
        
        assert result.total_rows == 0


class TestEstimatorIntegration:
    """Integration tests for estimator selection in QueryOptimizer."""
    
    def test_optimizer_selects_clickhouse_estimator(self):
        """Test that optimizer selects ClickHouseEstimator for ClickHouse connectors."""
        from services.optimization.optimizer import QueryOptimizer
        
        connector = Mock()
        connector.__class__.__name__ = 'ClickHouseConnector'
        
        optimizer = QueryOptimizer(connector=connector)
        
        assert isinstance(optimizer.estimator, ClickHouseEstimator)
    
    def test_optimizer_selects_duckdb_estimator(self):
        """Test that optimizer selects DuckDBEstimator for DuckDB connectors."""
        from services.optimization.optimizer import QueryOptimizer
        
        connector = Mock()
        connector.__class__.__name__ = 'DuckDBConnector'
        
        optimizer = QueryOptimizer(connector=connector)
        
        assert isinstance(optimizer.estimator, DuckDBEstimator)
    
    def test_optimizer_selects_duckdb_for_file_connector(self):
        """Test that optimizer selects DuckDBEstimator for FileConnector."""
        from services.optimization.optimizer import QueryOptimizer
        
        connector = Mock()
        connector.__class__.__name__ = 'FileConnector'
        
        optimizer = QueryOptimizer(connector=connector)
        
        assert isinstance(optimizer.estimator, DuckDBEstimator)
    
    def test_strategy_uses_estimator(self):
        """Test that DistinctPairStrategy uses estimator when provided."""
        from services.optimization.strategies.distinct_pairs import DistinctPairStrategy
        
        connector = Mock()
        connector.fetch_data = Mock(return_value=([], [
            {'total_rows': 10000, 'unique_pairs': 2000}]))
        
        estimator = ClickHouseEstimator(connector)
        strategy = DistinctPairStrategy(db_type='clickhouse', estimator=estimator)
        
        query_desc = QueryDescription(
            target_table='test',
            dimensions=[
                Dimension(field='x', flavour='continuous', axis='x'),
                Dimension(field='y', flavour='continuous', axis='y')
            ],
            measures=[]
        )
        
        table = Table('test')
        query = Query.from_(table).select(table.x, table.y)
        
        strategy.apply(query, query_desc, table)
        
        metadata = strategy.get_metadata()
        
        assert metadata.estimated_reduction == pytest.approx(0.8, abs=0.01)
        assert metadata.parameters['estimation_method'] == 'database_specific'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
