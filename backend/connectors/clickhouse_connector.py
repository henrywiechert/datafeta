"""Connector for ClickHouse database using HTTP protocol."""
import logging
from typing import List, Dict, Any, Tuple
import threading
from typing import Optional
from urllib.parse import urlparse, parse_qs
import socket

import pyarrow as pa
import pyarrow.compute as pc
import clickhouse_connect
from clickhouse_connect.driver.client import Client

from backend.models.data_source import Database, Table, Column, ForeignKeyRelationship
from .base import BaseConnector
from .fk_detection import detect_foreign_keys_by_naming_convention
from backend.exceptions import DataSourceConnectionError, QueryExecutionError, InvalidInputError
from backend.utils.type_conversion import process_query_result_data

# Get logger for this module
logger = logging.getLogger(__name__)

class ClickHouseConnector(BaseConnector):
    def __init__(self):
        self.client: Client = None
        self.connection_details: Dict[str, Any] = None
        # Serialize access to the client to avoid concurrent queries in the same session
        self._client_lock: threading.Lock = threading.Lock()

    def _get_current_database_from_client(self) -> Optional[str]:
        """Attempt to read current database name from the server via a simple query."""
        if not self.client:
            return None
        try:
            with self._client_lock:
                result = self.client.query('SELECT currentDatabase()')
            if getattr(result, 'result_rows', None):
                first_row = result.result_rows[0]
                if isinstance(first_row, (list, tuple)) and len(first_row) > 0 and first_row[0]:
                    return str(first_row[0])
        except Exception:
            # swallow and fallback
            return None
        return None

    def _parse_database_from_details(self) -> Optional[str]:
        """Extract database name from connection details or DSN if available."""
        if not self.connection_details:
            return None
        # Direct param
        db = self.connection_details.get('database')
        if db:
            return str(db)
        # DSN param
        dsn = self.connection_details.get('connection_string')
        if not dsn:
            return None
        try:
            parsed = urlparse(dsn)
            # Prefer explicit query param first
            qs = parse_qs(parsed.query)
            query_db = qs.get('database', [None])[0]
            if query_db:
                return str(query_db)
            # Fallback to first path segment if present
            path = (parsed.path or '').lstrip('/')
            if path:
                first_segment = path.split('/')[0]
                if first_segment:
                    return str(first_segment)
        except Exception:
            return None
        return None

    def connect(self, connection_details: Dict[str, Any]) -> None:
        self.connection_details = connection_details
        logger.info(f"ClickHouse connector received connection_details: {connection_details}")
        
        # Set global socket timeout to handle firewall blocking scenarios
        old_timeout = socket.getdefaulttimeout()
        socket.setdefaulttimeout(5)
        
        try:
            # Handle both connection string and individual parameters
            if 'connection_string' in self.connection_details:
                logger.info(f"Using connection string: {self.connection_details['connection_string']}")
                self.client = clickhouse_connect.get_client(
                    dsn=self.connection_details['connection_string'],
                    connect_timeout=5,
                    send_receive_timeout=30
                )
            else:
                conn_params = self.connection_details.copy()
                conn_params.setdefault('port', 8123)
                conn_params.setdefault('connect_timeout', 5)
                conn_params.setdefault('send_receive_timeout', 30)
                logger.info(f"Using connection params (with defaults applied): {conn_params}")
                self.client = clickhouse_connect.get_client(**conn_params)
            
            # Test connection
            with self._client_lock:
                self.client.query('SELECT 1')
        except Exception as e:
            self.client = None
            raise DataSourceConnectionError(f"Failed to connect: {e}")
        finally:
            socket.setdefaulttimeout(old_timeout)

    def disconnect(self) -> None:
        with self._client_lock:
            if self.client:
                try:
                    self.client.close()
                except Exception as e:
                    logger.warning(f"Error closing ClickHouse client: {e}")
                finally:
                    self.client = None
            self.connection_details = None

    def list_databases(self) -> List[Database]:
        if not self.client:
            raise DataSourceConnectionError("Not connected to ClickHouse.")
        try:
            with self._client_lock:
                result = self.client.query('SHOW DATABASES')
            databases = [Database(name=row[0]) for row in result.result_rows]
            # Fallback: if no databases returned (e.g., permissions), include the connected database if available
            if not databases:
                current_db = self._get_current_database_from_client() or self._parse_database_from_details()
                if current_db:
                    return [Database(name=current_db)]
            return databases
        except Exception as e:
            # Graceful fallback to connected database when SHOW DATABASES fails
            current_db = self._get_current_database_from_client() or self._parse_database_from_details()
            if current_db:
                logger.warning(f"SHOW DATABASES failed, falling back to connected database: {e}")
                return [Database(name=current_db)]
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
            with self._client_lock:
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
            with self._client_lock:
                result = self.client.query(query)
            columns = []
            for row in result.result_rows:
                col_name = row[0]
                col_type = row[1]
                col = Column(name=col_name, data_type=col_type)
                if 'DateTime' in col_type or 'Date' in col_type:
                    col.is_datetime = True
                columns.append(col)
            return columns
        except ValueError as e:
            raise InvalidInputError(str(e))
        except Exception as e:
            raise DataSourceConnectionError(f"Error describing table {database}.{table}: {e}")

    def detect_foreign_keys(self, database: str) -> List[ForeignKeyRelationship]:
        """
        Detect potential foreign key relationships in ClickHouse by analyzing column names.
        
        Delegates to the shared naming-convention heuristic after gathering
        the column inventory for each table.
        
        Args:
            database: Database name to analyze
            
        Returns:
            List of detected relationships
        """
        if not self.client:
            raise DataSourceConnectionError("Not connected to ClickHouse.")
        
        try:
            tables = self.list_tables(database)
            
            # Build a map of table -> columns
            table_columns: Dict[str, List[Column]] = {}
            for table in tables:
                try:
                    table_columns[table.name] = self.list_columns(database, table.name)
                except Exception as e:
                    logger.warning(f"Could not list columns for {table.name}: {e}")
                    continue
            
            return detect_foreign_keys_by_naming_convention(table_columns)
            
        except Exception as e:
            logger.warning(f"Error detecting foreign keys in {database}: {e}")
            return []  # Return empty list on error

    def detect_similar_tables(self, database: str, primary_table: str, min_common_columns: int = 3) -> List[str]:
        """
        Detect tables with similar schemas that can be combined with UNION ALL.
        
        Finds tables in the database that have at least min_common_columns in common
        with the primary table (same name AND type). This is useful for:
        - Partitioned tables (e.g., logs_2024_01, logs_2024_02) with identical schemas
        - Related tables with mostly overlapping schemas but some extra columns
        
        Args:
            database: Database name to search
            primary_table: Reference table to compare against
            min_common_columns: Minimum number of common columns required (default: 3)
            
        Returns:
            List of table names with matching schemas (excluding primary table)
        """
        if not self.client:
            raise DataSourceConnectionError("Not connected to ClickHouse.")
        
        try:
            # Get schema of primary table
            primary_columns = self.list_columns(database, primary_table)
            primary_schema = {col.name: col.data_type for col in primary_columns}
            
            logger.info(f"Primary table '{primary_table}' schema: {len(primary_columns)} columns")
            logger.debug(f"Primary schema: {primary_schema}")
            
            # Get all tables in database
            tables = self.list_tables(database)
            logger.info(f"Checking {len(tables)} tables in database '{database}' for similarity (min {min_common_columns} common columns)")
            similar_tables = []
            
            for table in tables:
                # Skip the primary table itself and system tables
                if table.name == primary_table or table.name.startswith('.'):
                    continue
                
                try:
                    # Get schema of candidate table
                    table_columns = self.list_columns(database, table.name)
                    table_schema = {col.name: col.data_type for col in table_columns}
                    
                    # Find common columns (same name AND same type)
                    common_columns = {
                        col_name 
                        for col_name in primary_schema.keys() 
                        if col_name in table_schema and primary_schema[col_name] == table_schema[col_name]
                    }
                    
                    common_count = len(common_columns)
                    logger.debug(f"Table '{table.name}': {common_count} common columns out of {len(table_columns)}")
                    
                    # Check if table has enough common columns
                    if common_count >= min_common_columns:
                        similar_tables.append(table.name)
                        logger.info(f"✓ Found similar table: {table.name} ({common_count} common columns)")
                    else:
                        # Log why it was rejected
                        logger.debug(f"  ✗ Table '{table.name}' only has {common_count} common columns (need {min_common_columns})")
                        
                except Exception as e:
                    logger.debug(f"Could not check table {table.name}: {e}")
                    continue
            
            logger.info(f"Found {len(similar_tables)} tables with similar schema for '{primary_table}' (min {min_common_columns} common columns)")
            return similar_tables
            
        except Exception as e:
            logger.warning(f"Error detecting similar tables in {database}: {e}")
            return []
            return []

    def fetch_data(self, query: str) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
        """Executes a SQL query on ClickHouse and returns column definitions and rows."""
        if not self.client:
            raise DataSourceConnectionError("Not connected to ClickHouse.")
        logger.info(f"Executing ClickHouse query: {query}")
        try:
            # Query with settings to preserve string types
            with self._client_lock:
                result = self.client.query(query)
            
            # Format column definitions
            if hasattr(result, 'columns') and result.columns:
                columns = [{'name': col.name, 'type': col.type} for col in result.columns]
            else:
                columns = [{'name': name, 'type': 'unknown'} for name in result.column_names]

            logger.info(f"Formatted columns: {columns}")

            # Format rows into dictionaries
            # Convert all values to ensure proper types (strings stay as strings, dates/datetimes to ISO strings)
            rows = []
            for row in result.result_rows:
                row_dict = {}
                for col_name, value in zip(result.column_names, row):
                    # Convert datetime objects to ISO format strings if needed
                    if hasattr(value, 'isoformat'):
                        row_dict[col_name] = value.isoformat()
                    else:
                        row_dict[col_name] = value
                rows.append(row_dict)
            
            # Log first few rows to diagnose what types we're getting
            if rows:
                logger.info(f"First row (processed): {rows[0]}")
                logger.info(f"First row value types: {[(k, type(v).__name__) for k, v in rows[0].items()]}")
            
            # Convert any Decimal types to floats for JSON serialization compatibility
            rows = process_query_result_data(rows)
            
            logger.info(f"Returning {len(rows)} rows.")

            return columns, rows
        except Exception as e:
            logger.exception(f"Error executing ClickHouse query (details above)")
            raise QueryExecutionError(str(e))

    @staticmethod
    def _sanitize_arrow_table(table: pa.Table) -> pa.Table:
        """
        Replace NaN and Inf float values with null in an Arrow table.

        ClickHouse allows IEEE 754 NaN/Inf in Float32/Float64 columns. These are
        not representable in JSON (the standard JSON spec has no NaN/Infinity
        literals), and they cause confusing display artefacts on the frontend.
        Converting them to Arrow null (which maps to JSON null / JS null) is the
        correct semantic: the value is unknown/undefined rather than a spurious
        number.

        Important: ClickHouse marks float columns as non-nullable in the Arrow
        schema. We must update the field to nullable=True when we introduce nulls;
        otherwise PyArrow drops the validity bitmap on table construction and the
        NaN bits come back.
        """
        new_columns = []
        new_fields = list(table.schema)
        changed = False

        for i in range(table.num_columns):
            col = table.column(i)
            if pa.types.is_floating(col.type):
                # Flatten ChunkedArray so compute functions work element-wise
                flat = col.combine_chunks() if isinstance(col, pa.ChunkedArray) else col
                bad_mask = pc.or_(pc.is_nan(flat), pc.is_inf(flat))
                if pc.any(bad_mask).as_py():
                    null_scalar = pa.scalar(None, type=flat.type)
                    flat = pc.if_else(bad_mask, null_scalar, flat)
                    # Schema must declare the column nullable, otherwise the
                    # validity bitmap is stripped when building the new table.
                    new_fields[i] = new_fields[i].with_nullable(True)
                    col = flat
                    changed = True
            new_columns.append(col)

        if not changed:
            return table

        new_schema = pa.schema(new_fields, metadata=table.schema.metadata)
        return pa.table(
            {new_fields[i].name: new_columns[i] for i in range(len(new_columns))},
            schema=new_schema,
        )

    def fetch_data_arrow(self, query: str) -> pa.Table:
        """
        Executes a SQL query on ClickHouse and returns data as an Apache Arrow Table.
        
        Uses clickhouse-connect's native Arrow support for optimal performance.

        Args:
            query: The executable query string (SQL).

        Returns:
            PyArrow Table containing the query results. NaN/Inf floats are
            replaced with null so the payload is always valid for JSON transport
            and unambiguous for downstream consumers.
        """
        if not self.client:
            raise DataSourceConnectionError("Not connected to ClickHouse.")
        
        logger.info(f"Executing ClickHouse Arrow query: {query}")
        try:
            with self._client_lock:
                # Use query_arrow for native Arrow support
                # clickhouse-connect returns a PyArrow Table directly
                arrow_table = self.client.query_arrow(query)
            
            arrow_table = self._sanitize_arrow_table(arrow_table)
            logger.info(f"Arrow query returning {arrow_table.num_rows} rows, {arrow_table.num_columns} columns.")
            return arrow_table
            
        except Exception as e:
            logger.exception(f"Error executing ClickHouse Arrow query (details above)")
            raise QueryExecutionError(str(e))