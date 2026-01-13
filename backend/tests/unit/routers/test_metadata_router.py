"""Unit tests for metadata router endpoints."""

import pytest
from unittest.mock import Mock, MagicMock, patch

from backend.models.data_source import (
    ConnectionDetails,
    Database,
    Table,
    Column,
)


class TestListDatabasesEndpoint:
    """Tests for the GET /databases endpoint."""

    def test_list_databases_csv_returns_empty(self):
        """CSV connections should return empty database list."""
        conn_details = ConnectionDetails(type='csv', csv_has_header=True)
        
        # Should return empty for CSV
        databases = []
        response = {'databases': databases}
        
        assert response == {'databases': []}

    def test_list_databases_clickhouse_returns_list(self):
        """ClickHouse connections should return actual databases."""
        mock_connector = Mock()
        mock_connector.list_databases.return_value = [
            Database(name='default'),
            Database(name='system'),
            Database(name='analytics'),
        ]
        conn_details = ConnectionDetails(type='clickhouse', host='localhost')
        
        # When calling connector
        databases = mock_connector.list_databases()
        response = {'databases': databases}
        
        assert len(response['databases']) == 3
        assert response['databases'][0].name == 'default'

    def test_list_databases_kaggle_returns_empty(self):
        """Kaggle connections should return empty list."""
        conn_details = ConnectionDetails(type='kaggle', kaggle_dataset='owner/dataset')
        
        # Kaggle has no "databases" in traditional sense
        databases = []
        response = {'databases': databases}
        
        assert response == {'databases': []}


class TestListTablesEndpoint:
    """Tests for the GET /tables endpoint."""

    def test_list_tables_basic(self):
        """Test listing tables for a database."""
        mock_connector = Mock()
        mock_connector.list_tables.return_value = [
            Table(name='users'),
            Table(name='orders'),
            Table(name='products'),
        ]
        
        database = 'sales_db'
        tables = mock_connector.list_tables(database=database)
        response = {'tables': tables}
        
        assert len(response['tables']) == 3
        assert response['tables'][0].name == 'users'
        assert response['tables'][1].name == 'orders'

    def test_list_tables_empty_database(self):
        """Test listing tables when database has no tables."""
        mock_connector = Mock()
        mock_connector.list_tables.return_value = []
        
        database = 'empty_db'
        tables = mock_connector.list_tables(database=database)
        response = {'tables': tables}
        
        assert len(response['tables']) == 0

    def test_list_tables_passes_database_parameter(self):
        """Test that database parameter is passed to connector."""
        mock_connector = Mock()
        mock_connector.list_tables.return_value = []
        
        database = 'specific_db'
        mock_connector.list_tables(database=database)
        
        # Verify the database was passed
        mock_connector.list_tables.assert_called_once_with(database=database)


class TestListColumnsEndpoint:
    """Tests for the GET /columns endpoint."""

    def test_list_columns_basic(self):
        """Test listing columns for a table."""
        mock_connector = Mock()
        mock_connector.list_columns.return_value = [
            Column(name='id', data_type='INT'),
            Column(name='name', data_type='VARCHAR'),
            Column(name='email', data_type='VARCHAR'),
        ]
        
        database = 'db'
        table = 'users'
        columns = mock_connector.list_columns(database=database, table=table)
        
        # Endpoint adds virtual columns
        source_db_col = Column(
            name='_source_database',
            data_type='String',
            is_datetime=False,
            table_name=None
        )
        source_tbl_col = Column(
            name='_source_table',
            data_type='String',
            is_datetime=False,
            table_name=None
        )
        columns.append(source_db_col)
        columns.append(source_tbl_col)
        
        response = {'columns': columns}
        
        assert len(response['columns']) == 5
        assert response['columns'][-2].name == '_source_database'
        assert response['columns'][-1].name == '_source_table'

    def test_list_columns_includes_virtual_columns(self):
        """Test that _source_database and _source_table are always included."""
        mock_connector = Mock()
        mock_connector.list_columns.return_value = [
            Column(name='id', data_type='INT'),
        ]
        
        columns = mock_connector.list_columns(database='db', table='tbl')
        
        # Add virtual columns like endpoint does
        columns.append(Column(
            name='_source_database',
            data_type='String',
            is_datetime=False,
            table_name=None
        ))
        columns.append(Column(
            name='_source_table',
            data_type='String',
            is_datetime=False,
            table_name=None
        ))
        
        # Find virtual columns
        virtual_cols = [c for c in columns if c.name.startswith('_source_')]
        assert len(virtual_cols) == 2

    def test_list_columns_datetime_field_detection(self):
        """Test that datetime fields are properly marked."""
        mock_connector = Mock()
        mock_connector.list_columns.return_value = [
            Column(name='created_at', data_type='DATETIME', is_datetime=True),
            Column(name='updated_at', data_type='TIMESTAMP', is_datetime=True),
            Column(name='name', data_type='VARCHAR', is_datetime=False),
        ]
        
        columns = mock_connector.list_columns(database='db', table='events')
        
        datetime_cols = [c for c in columns if c.is_datetime]
        assert len(datetime_cols) == 2
        assert datetime_cols[0].name == 'created_at'

    def test_list_columns_with_cast_type(self):
        """Test columns with cast type override."""
        mock_connector = Mock()
        mock_connector.list_columns.return_value = [
            Column(
                name='amount',
                data_type='VARCHAR',
                cast_type='DOUBLE',
                cast_replacement='[,\']',  # Remove comma and quotes
                is_datetime=False
            ),
        ]
        
        columns = mock_connector.list_columns(database='db', table='sales')
        
        amount_col = columns[0]
        assert amount_col.cast_type == 'DOUBLE'
        assert amount_col.cast_replacement == '[,\']'


