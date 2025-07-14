"""Connector for ClickHouse database using HTTP protocol."""
import logging
from typing import List, Dict, Any, Tuple
import clickhouse_connect
from clickhouse_connect.driver.client import Client
from backend.models.data_source import Database, Table, Column
from .base import BaseConnector
from backend.exceptions import DataSourceConnectionError, QueryExecutionError, InvalidInputError

# Get logger for this module
logger = logging.getLogger(__name__)

class ClickHouseConnector(BaseConnector):
    def __init__(self):
        self.client: Client = None
        self.connection_details: Dict[str, Any] = None

    def connect(self, connection_details: Dict[str, Any]) -> None:
        self.connection_details = connection_details
        try:
            # Handle both connection string and individual parameters
            if 'connection_string' in self.connection_details:
                # Assuming format: 'http://user:password@host:8123/database'
                self.client = clickhouse_connect.get_client(
                    dsn=self.connection_details['connection_string']
                )
            else:
                # Ensure port is set to HTTP port if not specified
                conn_params = self.connection_details.copy()
                conn_params.setdefault('port', 8123)
                self.client = clickhouse_connect.get_client(**conn_params)
            
            # Test connection
            self.client.query('SELECT 1')
        except Exception as e:
            self.client = None
            raise DataSourceConnectionError(f"Failed to connect: {e}")

    def disconnect(self) -> None:
        if self.client:
            self.client.close()
            self.client = None
        self.connection_details = None

    def list_databases(self) -> List[Database]:
        if not self.client:
            raise DataSourceConnectionError("Not connected to ClickHouse.")
        try:
            result = self.client.query('SHOW DATABASES')
            return [Database(name=row[0]) for row in result.result_rows]
        except Exception as e:
            raise DataSourceConnectionError(f"Error listing databases: {e}")

    def list_tables(self, database: str) -> List[Table]:
        if not self.client:
            raise DataSourceConnectionError("Not connected to ClickHouse.")
        if not database:
             raise ValueError("Database name must be provided for ClickHouse.")
        try:
            # Allow any database name that can be properly escaped with backticks
            # This is more permissive than isidentifier() and allows names like "20240617_ABIO_ABIP_COMPARISON"
            # Only disallow truly problematic characters like backticks in the name itself
            if '`' in database:
                raise ValueError(f"Invalid database name (contains backtick): {database}")
            query = f'SHOW TABLES FROM `{database}`'
            result = self.client.query(query)
            return [Table(name=row[0]) for row in result.result_rows]
        except ValueError as e:
             raise InvalidInputError(str(e))
        except Exception as e:
            raise DataSourceConnectionError(f"Error listing tables in database {database}: {e}")

    def list_columns(self, database: str, table: str) -> List[Column]:
        if not self.client:
            raise DataSourceConnectionError("Not connected to ClickHouse.")
        if not database or not table:
            raise ValueError("Database and table names must be provided.")

        try:
            # More permissive validation for database and table names
            # Only disallow truly problematic characters like backticks in the name itself
            if '`' in database or '`' in table:
                raise ValueError(f"Invalid database or table name (contains backtick): {database}.{table}")

            query = f'DESCRIBE TABLE `{database}`.`{table}`'
            result = self.client.query(query)
            columns = []
            for row in result.result_rows:
                col_name = row[0]
                col_type = row[1]
                columns.append(Column(name=col_name, data_type=col_type))
            return columns
        except ValueError as e:
            raise InvalidInputError(str(e))
        except Exception as e:
            raise DataSourceConnectionError(f"Error describing table {database}.{table}: {e}")

    def fetch_data(self, query: str) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
        """Executes a SQL query on ClickHouse and returns column definitions and rows."""
        if not self.client:
            raise DataSourceConnectionError("Not connected to ClickHouse.")
        logger.info(f"Executing ClickHouse query: {query}")
        try:
            result = self.client.query(query)
            
            # Format column definitions
            if hasattr(result, 'columns') and result.columns:
                columns = [{'name': col.name, 'type': col.type} for col in result.columns]
            else:
                columns = [{'name': name, 'type': 'unknown'} for name in result.column_names]

            logger.debug(f"Formatted columns: {columns}")

            # Format rows into dictionaries
            rows = [dict(zip(result.column_names, row)) for row in result.result_rows]
            logger.debug(f"Returning {len(rows)} rows.")

            return columns, rows
        except Exception as e:
            logger.exception(f"Error executing ClickHouse query (details above)")
            raise QueryExecutionError(str(e))