"""Connector for file-based data sources using DuckDB."""
import logging
import duckdb
import os
from typing import List, Dict, Any, Tuple, Optional
from backend.models.data_source import Database, Table, Column
from .base import BaseConnector
from backend.exceptions import DataSourceConnectionError, InvalidInputError, QueryExecutionError

# Import the state manager to get the persistent connection
from backend.dependencies import connection_state_manager

logger = logging.getLogger(__name__)

class FileConnector(BaseConnector):
    """Connector for querying files (CSV, JSON, etc.) using DuckDB."""
    def __init__(self):
        self.file_path: Optional[str] = None
        self._table_name: Optional[str] = None
        self._file_type: Optional[str] = None
        # Removed self.con, will use state_manager.duckdb_connection

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
        # Use double quotes for view name for DuckDB compatibility
        safe_view_name = f'"{self._table_name}"' # Use " quotes

        # Establish connection and create view - store connection in state manager
        try:
            logger.info("Establishing persistent DuckDB connection and creating view...")
            # Create a new read-write connection for view creation
            con = duckdb.connect(database=':memory:', read_only=False)

            if self._file_type == 'csv':
                file_reader = f"read_csv_auto('{self.file_path}', SAMPLE_SIZE=-1, nullstr='NaN')"
            # Add elif for other types later
            else:
                 con.close() # Close connection if file type is wrong
                 raise NotImplementedError(f"View creation not implemented for file type: {self._file_type}")

            # Use the double-quoted view name here
            create_view_sql = f"CREATE OR REPLACE TEMPORARY VIEW {safe_view_name} AS SELECT * FROM {file_reader};"
            logger.debug(f"Creating temporary view: {create_view_sql}")
            con.execute(create_view_sql)

            # === Store connection in State Manager ===
            # Note: We are passing the connection object itself.
            # This assumes the state manager is handled carefully (e.g., singleton).
            connection_state_manager.duckdb_connection = con
            # ==========================================

            logger.info(f"FileConnector connected to {self._file_type} file: {self.file_path}, View: {safe_view_name}")

        except Exception as e:
            logger.exception("Error initializing DuckDB connection or view for file.")
            # Ensure connection is closed if error occurred during setup
            if 'con' in locals() and con:
                 try: con.close() 
                 except: pass
            raise DataSourceConnectionError(f"Failed to initialize DuckDB for file {self.file_path}: {e}")

    def disconnect(self) -> None:
        # Connection closing is now handled by state_manager.clear_state()
        logger.info(f"FileConnector disconnected signal received for file: {self.file_path}")
        self.file_path = None
        self._table_name = None
        self._file_type = None

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

        # Use the persistent connection from the state manager
        con = connection_state_manager.duckdb_connection
        if not con:
             raise DataSourceConnectionError("DuckDB connection not available in state manager.")

        try:
            # Describe the view which should already exist
            safe_view_name = f'"{self._table_name}"'
            describe_query = f"DESCRIBE {safe_view_name};"
            logger.debug(f"Executing describe query on view: {describe_query}")
            result = con.execute(describe_query).fetchall()
            # No need to close con here, it persists
            columns = [Column(name=row[0], data_type=row[1]) for row in result]
            return columns
        except Exception as e:
            logger.exception(f"Error describing view {self._table_name} with DuckDB")
            raise DataSourceConnectionError(f"Failed to list columns from file view {self._table_name}: {e}")

    def fetch_data(self, query: str) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
        if not self.file_path or not self._table_name:
            raise DataSourceConnectionError("Not connected to a file.")

        # Use the persistent connection from the state manager
        con = connection_state_manager.duckdb_connection
        if not con:
             raise DataSourceConnectionError("DuckDB connection not available in state manager.")

        # Execute query directly against the view (already created in connect)
        try:
            logger.debug(f"Executing query against existing view `{self._table_name}`: {query}")
            result_relation = con.execute(query)
            arrow_table = result_relation.fetch_arrow_table()
            # ... (column and row extraction remains the same) ...
            columns = []
            if arrow_table.schema:
                for i in range(len(arrow_table.schema)):
                    field = arrow_table.schema.field(i)
                    columns.append({'name': field.name, 'type': str(field.type)})
            rows = arrow_table.to_pylist()
            # No need to close con here
            logger.debug(f"Fetch data returning {len(columns)} columns and {len(rows)} rows.")
            logger.debug(f"Columns: {columns}")
            logger.debug(f"Rows: {rows}")
            return columns, rows

        except Exception as e:
            logger.exception(f"Error executing query on file view {self._table_name}")
            # Do NOT close the persistent connection here on query failure
            raise QueryExecutionError(f"Failed to execute query on {self._file_type} file: {e}")