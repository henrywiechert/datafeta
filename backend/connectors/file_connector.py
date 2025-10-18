"""Connector for file-based data sources using DuckDB."""
import logging
import duckdb
import os
from typing import List, Dict, Any, Tuple, Optional
from backend.models.data_source import Database, Table, Column
from .base import BaseConnector
from backend.exceptions import DataSourceConnectionError, InvalidInputError, QueryExecutionError
from backend.dependencies import ConnectionStateManager
from backend.utils.type_conversion import process_query_result_data

logger = logging.getLogger(__name__)

class FileConnector(BaseConnector):
    """Connector for querying files (CSV, JSON, etc.) using DuckDB."""
    def __init__(self, state_manager: ConnectionStateManager):
        self.file_path: Optional[str] = None
        self._table_name: Optional[str] = None
        self._file_type: Optional[str] = None
        self._csv_config: Dict[str, Any] = {}
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
            # Store CSV configuration from connection details
            self._csv_config = {
                'delimiter': connection_details.get('csv_delimiter', ','),
                'header': connection_details.get('csv_has_header', True),
                'decimal_separator': connection_details.get('csv_decimal_separator', '.'),
                'thousands_separator': connection_details.get('csv_thousands_separator', ''),
                'date_format': connection_details.get('csv_date_format', '%Y-%m-%d'),
                'timestamp_format': connection_details.get('csv_timestamp_format', '%Y-%m-%d %H:%M:%S'),
            }
        else:
             raise InvalidInputError(f"Unsupported file type: {file_ext}")

        self._table_name = os.path.splitext(os.path.basename(self.file_path))[0]
        logger.info(f"FileConnector 'connected' to {self._file_type} file: {self.file_path}")

    def disconnect(self) -> None:
        logger.info(f"FileConnector disconnected signal received for file: {self.file_path}")
        self.file_path = None

    def _build_csv_reader_sql(self) -> str:
        """Build DuckDB read_csv_auto SQL function call with proper parameter escaping."""
        # Build parameters for read_csv_auto function
        params = []
        
        # Delimiter
        delimiter = self._csv_config.get('delimiter', ',')
        if delimiter == '\\t':
            delimiter = '\t'
        # Escape single quotes in delimiter
        delimiter_escaped = delimiter.replace("'", "''")
        params.append(f"delim='{delimiter_escaped}'")
        
        # Header
        header = self._csv_config.get('header', True)
        params.append(f"header={str(header).lower()}")
        
        # Decimal separator
        decimal_sep = self._csv_config.get('decimal_separator', '.')
        decimal_escaped = decimal_sep.replace("'", "''")
        params.append(f"decimal_separator='{decimal_escaped}'")
        
        # Note: DuckDB's read_csv_auto() does NOT support a thousands_separator parameter.
        # Thousands separators in quoted numbers (e.g., "217,351") are typically kept as strings
        # by DuckDB. For proper numeric parsing with thousands separators, consider:
        # 1. Pre-process the CSV to remove thousands separators
        # 2. Use column type casting after reading (if column is detected as string)
        # 3. Let users manually configure column types via frontend
        # For now, we store the config for potential future use but don't pass it to DuckDB
        
        # Date and timestamp formats - escape any single quotes
        date_fmt = self._csv_config.get('date_format', '%Y-%m-%d')
        timestamp_fmt = self._csv_config.get('timestamp_format', '%Y-%m-%d %H:%M:%S')
        
        date_fmt_escaped = date_fmt.replace("'", "''")
        timestamp_fmt_escaped = timestamp_fmt.replace("'", "''")
        
        params.append(f"dateformat='{date_fmt_escaped}'")
        params.append(f"timestampformat='{timestamp_fmt_escaped}'")
        
        # Sample size and null handling
        params.append("sample_size=1000")
        
        # Build the complete function call
        params_str = ', '.join(params)
        return f"read_csv_auto('{self.file_path}', {params_str}, nullstr=['', 'NULL', 'null', 'NaN', 'nan', 'N/A', 'n/a', 'NA'])"

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
            
            # Build CSV reader SQL with proper escaping
            csv_reader_sql = self._build_csv_reader_sql()
            
            # Create a view from the CSV
            create_view_sql = f"CREATE OR REPLACE TEMPORARY VIEW {safe_view_name} AS SELECT * FROM {csv_reader_sql};"
            logger.debug(f"Creating view with SQL: {create_view_sql}")
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
            
            # Build CSV reader SQL with proper escaping
            csv_reader_sql = self._build_csv_reader_sql()
            
            # Create a view from the CSV
            create_view_sql = f"CREATE OR REPLACE TEMPORARY VIEW {safe_view_name} AS SELECT * FROM {csv_reader_sql};"
            logger.debug(f"Creating view with SQL: {create_view_sql}")
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
            
            # Convert any Decimal types to floats for JSON serialization compatibility
            rows = process_query_result_data(rows)
            
            logger.debug(f"Fetch data returning {len(columns)} columns and {len(rows)} rows.")
            return columns, rows

        except Exception as e:
            logger.exception(f"Error executing query on file view {self._table_name}")
            raise QueryExecutionError(f"Failed to execute query on {self._file_type} file: {e}")
        finally:
            if con:
                con.close()