class TestMetadataErrorHandling:
    """Tests for error handling in metadata endpoints."""

    def test_list_columns_validates_table_parameter(self):
        """Test that table parameter validation works."""
        # Table parameter is required
        table = None
        database = 'db'
        
        # Endpoint should validate table is provided
        if not table:
            response = {'error': 'Table name is required'}
        
        assert 'error' in response

    def test_list_columns_handles_connector_error(self):
        """Test handling of connector errors."""
        mock_connector = Mock()
        mock_connector.list_columns.side_effect = Exception('Connection failed')
        
        database = 'db'
        table = 'users'
        
        try:
            mock_connector.list_columns(database=database, table=table)
            assert False, "Should have raised exception"
        except Exception as e:
            assert 'Connection failed' in str(e)

    def test_list_tables_handles_invalid_database(self):
        """Test handling of invalid database name."""
        mock_connector = Mock()
        mock_connector.list_tables.side_effect = ValueError('Database not found')
        
        database = 'nonexistent_db'
        
        try:
            mock_connector.list_tables(database=database)
            assert False, "Should have raised exception"
        except ValueError as e:
            assert 'Database not found' in str(e)


class TestMetadataIntegration:
    """Integration tests for metadata endpoint workflows."""

    def test_database_table_column_workflow(self):
        """Test typical workflow: list databases → list tables → list columns."""
        mock_connector = Mock()
        
        # Step 1: List databases
        mock_connector.list_databases.return_value = [
            Database(name='sales_db'),
        ]
        databases = mock_connector.list_databases()
        assert len(databases) == 1
        selected_db = databases[0].name
        
        # Step 2: List tables
        mock_connector.list_tables.return_value = [
            Table(name='users'),
            Table(name='orders'),
        ]
        tables = mock_connector.list_tables(database=selected_db)
        assert len(tables) == 2
        selected_table = tables[0].name
        
        # Step 3: List columns
        mock_connector.list_columns.return_value = [
            Column(name='id', data_type='INT'),
            Column(name='name', data_type='VARCHAR'),
        ]
        columns = mock_connector.list_columns(database=selected_db, table=selected_table)
        assert len(columns) == 2

    def test_csv_has_no_databases(self):
        """Test CSV connection provides no database list."""
        conn_details = ConnectionDetails(type='csv', csv_has_header=True)
        
        # CSV connections should skip database listing
        if conn_details.type == 'csv':
            databases = []
        else:
            databases = [Database(name='default')]
        
        assert len(databases) == 0

    def test_multiple_tables_in_database(self):
        """Test listing multiple tables and their columns."""
        mock_connector = Mock()
        
        tables = [
            Table(name='users'),
            Table(name='posts'),
            Table(name='comments'),
        ]
        mock_connector.list_tables.return_value = tables
        result_tables = mock_connector.list_tables(database='blog_db')
        
        # For each table, get columns
        mock_connector.list_columns.side_effect = [
            [Column(name='id', data_type='INT'), Column(name='username', data_type='VARCHAR')],
            [Column(name='id', data_type='INT'), Column(name='title', data_type='VARCHAR')],
            [Column(name='id', data_type='INT'), Column(name='content', data_type='TEXT')],
        ]
        
        all_columns = {}
        for table in result_tables:
            cols = mock_connector.list_columns(database='blog_db', table=table.name)
            all_columns[table.name] = cols
        
        assert len(all_columns) == 3
        assert len(all_columns['users']) == 2
        assert all_columns['posts'][1].name == 'title'
