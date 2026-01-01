"""Service for calculating cardinality (distinct counts) of fields."""

import logging
from typing import Optional

from pypika import Query, Table
from pypika.terms import Term
from pypika.functions import Cast

from backend.connectors.base import BaseConnector
from backend.models.data_source import ConnectionDetails
from backend.exceptions import QueryExecutionError, InvalidInputError
from backend.services.validation_service import ValidationService
from backend.services.datetime_service import DateTimeService

logger = logging.getLogger(__name__)


class CountDistinct(Term):
    """Custom PyPika term for COUNT(DISTINCT field) expressions."""
    
    def __init__(self, field_expr):
        super().__init__()
        self.field_expr = field_expr
    
    def get_sql(self, **kwargs):
        field_sql = self.field_expr.get_sql(**kwargs)
        return f"COUNT(DISTINCT {field_sql})"


class CardinalityService:
    """Service for calculating distinct value counts for fields."""
    
    def __init__(self, connector: BaseConnector, conn_details: ConnectionDetails):
        self.connector = connector
        self.conn_details = conn_details
    
    def get_distinct_count(
        self,
        field: str,
        table: str,
        database: Optional[str] = None,
        regex_pattern: Optional[str] = None,
        datetime_part: Optional[str] = None,
        datetime_mode: Optional[str] = None,
        union_tables: Optional[str] = None,
        virtual_columns: Optional[list] = None,
        virtual_table: Optional[object] = None
    ) -> int:
        """
        Get count of distinct values for a field.
        
        Args:
            field: Field name to count
            table: Table name
            database: Database name (required for ClickHouse)
            regex_pattern: Optional LIKE pattern filter
            datetime_part: Optional datetime part extraction (year, month, etc.)
            datetime_mode: Optional datetime mode for extraction
            union_tables: Comma-separated list of union table names
            virtual_columns: Optional list of VirtualColumnDefinition objects
            virtual_table: Optional VirtualTableDefinition for JOIN support
            
        Returns:
            Distinct count as integer
        """
        # Validate ClickHouse database requirement
        ValidationService.require_database_for_clickhouse(database, self.conn_details, "counting distinct values")
        
        # Special handling for source tracking virtual columns (UNION queries only)
        if field == '_source_table':
            return self._count_source_tables(union_tables)
        if field == '_source_database':
            return self._count_source_databases(union_tables)
        
        # Build and execute the count query
        sql = self._build_count_query(
            field=field,
            table=table,
            database=database,
            regex_pattern=regex_pattern,
            datetime_part=datetime_part,
            datetime_mode=datetime_mode,
            virtual_columns=virtual_columns,
            virtual_table=virtual_table
        )
        
        return self._execute_count_query(sql, field)
    
    def _count_source_tables(self, union_tables: Optional[str]) -> int:
        """Count the number of tables (single table or UNION query)."""
        if union_tables:
            union_table_list = [t.strip() for t in union_tables.split(',') if t.strip()]
            count = 1 + len(union_table_list)  # primary + union tables
            logger.info(f"_source_table distinct count: {count} tables")
            return count
        else:
            # Single table case - always return 1
            logger.info("_source_table distinct count: 1 (single table)")
            return 1
    
    def _count_source_databases(self, union_tables: Optional[str]) -> int:
        """Count the number of unique databases (single table or UNION query)."""
        if union_tables:
            # Parse union_tables which may be in format "db1/table1,db2/table2,..."
            # Using '/' separator to avoid conflicts with column names that contain dots
            databases = set()
            union_table_list = [t.strip() for t in union_tables.split(',') if t.strip()]
            for table_ref in union_table_list:
                if '/' in table_ref:
                    db = table_ref.split('/')[0]
                    databases.add(db)
            count = len(databases) if databases else 1  # At least 1 database (primary)
            logger.info(f"_source_database distinct count: {count} databases")
            return count
        else:
            # Single table case - always return 1
            logger.info("_source_database distinct count: 1 (single table)")
            return 1
    
    def _build_count_query(
        self,
        field: str,
        table: str,
        database: Optional[str],
        regex_pattern: Optional[str],
        datetime_part: Optional[str],
        datetime_mode: Optional[str],
        virtual_columns: Optional[list] = None,
        virtual_table: Optional[object] = None
    ) -> str:
        """Build the COUNT(DISTINCT) SQL query."""
        # Import here to avoid circular dependency
        from backend.services.query_components.virtual_column_builder import VirtualColumnExpressionBuilder
        from backend.services.query_components.table_context_builder import TableContextBuilder
        
        # Build the table reference and handle JOINs if virtual_table is provided
        if virtual_table and virtual_table.joined_tables:
            # Use TableContextBuilder to create proper JOIN query
            builder = TableContextBuilder()
            # Create a minimal QueryDescription-like object for the builder
            class MinimalQueryDesc:
                def __init__(self, primary_table, virtual_table):
                    self.target_table = primary_table
                    self.target_database = database
                    self.virtual_table = virtual_table
            
            query_desc = MinimalQueryDesc(table, virtual_table)
            context = builder.build(query_desc, self.conn_details.type, table)
            count_query = context.query
            db_table = context.primary_table
            table_map = context.table_map
        elif self.conn_details.type == 'clickhouse' and database:
            db_table = Table(table, schema=database)
            count_query = Query.from_(db_table)
            table_map = {table: db_table}
        else:
            db_table = Table(table)
            count_query = Query.from_(db_table)
            table_map = {table: db_table}
        
        # Initialize virtual column builder if virtual columns are defined
        vc_builder = None
        if virtual_columns:
            vc_builder = VirtualColumnExpressionBuilder(
                table_map=table_map,
                default_table=db_table,
                db_type=self.conn_details.type,
            )
            
            # Register all virtual columns
            for vc in virtual_columns:
                try:
                    vc_builder.register_virtual_column(vc)
                    logger.debug(f"Registered virtual column for cardinality: {vc.name}")
                except Exception as e:
                    logger.error(f"Failed to register virtual column '{vc.name}': {e}")
                    raise QueryExecutionError(f"Invalid virtual column '{vc.name}': {e}")
        
        # Determine the field expression to count
        # Check if this is a virtual column first
        if vc_builder and vc_builder.is_virtual_column(field):
            field_expr = vc_builder.get_virtual_column_term(field)
            logger.debug(f"Using virtual column expression for cardinality count: {field}")
        elif datetime_part and datetime_mode:
            # For datetime parts, extract the part first using DateTimeService
            # Handle qualified field names (e.g., "races.date")
            if '.' in field:
                parts = field.split('.', 1)
                if len(parts) == 2 and parts[0] in table_map:
                    base_field = table_map[parts[0]][parts[1]]
                else:
                    base_field = db_table[field]
            else:
                base_field = db_table[field]
            
            field_expr = DateTimeService.get_datetime_part_expression(
                base_field, 
                datetime_part, 
                datetime_mode, 
                self.conn_details.type
            )
        else:
            # Handle qualified field names (e.g., "races.date")
            if '.' in field:
                parts = field.split('.', 1)
                if len(parts) == 2 and parts[0] in table_map:
                    field_expr = table_map[parts[0]][parts[1]]
                else:
                    field_expr = db_table[field]
            else:
                field_expr = db_table[field]
        
        # Build count query using custom CountDistinct
        count_expr = CountDistinct(field_expr)
        count_query = count_query.select(count_expr.as_('count'))
        
        # Apply regex filter if provided
        if regex_pattern:
            count_query = self._apply_regex_filter(
                count_query, 
                field_expr, 
                regex_pattern, 
                datetime_part, 
                datetime_mode
            )
        
        # Generate SQL with appropriate quote character
        quote_char = '`' if self.conn_details.type == 'clickhouse' else '"'
        sql = count_query.get_sql(quote_char=quote_char)
        
        # For ClickHouse VIEWs that use SELECT a.* patterns, the column reference
        # may fail with "Missing columns" error. Wrap the query with a subquery
        # that forces column expansion first: SELECT COUNT(DISTINCT field) FROM (SELECT * FROM view) sub
        # We do this proactively for ClickHouse to avoid the error.
        if self.conn_details.type == 'clickhouse' and database and not (virtual_table and virtual_table.joined_tables):
            # Build a safer query that wraps the table in a subquery
            # This handles VIEWs that use SELECT a.* expansion
            field_quoted = f'{quote_char}{field}{quote_char}'
            table_ref = f'{quote_char}{database}{quote_char}.{quote_char}{table}{quote_char}'
            sql = f'SELECT COUNT(DISTINCT {field_quoted}) AS "count" FROM (SELECT * FROM {table_ref}) AS _sub'
            
            # Re-apply regex filter if provided (simplified version)
            if regex_pattern:
                like_pattern = regex_pattern.replace("'", "''")
                sql = f'{sql} WHERE {field_quoted} LIKE \'%{like_pattern}%\''
        
        logger.info(f"Executing distinct count query: {sql}")
        
        return sql
    
    def _apply_regex_filter(
        self,
        count_query: Query,
        field_expr: Term,
        regex_pattern: str,
        datetime_part: Optional[str],
        datetime_mode: Optional[str]
    ) -> Query:
        """Apply LIKE pattern filter to the count query."""
        # Convert to LIKE pattern: %pattern%
        like_pattern = f"%{regex_pattern}%"
        
        if datetime_part and datetime_mode:
            # For datetime parts, apply LIKE to the extracted expression
            # Need to cast to string for LIKE comparison
            if self.conn_details.type == 'clickhouse':
                count_query = count_query.where(
                    Cast(field_expr, 'String').like(like_pattern)
                )
            else:
                # DuckDB
                count_query = count_query.where(
                    Cast(field_expr, 'VARCHAR').like(like_pattern)
                )
        else:
            # Regular field - apply LIKE directly
            count_query = count_query.where(field_expr.like(like_pattern))
        
        return count_query
    
    def _execute_count_query(self, sql: str, field: str) -> int:
        """Execute the count query and extract the result."""
        try:
            columns, rows = self.connector.fetch_data(sql)
            logger.info(f"Count query returned {len(rows)} rows. Columns: {columns}")
            
            if rows and len(rows) > 0:
                row = rows[0]
                logger.info(f"First row: {row}, type: {type(row)}")
                
                count = self._extract_count_from_row(row, field)
                logger.info(f"Returning count: {count}")
                return count
            
            logger.warning("No rows returned from count query")
            return 0
            
        except QueryExecutionError as e:
            # Check for ClickHouse "Missing columns" error which can happen with VIEWs
            # that use SELECT a.* expansion - the column exists but ClickHouse can't
            # resolve it through the subquery alias.
            error_str = str(e)
            if "Missing columns" in error_str and "UNKNOWN_IDENTIFIER" in error_str:
                logger.warning(
                    f"Column resolution failed for '{field}' - likely a VIEW with * expansion. "
                    f"Returning -1 to indicate unknown cardinality. Error: {error_str}"
                )
                return -1  # Signal unknown cardinality
            logger.exception(f"Error executing distinct count query: {sql}")
            raise
        except Exception as e:
            logger.exception(f"Error executing distinct count query: {sql}")
            raise QueryExecutionError(f"Failed to count distinct values: {str(e)}")
    
    def _extract_count_from_row(self, row, field: str) -> int:
        """Extract count value from query result row."""
        if isinstance(row, dict):
            # Try multiple possible key names
            # ClickHouse returns 'uniqExact(field)' or similar for COUNT(DISTINCT)
            # We aliased it as 'count' but ClickHouse might ignore the alias
            count = (
                row.get('count') or 
                row.get('COUNT(DISTINCT') or 
                row.get(f'uniqExact({field})') or
                # Fallback: get the first value in the dict
                (list(row.values())[0] if row else 0)
            )
            logger.info(f"Extracted count from dict: {count}, keys: {row.keys()}")
        elif isinstance(row, (list, tuple)):
            count = row[0] if len(row) > 0 else 0
            logger.info(f"Extracted count from list/tuple: {count}")
        else:
            count = int(row)
            logger.info(f"Converted row to int: {count}")
        
        return int(count)
