"""Connector for ClickHouse database using HTTP protocol."""
import logging
from typing import List, Dict, Any, Tuple
import threading
from typing import Optional
from urllib.parse import urlparse, parse_qs
import clickhouse_connect
from clickhouse_connect.driver.client import Client
from backend.models.data_source import Database, Table, Column, ForeignKeyRelationship
from .base import BaseConnector
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
        try:
            # Handle both connection string and individual parameters
            if 'connection_string' in self.connection_details:
                # Assuming format: 'http://user:password@host:8123/database'
                logger.info(f"Using connection string: {self.connection_details['connection_string']}")
                self.client = clickhouse_connect.get_client(
                    dsn=self.connection_details['connection_string']
                )
            else:
                # Ensure port is set to HTTP port if not specified
                conn_params = self.connection_details.copy()
                conn_params.setdefault('port', 8123)
                logger.info(f"Using connection params (with defaults applied): {conn_params}")
                self.client = clickhouse_connect.get_client(**conn_params)
            
            # Test connection
            with self._client_lock:
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
        
        Since ClickHouse doesn't enforce FK constraints, we use heuristics:
        - Look for columns ending in _id, _ID, Id, ID
        - Match them with potential primary key columns (id, ID) in other tables
        - Check if the column name prefix matches a table name
        
        Args:
            database: Database name to analyze
            
        Returns:
            List of detected relationships
        """
        if not self.client:
            raise DataSourceConnectionError("Not connected to ClickHouse.")
        
        try:
            relationships = []
            tables = self.list_tables(database)
            table_names = [t.name for t in tables]
            
            # Build a map of table -> columns
            table_columns: Dict[str, List[Column]] = {}
            for table in tables:
                try:
                    table_columns[table.name] = self.list_columns(database, table.name)
                except Exception as e:
                    logger.warning(f"Could not list columns for {table.name}: {e}")
                    continue
            
            logger.info(f"Analyzing FK relationships in database '{database}' with {len(table_names)} tables")
            logger.info(f"Table names: {table_names[:5]}...")  # Log first 5 tables
            
            # Look for FK patterns
            for from_table, columns in table_columns.items():
                col_names = [c.name for c in columns]
                logger.debug(f"Table '{from_table}' has columns: {col_names}")
                
                for col in columns:
                    col_name = col.name.lower()
                    
                    # Check for common FK patterns
                    if col_name.endswith('_id') or col_name.endswith('id'):
                        # Extract potential table name
                        potential_table = col_name.replace('_id', '').replace('id', '')
                        
                        # Check if any table name matches (with pluralization handling)
                        for to_table in table_names:
                            to_table_lower = to_table.lower()
                            
                            # Direct match or singular/plural variations
                            if (potential_table == to_table_lower or
                                potential_table + 's' == to_table_lower or
                                potential_table == to_table_lower + 's' or
                                potential_table + 'es' == to_table_lower):
                                
                                # Check if target table has an 'id' column
                                to_columns = table_columns.get(to_table, [])
                                has_id = any(c.name.lower() in ['id', '_id'] for c in to_columns)
                                
                                if has_id:
                                    relationships.append(ForeignKeyRelationship(
                                        from_table=from_table,
                                        from_column=col.name,
                                        to_table=to_table,
                                        to_column='id',  # Assume standard 'id' column
                                        relationship_type='many_to_one'
                                    ))
                                    logger.info(f"Detected FK: {from_table}.{col.name} -> {to_table}.id")
                                    break  # Found a match, don't check other tables
            
            return relationships
            
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