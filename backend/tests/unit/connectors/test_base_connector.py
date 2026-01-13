"""Unit tests for connector base class and abstract methods."""

import pytest
import pyarrow as pa
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Tuple

from backend.connectors.base import BaseConnector
from backend.models.data_source import Database, Table, Column


class ConcreteConnector(BaseConnector):
    """Concrete implementation for testing abstract methods."""
    
    def __init__(self):
        self.connected = False
    
    def connect(self, connection_details: Dict[str, Any]) -> None:
        self.connected = True
    
    def disconnect(self) -> None:
        self.connected = False
    
    def list_databases(self) -> List[Database]:
        return [
            Database(name='db1'),
            Database(name='db2'),
        ]
    
    def list_tables(self, database: str) -> List[Table]:
        return [
            Table(name='table1'),
            Table(name='table2'),
        ]
    
    def list_columns(self, database: str, table: str) -> List[Column]:
        return [
            Column(name='id', data_type='INT'),
            Column(name='name', data_type='STRING'),
            Column(name='value', data_type='DOUBLE'),
        ]
    
    def fetch_data(self, query: str) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
        columns = [
            {'name': 'id', 'type': 'INT'},
            {'name': 'name', 'type': 'STRING'},
            {'name': 'value', 'type': 'DOUBLE'},
        ]
        rows = [
            {'id': 1, 'name': 'Alice', 'value': 100.0},
            {'id': 2, 'name': 'Bob', 'value': 200.0},
            {'id': 3, 'name': 'Charlie', 'value': 300.0},
        ]
        return columns, rows


class TestBaseConnectorAbstractMethods:
    """Tests for BaseConnector abstract method enforcement."""
    
    def test_cannot_instantiate_abstract_class(self):
        """Test that BaseConnector cannot be instantiated directly."""
        with pytest.raises(TypeError):
            BaseConnector()
    
    def test_concrete_implementation_instantiates(self):
        """Test that concrete implementation can be instantiated."""
        connector = ConcreteConnector()
        assert connector is not None
    
    def test_connect_disconnect(self):
        """Test connect/disconnect lifecycle."""
        connector = ConcreteConnector()
        assert not connector.connected
        
        connector.connect({'dummy': 'config'})
        assert connector.connected
        
        connector.disconnect()
        assert not connector.connected


class TestBaseConnectorDataFetching:
    """Tests for connector data fetching methods."""
    
    def test_fetch_data_returns_columns_and_rows(self):
        """Test that fetch_data returns proper structure."""
        connector = ConcreteConnector()
        columns, rows = connector.fetch_data("SELECT * FROM table1")
        
        assert len(columns) == 3
        assert columns[0]['name'] == 'id'
        assert len(rows) == 3
        assert rows[0]['id'] == 1
        assert rows[0]['name'] == 'Alice'
    
    def test_list_databases(self):
        """Test listing databases."""
        connector = ConcreteConnector()
        databases = connector.list_databases()
        
        assert len(databases) == 2
        assert databases[0].name == 'db1'
        assert databases[1].name == 'db2'
    
    def test_list_tables(self):
        """Test listing tables in a database."""
        connector = ConcreteConnector()
        tables = connector.list_tables('db1')
        
        assert len(tables) == 2
        assert tables[0].name == 'table1'
    
    def test_list_columns(self):
        """Test listing columns in a table."""
        connector = ConcreteConnector()
        columns = connector.list_columns('db1', 'table1')
        
        assert len(columns) == 3
        assert columns[0].name == 'id'
        assert columns[0].data_type == 'INT'
        assert columns[1].name == 'name'
        assert columns[1].data_type == 'STRING'


