"""Connector for ClickHouse database."""
from typing import List, Dict, Any, Tuple
from clickhouse_driver import Client
from backend.models.data_source import Database, Table, Column
from .base import BaseConnector

class ClickHouseConnector(BaseConnector):
    def __init__(self):
        self.client: Client = None
        self.connection_details: Dict[str, Any] = None

    def connect(self, connection_details: Dict[str, Any]) -> None:
        self.connection_details = connection_details
        try:
            # Expecting connection_string like 'clickhouse://user:password@host:port/database'
            # Or dictionary like {'host': 'localhost', 'port': 9000, 'user': 'default', 'password': '', 'database': 'default'}
            if 'connection_string' in self.connection_details:
                self.client = Client.from_url(self.connection_details['connection_string'])
            else:
                self.client = Client(**self.connection_details)
            self.client.execute('SELECT 1') # Test connection
        except Exception as e:
            self.client = None
            raise ConnectionError(f"Failed to connect to ClickHouse: {e}")

    def disconnect(self) -> None:
        if self.client:
            # Clickhouse-driver doesn't have an explicit close, connection is managed per query.
            # Setting client to None indicates disconnected state.
            self.client = None
        self.connection_details = None

    def list_databases(self) -> List[Database]:
        if not self.client:
            raise ConnectionError("Not connected to ClickHouse.")
        try:
            result = self.client.execute('SHOW DATABASES')
            return [Database(name=row[0]) for row in result]
        except Exception as e:
            raise RuntimeError(f"Error listing databases: {e}")

    def list_tables(self, database: str) -> List[Table]:
        if not self.client:
            raise ConnectionError("Not connected to ClickHouse.")
        if not database:
             raise ValueError("Database name must be provided for ClickHouse.")
        try:
            # Ensure database name is safely handled (basic check)
            if not database.isidentifier():
                raise ValueError(f"Invalid database name: {database}")
            query = f'SHOW TABLES FROM `{database}`'
            result = self.client.execute(query)
            print(result)
            return [Table(name=row[0]) for row in result]
        except Exception as e:
            raise RuntimeError(f"Error listing tables in database {database}: {e}")

    def list_columns(self, database: str, table: str) -> List[Column]:
        if not self.client:
            raise ConnectionError("Not connected to ClickHouse.")
        if not database or not table:
            raise ValueError("Database and table names must be provided.")

        try:
             # Ensure database and table names are safely handled (basic check)
            if not database.isidentifier() or not table.isidentifier():
                raise ValueError(f"Invalid database or table name: {database}.{table}")

            query = f'DESCRIBE TABLE `{database}`.`{table}`'
            result = self.client.execute(query)
            # result format: [(name, type, default_type, default_expression, comment, codec_expression, ttl_expression)]
            columns = []
            for row in result:
                # Extract relevant info (name, type)
                col_name = row[0]
                col_type = row[1]
                # Add more details if needed from the row tuple
                columns.append(Column(name=col_name, data_type=col_type))
            return columns
        except Exception as e:
            raise RuntimeError(f"Error describing table {database}.{table}: {e}")

    def fetch_data(self, query: str) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
        """Executes a SQL query on ClickHouse and returns column definitions and rows."""
        if not self.client:
            raise ConnectionError("Not connected to ClickHouse.")

        try:
            # Execute the query with column information
            # result_with_columns: Tuple[list, Tuple[Tuple[str, str], ...]]
            result, column_info = self.client.execute(query, with_column_types=True)

            # Format column definitions
            columns = []
            if column_info:
                columns = [{'name': col_name, 'type': col_type} for col_name, col_type in column_info]

            # Format rows into dictionaries
            rows = []
            if result and columns:
                col_names = [col['name'] for col in columns]
                for row_tuple in result:
                    rows.append(dict(zip(col_names, row_tuple)))

            return columns, rows

        except Exception as e:
            # Catch specific ClickHouse errors if possible, otherwise raise generic
            # Log the failing query for easier debugging
            print(f"Error executing ClickHouse query: {query}\nError: {e}") # Basic logging
            # Re-raise as a runtime error for the API layer to handle
            raise RuntimeError(f"Error executing query: {e}")