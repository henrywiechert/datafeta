"""Connector for file-based data sources using DuckDB."""
import logging
import duckdb
import os
from typing import List, Dict, Any, Tuple, Optional
from backend.models.data_source import Database, Table, Column
from .base import BaseConnector
from backend.exceptions import DataSourceConnectionError, InvalidInputError, QueryExecutionError
from backend.dependencies import ConnectionStateManager

logger = logging.getLogger(__name__)

class FileConnector(BaseConnector):
    """Connector for querying files (CSV, JSON, etc.) using DuckDB."""
    def __init__(self, state_manager: ConnectionStateManager):
        self.file_path: Optional[str] = None
        self._table_name: Optional[str] = None
        self._file_type: Optional[str] = None
        # The state_manager is no longer needed here, but we'll leave it
        # in the signature to avoid breaking the router dependency for now.
        # It can be cleaned up in a future refactor.
        self.state_manager = state_manager

    def connect(self, connection_details: Dict[str, Any]) -> None:
        self.file_path = connection_details.get("file_path")
        if not self.file_path or not os.path.exists(self.file_path):
            raise DataSourceConnectionError(f"Temporary file not found or inaccessible at {self.file_path}")

        _, file_ext = os.path.splitext(self.file_path)
        file_ext = file_ext.lower()
        if file_ext == '.csv':
            self._file_type = 'csv'
        else:
             raise InvalidInputError(f"Unsupported file type: {file_ext}")

        self._table_name = os.path.splitext(os.path.basename(self.file_path))[0]
        logger.info(f"FileConnector 'connected' to {self._file_type} file: {self.file_path}")

    def disconnect(self) -> None:
        logger.info(f"FileConnector disconnected signal received for file: {self.file_path}")
        self.file_path = None

    def list_databases(self) -> List[Database]:
        return []

    def list_tables(self, database: str = None) -> List[Table]:
        if self._table_name:
            return [Table(name=self._table_name)]
        return []

    def list_columns(self, database: str = None, table: str = None) -> List[Column]:
        if not self.file_path:
            raise DataSourceConnectionError("Not connected (file path is missing).")
        if table != self._table_name:
            raise InvalidInputError(f"Requested table '{table}' does not match connected file '{self._table_name}'")

        con = None
        try:
            # Create a new connection for this request
            con = duckdb.connect(database=':memory:', read_only=False)
            safe_view_name = f'"{self._table_name}"'
            file_reader = f"read_csv_auto('{self.file_path}', SAMPLE_SIZE=-1, nullstr='NaN')"
            create_view_sql = f"CREATE OR REPLACE TEMPORARY VIEW {safe_view_name} AS SELECT * FROM {file_reader};"
            con.execute(create_view_sql)

            # Describe the view
            describe_query = f"DESCRIBE {safe_view_name};"
            logger.debug(f"Executing describe query on view: {describe_query}")
            result = con.execute(describe_query).fetchall()
            columns = [Column(name=row[0], data_type=row[1]) for row in result]
            return columns
        except Exception as e:
            logger.exception(f"Error describing view {self._table_name} with DuckDB")
            raise DataSourceConnectionError(f"Failed to list columns from file view {self._table_name}: {e}")
        finally:
            if con:
                con.close()

    def fetch_data(self, query: str) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
        if not self.file_path or not self._table_name:
            raise DataSourceConnectionError("Not connected to a file.")

        con = None
        try:
            # Create a new connection for this request
            con = duckdb.connect(database=':memory:', read_only=False)
            safe_view_name = f'"{self._table_name}"'
            file_reader = f"read_csv_auto('{self.file_path}', SAMPLE_SIZE=-1, nullstr='NaN')"
            create_view_sql = f"CREATE OR REPLACE TEMPORARY VIEW {safe_view_name} AS SELECT * FROM {file_reader};"
            con.execute(create_view_sql)

            # Execute query against the view
            logger.debug(f"Executing query against view `{self._table_name}`: {query}")
            result_relation = con.execute(query)
            arrow_table = result_relation.fetch_arrow_table()
            
            columns = []
            if arrow_table.schema:
                for i in range(len(arrow_table.schema)):
                    field = arrow_table.schema.field(i)
                    columns.append({'name': field.name, 'type': str(field.type)})
            rows = arrow_table.to_pylist()
            
            logger.debug(f"Fetch data returning {len(columns)} columns and {len(rows)} rows.")
            return columns, rows

        except Exception as e:
            logger.exception(f"Error executing query on file view {self._table_name}")
            raise QueryExecutionError(f"Failed to execute query on {self._file_type} file: {e}")
        finally:
            if con:
                con.close()