class TestBaseConnectorArrowFallback:
    """Tests for the Arrow fallback implementation in BaseConnector."""
    
    def test_fetch_data_arrow_with_rows(self):
        """Test Arrow conversion from fetch_data with rows."""
        connector = ConcreteConnector()
        arrow_table = connector.fetch_data_arrow("SELECT * FROM table1")
        
        assert isinstance(arrow_table, pa.Table)
        assert arrow_table.num_rows == 3
        assert arrow_table.num_columns == 3
        assert arrow_table.column_names == ['id', 'name', 'value']
        
        # Verify data integrity
        assert arrow_table['id'].to_pylist() == [1, 2, 3]
        assert arrow_table['name'].to_pylist() == ['Alice', 'Bob', 'Charlie']
        assert arrow_table['value'].to_pylist() == [100.0, 200.0, 300.0]
    
    def test_fetch_data_arrow_empty_result(self):
        """Test Arrow conversion from fetch_data with empty result."""
        class EmptyConnector(ConcreteConnector):
            def fetch_data(self, query: str) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
                columns = [
                    {'name': 'id', 'type': 'INT'},
                    {'name': 'name', 'type': 'STRING'},
                ]
                rows = []
                return columns, rows
        
        connector = EmptyConnector()
        arrow_table = connector.fetch_data_arrow("SELECT * FROM empty_table")
        
        assert isinstance(arrow_table, pa.Table)
        assert arrow_table.num_rows == 0
        assert arrow_table.num_columns == 2
        assert arrow_table.column_names == ['id', 'name']
    
    def test_fetch_data_arrow_column_types(self):
        """Test that Arrow schema uses appropriate types."""
        connector = ConcreteConnector()
        arrow_table = connector.fetch_data_arrow("SELECT * FROM table1")
        
        schema = arrow_table.schema
        # PyArrow infers types from Python objects
        # Our test data has int, string, float which PyArrow will infer correctly
        assert schema.field('id').type in (pa.int64(), pa.int32())
        assert schema.field('name').type == pa.string()
        assert schema.field('value').type in (pa.float64(), pa.float32())
    
    def test_fetch_data_arrow_single_row(self):
        """Test Arrow conversion with single row."""
        class SingleRowConnector(ConcreteConnector):
            def fetch_data(self, query: str) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
                columns = [
                    {'name': 'id', 'type': 'INT'},
                    {'name': 'value', 'type': 'DOUBLE'},
                ]
                rows = [{'id': 42, 'value': 3.14}]
                return columns, rows
        
        connector = SingleRowConnector()
        arrow_table = connector.fetch_data_arrow("SELECT * FROM test")
        
        assert arrow_table.num_rows == 1
        assert arrow_table.num_columns == 2
    
    def test_fetch_data_arrow_mixed_types_preserved_as_string(self):
        """Test that mixed column types are handled in fallback."""
        class MixedTypesConnector(ConcreteConnector):
            def fetch_data(self, query: str) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
                columns = [
                    {'name': 'col1', 'type': 'INT'},
                    {'name': 'col2', 'type': 'DOUBLE'},
                    {'name': 'col3', 'type': 'BOOLEAN'},
                    {'name': 'col4', 'type': 'STRING'},
                ]
                rows = [
                    {'col1': 1, 'col2': 1.5, 'col3': True, 'col4': 'text'},
                    {'col1': 2, 'col2': 2.5, 'col3': False, 'col4': 'more'},
                ]
                return columns, rows
        
        connector = MixedTypesConnector()
        arrow_table = connector.fetch_data_arrow("SELECT * FROM mixed")
        
        assert arrow_table.num_rows == 2
        assert arrow_table.num_columns == 4
        # PyArrow infers appropriate types from the Python data
        # col1 and col2 should be numeric, col4 should be string
        schema = arrow_table.schema
        assert schema.field('col1').type in (pa.int64(), pa.int32())  # integers
        assert schema.field('col2').type in (pa.float64(), pa.float32())  # floats
        assert schema.field('col4').type == pa.string()  # strings


class TestConnectorIntegration:
    """Integration tests for connector workflows."""
    
    def test_connect_list_databases_disconnect_workflow(self):
        """Test typical connector workflow: connect -> list -> disconnect."""
        connector = ConcreteConnector()
        
        connector.connect({'host': 'localhost', 'port': 5432})
        assert connector.connected
        
        databases = connector.list_databases()
        assert len(databases) > 0
        
        connector.disconnect()
        assert not connector.connected
    
    def test_fetch_data_after_connect(self):
        """Test that fetch_data works after connect."""
        connector = ConcreteConnector()
        connector.connect({})
        
        columns, rows = connector.fetch_data("SELECT * FROM table1")
        assert len(columns) > 0
        assert len(rows) > 0
    
    def test_multiple_queries_same_connection(self):
        """Test multiple queries on same connection."""
        connector = ConcreteConnector()
        connector.connect({})
        
        # First query
        columns1, rows1 = connector.fetch_data("SELECT * FROM table1")
        assert len(rows1) == 3
        
        # Second query
        columns2, rows2 = connector.fetch_data("SELECT * FROM table2")
        assert len(columns2) > 0
        
        # Connection should still be active
        assert connector.connected
        
        connector.disconnect()
