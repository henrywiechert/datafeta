"""Connector for file-based data sources using DuckDB."""
import logging
import duckdb
import os
import re
from typing import List, Dict, Any, Tuple, Optional, TYPE_CHECKING
from dataclasses import dataclass

import pyarrow as pa

from backend.models.data_source import Database, Table, Column
from .base import BaseConnector
from backend.exceptions import DataSourceConnectionError, InvalidInputError, QueryExecutionError
from backend.utils.type_conversion import process_query_result_data

if TYPE_CHECKING:
    from backend.dependencies import ConnectionStateManager

logger = logging.getLogger(__name__)


@dataclass
class FileInfo:
    """Information about an uploaded file."""
    file_path: str
    table_name: str
    file_type: str  # 'csv' or 'parquet'
    csv_config: Dict[str, Any]  # Only used for CSV files


class FileConnector(BaseConnector):
    """Connector for querying files (CSV, Parquet) using DuckDB."""
    def __init__(self, state_manager: "ConnectionStateManager"):
        # Support for multiple files - each becomes a table
        self._files: List[FileInfo] = []
        # Global CSV config (applied to all CSV files)
        self._global_csv_config: Dict[str, Any] = {}
        # The state_manager is no longer needed here, but we'll leave it
        # in the signature to avoid breaking the router dependency for now.
        # It can be cleaned up in a future refactor.
        self.state_manager = state_manager

    def _sanitize_table_name(self, filename: str) -> str:
        """
        Sanitize a filename to create a valid SQL table name.
        
        - Remove file extension
        - Replace spaces and special characters with underscores
        - Remove consecutive underscores
        - Ensure it doesn't start with a number
        - Convert to lowercase for consistency
        """
        # Remove extension
        name = os.path.splitext(filename)[0]
        
        # Convert to lowercase
        name = name.lower()
        
        # Replace spaces and special characters with underscores
        name = re.sub(r'[^\w]+', '_', name)
        
        # Remove consecutive underscores
        name = re.sub(r'_+', '_', name)
        
        # Remove leading/trailing underscores
        name = name.strip('_')
        
        # Ensure it doesn't start with a number
        if name and name[0].isdigit():
            name = 'table_' + name
        
        # If empty after sanitization, use a default name
        if not name:
            name = 'uploaded_file'
        
        return name

    def connect(self, connection_details: Dict[str, Any]) -> None:
        """
        Connect to one or more files.
        
        Supports two formats in connection_details:
        1. Legacy single-file format:
           - file_path: str
           - original_filename: str (optional)
        2. Multi-file format:
           - file_paths: List[Dict] with keys: file_path, original_filename
        
        CSV configuration is applied globally to all CSV files.
        """
        # Clear any previous files
        self._files = []
        
        # Store global CSV configuration
        self._global_csv_config = {
            'delimiter': connection_details.get('csv_delimiter', ','),
            'header': connection_details.get('csv_has_header', True),
            'decimal_separator': connection_details.get('csv_decimal_separator', '.'),
            'thousands_separator': connection_details.get('csv_thousands_separator', ''),
            'date_format': connection_details.get('csv_date_format', '%Y-%m-%d'),
            'timestamp_format': connection_details.get('csv_timestamp_format', '%Y-%m-%d %H:%M:%S'),
        }
        
        # Check for multi-file format first
        file_paths = connection_details.get("file_paths")
        if file_paths:
            # Multi-file format: List of {file_path, original_filename}
            for file_info in file_paths:
                file_path = file_info.get("file_path")
                original_filename = file_info.get("original_filename")
                self._add_file(file_path, original_filename)
        else:
            # Legacy single-file format
            file_path = connection_details.get("file_path")
            original_filename = connection_details.get('original_filename')
            self._add_file(file_path, original_filename)
        
        if not self._files:
            raise DataSourceConnectionError("No valid files provided for connection")
        
        table_names = [f.table_name for f in self._files]
        file_types = list(set(f.file_type for f in self._files))
        logger.info(f"FileConnector connected to {len(self._files)} file(s): {table_names} (types: {file_types})")
    
    def _add_file(self, file_path: Optional[str], original_filename: Optional[str]) -> None:
        """Add a file to the connector."""
        if not file_path or not os.path.exists(file_path):
            raise DataSourceConnectionError(f"File not found or inaccessible at {file_path}")
        
        _, file_ext = os.path.splitext(file_path)
        file_ext = file_ext.lower()
        
        if file_ext == '.csv':
            file_type = 'csv'
        elif file_ext == '.parquet':
            file_type = 'parquet'
        else:
            raise InvalidInputError(f"Unsupported file type: {file_ext}. Supported: .csv, .parquet")
        
        # Determine table name
        if original_filename:
            table_name = self._sanitize_table_name(original_filename)
        else:
            table_name = os.path.splitext(os.path.basename(file_path))[0]
        
        # Ensure unique table names by appending suffix if needed
        table_name = self._ensure_unique_table_name(table_name)
        
        self._files.append(FileInfo(
            file_path=file_path,
            table_name=table_name,
            file_type=file_type,
            csv_config=self._global_csv_config.copy() if file_type == 'csv' else {},
        ))
    
    def _ensure_unique_table_name(self, table_name: str) -> str:
        """Ensure the table name is unique by appending a suffix if needed."""
        existing_names = {f.table_name for f in self._files}
        if table_name not in existing_names:
            return table_name
        
        # Append numeric suffix
        counter = 2
        while f"{table_name}_{counter}" in existing_names:
            counter += 1
        return f"{table_name}_{counter}"
    
    def _get_file_by_table(self, table_name: str) -> Optional[FileInfo]:
        """Get file info by table name."""
        for f in self._files:
            if f.table_name == table_name:
                return f
        return None

    def disconnect(self) -> None:
        table_names = [f.table_name for f in self._files]
        logger.info(f"FileConnector disconnected signal received for files: {table_names}")
        self._files = []

    def _build_csv_reader_sql(self, file_info: FileInfo) -> str:
        """Build DuckDB read_csv_auto SQL function call with proper parameter escaping."""
        # Build parameters for read_csv_auto function
        params = []
        csv_config = file_info.csv_config
        
        # Delimiter
        delimiter = csv_config.get('delimiter', ',')
        if delimiter == '\\t':
            delimiter = '\t'
        # Escape single quotes in delimiter
        delimiter_escaped = delimiter.replace("'", "''")
        params.append(f"delim='{delimiter_escaped}'")
        
        # Header
        header = csv_config.get('header', True)
        params.append(f"header={str(header).lower()}")
        
        # Decimal separator
        decimal_sep = csv_config.get('decimal_separator', '.')
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
        date_fmt = csv_config.get('date_format', '%Y-%m-%d')
        timestamp_fmt = csv_config.get('timestamp_format', '%Y-%m-%d %H:%M:%S')
        
        date_fmt_escaped = date_fmt.replace("'", "''")
        timestamp_fmt_escaped = timestamp_fmt.replace("'", "''")
        
        params.append(f"dateformat='{date_fmt_escaped}'")
        params.append(f"timestampformat='{timestamp_fmt_escaped}'")
        
        # Sample size and null handling
        params.append("sample_size=1000")
        
        # Build the complete function call
        params_str = ', '.join(params)
        return f"read_csv_auto('{file_info.file_path}', {params_str}, nullstr=['', 'NULL', 'null', 'NaN', 'nan', 'N/A', 'n/a', 'NA'])"

    def _build_parquet_reader_sql(self, file_info: FileInfo) -> str:
        """Build DuckDB read_parquet SQL function call."""
        return f"read_parquet('{file_info.file_path}')"

    def _build_file_reader_sql(self, file_info: FileInfo) -> str:
        """Build the appropriate DuckDB reader SQL based on file type."""
        if file_info.file_type == 'csv':
            return self._build_csv_reader_sql(file_info)
        elif file_info.file_type == 'parquet':
            return self._build_parquet_reader_sql(file_info)
        else:
            raise InvalidInputError(f"Unsupported file type: {file_info.file_type}")

    def list_databases(self) -> List[Database]:
        return []

    def list_tables(self, database: str = None) -> List[Table]:
        """Return all uploaded files as tables."""
        return [Table(name=f.table_name) for f in self._files]

    def list_columns(self, database: str = None, table: str = None) -> List[Column]:
        if not self._files:
            raise DataSourceConnectionError("Not connected (no files loaded).")
        
        file_info = self._get_file_by_table(table)
        if not file_info:
            available_tables = [f.table_name for f in self._files]
            raise InvalidInputError(f"Table '{table}' not found. Available tables: {available_tables}")

        con = None
        try:
            # Create a new connection for this request
            con = duckdb.connect(database=':memory:', read_only=False)
            safe_view_name = f'"{file_info.table_name}"'
            
            # Build file reader SQL based on file type
            reader_sql = self._build_file_reader_sql(file_info)
            
            # Create a view from the file
            create_view_sql = f"CREATE OR REPLACE TEMPORARY VIEW {safe_view_name} AS SELECT * FROM {reader_sql};"
            logger.debug(f"Creating view with SQL: {create_view_sql}")
            con.execute(create_view_sql)

            # Describe the view
            describe_query = f"DESCRIBE {safe_view_name};"
            logger.debug(f"Executing describe query on view: {describe_query}")
            result = con.execute(describe_query).fetchall()
            columns = []
            datetime_types = {'TIMESTAMP', 'DATE', 'TIME', 'TIMESTAMP WITH TIME ZONE'}
            for row in result:
                col_name = row[0]
                col_type = row[1].upper()
                col = Column(name=col_name, data_type=col_type)
                if col_type in datetime_types:
                    col.is_datetime = True
                columns.append(col)
            return columns
        except Exception as e:
            logger.exception(f"Error describing view {file_info.table_name} with DuckDB")
            raise DataSourceConnectionError(f"Failed to list columns from file view {file_info.table_name}: {e}")
        finally:
            if con:
                con.close()

    def _create_all_views(self, con: duckdb.DuckDBPyConnection) -> None:
        """Create views for all uploaded files in the given DuckDB connection."""
        for file_info in self._files:
            safe_view_name = f'"{file_info.table_name}"'
            reader_sql = self._build_file_reader_sql(file_info)
            create_view_sql = f"CREATE OR REPLACE TEMPORARY VIEW {safe_view_name} AS SELECT * FROM {reader_sql};"
            logger.debug(f"Creating view with SQL: {create_view_sql}")
            con.execute(create_view_sql)

    def fetch_data(self, query: str) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
        if not self._files:
            raise DataSourceConnectionError("Not connected to any files.")

        con = None
        try:
            # Create a new connection for this request
            con = duckdb.connect(database=':memory:', read_only=False)
            
            # Create views for all files so query can reference any table
            self._create_all_views(con)

            # Execute query
            table_names = [f.table_name for f in self._files]
            logger.debug(f"Executing query against views {table_names}: {query}")
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
            logger.exception(f"Error executing query on file views")
            file_types = list(set(f.file_type for f in self._files))
            raise QueryExecutionError(f"Failed to execute query on {file_types} file(s): {e}")
        finally:
            if con:
                con.close()

    def fetch_data_arrow(self, query: str) -> pa.Table:
        """
        Executes a query and returns data as an Apache Arrow Table.
        
        This is optimized for DuckDB since it natively produces Arrow tables,
        avoiding the intermediate conversion to Python dicts.

        Args:
            query: The executable query string (SQL).

        Returns:
            PyArrow Table containing the query results.
        """
        if not self._files:
            raise DataSourceConnectionError("Not connected to any files.")

        con = None
        try:
            # Create a new connection for this request
            con = duckdb.connect(database=':memory:', read_only=False)
            
            # Create views for all files so query can reference any table
            self._create_all_views(con)

            # Execute query and get Arrow table directly
            table_names = [f.table_name for f in self._files]
            logger.debug(f"Executing Arrow query against views {table_names}: {query}")
            result_relation = con.execute(query)
            arrow_table = result_relation.fetch_arrow_table()
            
            logger.debug(f"Arrow fetch returning {arrow_table.num_columns} columns and {arrow_table.num_rows} rows.")
            return arrow_table

        except Exception as e:
            logger.exception(f"Error executing Arrow query on file views")
            file_types = list(set(f.file_type for f in self._files))
            raise QueryExecutionError(f"Failed to execute Arrow query on {file_types} file(s): {e}")
        finally:
            if con:
                con.close()