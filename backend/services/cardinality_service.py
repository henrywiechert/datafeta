# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Service for calculating cardinality (distinct counts) of fields."""

import logging
from typing import List, Optional

from pypika import Query, Table
from pypika.terms import Term
from pypika.functions import Cast

from backend.connectors.base import BaseConnector
from backend.models.data_source import ConnectionDetails
from backend.exceptions import QueryExecutionError, InvalidInputError
from backend.dialects import get_dialect
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
        connector_dialect = getattr(connector, "sql_dialect", None) if connector else None
        if connector_dialect and isinstance(getattr(connector_dialect, "quote_char", None), str):
            self._dialect = connector_dialect
        else:
            self._dialect = get_dialect(conn_details.type)
    
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
        virtual_table: Optional[object] = None,
        source_table: Optional[str] = None
    ) -> int:
        """
        Get count of distinct values for a field.
        
        Args:
            field: Field name to count
            table: Table name (primary table)
            database: Database name (required for ClickHouse)
            regex_pattern: Optional LIKE pattern filter
            datetime_part: Optional datetime part extraction (year, month, etc.)
            datetime_mode: Optional datetime mode for extraction
            union_tables: Comma-separated list of union table names
            virtual_columns: Optional list of VirtualColumnDefinition objects
            virtual_table: Optional VirtualTableDefinition for JOIN support
            source_table: Optional explicit source table name (from Column.table_name).
                          When provided, overrides table-prefix parsing from the field name.
            
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
            virtual_table=virtual_table,
            source_table=source_table
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
        virtual_table: Optional[object] = None,
        source_table: Optional[str] = None
    ) -> str:
        """Build the COUNT(DISTINCT) SQL query.
        
        For JOINed tables: We query the specific source table directly, not the JOIN.
        This ensures we get ALL distinct values from that table, not just the ones
        that match the JOIN condition.
        
        Source table resolution priority:
        1. Explicit source_table parameter (from Column.table_name, passed by frontend)
        2. Virtual table + field prefix matching (legacy fallback)
        3. Default to primary table
        
        IMPORTANT: Column names can legitimately contain dots (e.g., 'tableName.colName'
        is a single column name in some databases). We must NOT split on dots blindly.
        """
        # Import here to avoid circular dependency
        from backend.services.query_components.virtual_column_builder import VirtualColumnExpressionBuilder
        
        has_joined_tables = virtual_table and virtual_table.joined_tables and len(virtual_table.joined_tables) > 0
        has_union_tables = virtual_table and virtual_table.mode == 'union' and virtual_table.union_tables and len(virtual_table.union_tables) > 0

        def _normalize_table_name(table_ref: Optional[str]) -> Optional[str]:
            """Return bare table name from either 'table' or 'database/table' references."""
            if not table_ref:
                return table_ref
            if '/' in table_ref:
                parts = table_ref.split('/', 1)
                return parts[1] if len(parts) == 2 else table_ref
            return table_ref
        
        # Track whether we resolved a source table from a JOIN (for ClickHouse subquery wrapping)
        resolved_from_join = False
        resolved_table_name = table  # Default to the function parameter (primary table)
        
        # Build set of known table names from virtual table definition (for safe prefix checks)
        known_tables = set()
        if virtual_table:
            known_tables.add(_normalize_table_name(virtual_table.primary_table))
            for jt in virtual_table.joined_tables:
                known_tables.add(_normalize_table_name(jt.table_name))
            for ut in virtual_table.union_tables:
                known_tables.add(_normalize_table_name(ut.table_name))
            known_tables.discard(None)

        # --- Source table resolution ---
        # Priority 1: Explicit source_table from Column.table_name (most reliable)
        if source_table and source_table != table:
            # The field name from the merge service is prefixed: "sourceTable.actualColumnName"
            # Strip the table prefix to get the real DB column name
            prefix = source_table + '.'
            if field.startswith(prefix):
                field = field[len(prefix):]
            
            if self._dialect.supports_schema_prefix and database:
                db_table = Table(source_table, schema=database)
            else:
                db_table = Table(source_table)
            
            count_query = Query.from_(db_table)
            table_map = {source_table: db_table}
            resolved_from_join = True
            resolved_table_name = source_table
            
            logger.info(f"Cardinality query: Using explicit source table '{source_table}' for field '{field}' (from Column.table_name)")
        
        # Priority 2: Virtual table + field prefix matching (legacy/fallback)
        elif has_joined_tables and '.' in field:
            parts = field.split('.', 1)
            if len(parts) == 2:
                potential_table_name = parts[0]
                remaining = parts[1]
                
                if potential_table_name in known_tables:
                    source_table_name = potential_table_name
                    source_column_name = remaining
                    
                    # Query the source table directly
                    if self._dialect.supports_schema_prefix and database:
                        db_table = Table(source_table_name, schema=database)
                    else:
                        db_table = Table(source_table_name)
                    
                    count_query = Query.from_(db_table)
                    table_map = {source_table_name: db_table}
                    field = source_column_name
                    resolved_from_join = True
                    resolved_table_name = source_table_name
                    
                    logger.info(f"Cardinality query: Using source table '{source_table_name}' directly for field '{source_column_name}' (bypassing JOIN, from field prefix)")
                else:
                    # Prefix doesn't match any known table — the dot is part of the column name
                    logger.info(
                        f"Cardinality query: Field '{field}' has dot but prefix '{potential_table_name}' "
                        f"is not a known table ({known_tables}). Treating full name as column name."
                    )
                    if self._dialect.supports_schema_prefix and database:
                        db_table = Table(table, schema=database)
                    else:
                        db_table = Table(table)
                    count_query = Query.from_(db_table)
                    table_map = {table: db_table}
            else:
                if self._dialect.supports_schema_prefix and database:
                    db_table = Table(table, schema=database)
                else:
                    db_table = Table(table)
                count_query = Query.from_(db_table)
                table_map = {table: db_table}

        # Priority 2b: UNION mode + dotted field where prefix matches a known table.
        # In this case, the dotted value may be a *literal* column name (e.g.
        # 'dlPreSchedData.raState'), so we switch source table but DO NOT split field.
        elif has_union_tables and '.' in field:
            parts = field.split('.', 1)
            if len(parts) == 2:
                potential_table_name = parts[0]

                if potential_table_name in known_tables:
                    source_table_name = potential_table_name
                    if self._dialect.supports_schema_prefix and database:
                        db_table = Table(source_table_name, schema=database)
                    else:
                        db_table = Table(source_table_name)

                    count_query = Query.from_(db_table)
                    table_map = {source_table_name: db_table}
                    resolved_from_join = True
                    resolved_table_name = source_table_name

                    logger.info(
                        f"Cardinality query: UNION mode resolved source table '{source_table_name}' "
                        f"for dotted field '{field}' without splitting column name"
                    )
                else:
                    if self._dialect.supports_schema_prefix and database:
                        db_table = Table(table, schema=database)
                    else:
                        db_table = Table(table)
                    count_query = Query.from_(db_table)
                    table_map = {table: db_table}
            else:
                if self._dialect.supports_schema_prefix and database:
                    db_table = Table(table, schema=database)
                else:
                    db_table = Table(table)
                count_query = Query.from_(db_table)
                table_map = {table: db_table}
        
        # Priority 3: source_table matches the primary table — just strip the prefix
        elif source_table and source_table == table and field.startswith(source_table + '.'):
            field = field[len(source_table) + 1:]
            if self._dialect.supports_schema_prefix and database:
                db_table = Table(table, schema=database)
            else:
                db_table = Table(table)
            count_query = Query.from_(db_table)
            table_map = {table: db_table}
            logger.info(f"Cardinality query: Stripped primary table prefix from field, using '{field}' from '{table}'")
        
        # Default: use primary table as-is
        elif self._dialect.supports_schema_prefix and database:
            db_table = Table(table, schema=database)
            count_query = Query.from_(db_table)
            table_map = {table: db_table}
        else:
            db_table = Table(table)
            count_query = Query.from_(db_table)
            table_map = {table: db_table}

        # JOIN queries: expand table_map so virtual column expressions can resolve
        # table-qualified refs (e.g. drivers.givenName -> drivers.givenName).
        if virtual_columns and has_joined_tables:
            table_map = self._expand_table_map(table_map, known_tables, database, self._dialect)
        
        # Initialize virtual column builder if virtual columns are defined
        vc_builder = None
        if virtual_columns:
            db_type = self.conn_details.type
            column_types = None
            if db_type in {'duckdb', 'csv', 'file', 'kaggle', 'hive_parquet', 'huggingface'}:
                try:
                    cols = self.connector.list_columns(database=None, table=resolved_table_name)
                    column_types = {col.name: col.data_type for col in cols}
                except Exception:
                    logger.debug(
                        "Could not fetch column types for DuckDB virtual column type promotion",
                        exc_info=True,
                    )
            vc_builder = VirtualColumnExpressionBuilder(
                table_map=table_map,
                default_table=db_table,
                db_type=db_type,
                column_types=column_types,
                source_database=database,
                source_table=resolved_table_name,
            )
            
            # Register all virtual columns
            for vc in virtual_columns:
                try:
                    vc_builder.register_virtual_column(vc)
                    logger.debug(f"Registered virtual column for cardinality: {vc.name}")
                except Exception as e:
                    logger.error(f"Failed to register virtual column '{vc.name}': {e}")
                    raise QueryExecutionError(f"Invalid virtual column '{vc.name}': {e}")

        # Virtual columns may reference a non-primary joined table — query that table directly.
        if vc_builder and vc_builder.is_virtual_column(field):
            source_fields = vc_builder.get_source_fields(field)
            inferred_table = self._infer_single_source_table(
                source_fields, known_tables, table
            )
            if inferred_table and inferred_table != resolved_table_name:
                resolved_table_name = inferred_table
                resolved_from_join = True
                if self._dialect.supports_schema_prefix and database:
                    db_table = Table(inferred_table, schema=database)
                else:
                    db_table = Table(inferred_table)
                count_query = Query.from_(db_table)
                logger.info(
                    "Cardinality query: Virtual column '%s' resolved to source table '%s'",
                    field,
                    inferred_table,
                )
        
        # Determine the field expression to count
        # Check if this is a virtual column first
        if vc_builder and vc_builder.is_virtual_column(field):
            field_expr = vc_builder.get_virtual_column_term(field)
            logger.debug(f"Using virtual column expression for cardinality count: {field}")
        elif datetime_part and datetime_mode:
            # For datetime parts, extract the part first using DateTimeService
            # Note: At this point, 'field' is already the column name (not table-qualified)
            # because we extracted the source table earlier for joined table cases
            base_field = db_table[field]
            
            field_expr = DateTimeService.get_datetime_part_expression(
                base_field, 
                datetime_part, 
                datetime_mode, 
                self._dialect
            )
        else:
            # Use the field directly - it's already the column name
            # (table prefix was handled above when extracting source table)
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
        quote_char = self._dialect.quote_char
        sql = count_query.get_sql(quote_char=quote_char)
        
        # For ClickHouse VIEWs that use SELECT a.* patterns, the column reference
        # may fail with "Missing columns" error. We wrap in a subquery to force
        # column expansion, but we must preserve any computed expression (e.g.,
        # datetime part extraction or virtual columns) instead of falling back
        # to the raw field name.
        # Also apply when we resolved a specific source table from a JOIN (the
        # resolved table might also be a VIEW that needs subquery wrapping).
        if self._dialect.name == 'clickhouse' and database:
            should_wrap = not (virtual_table and virtual_table.joined_tables) or resolved_from_join
            if should_wrap:
                table_ref = f'{quote_char}{database}{quote_char}.{quote_char}{resolved_table_name}{quote_char}'
                expr_sql = field_expr.get_sql(quote_char=quote_char)
                expr_alias = f"{quote_char}_expr{quote_char}"
                subquery = f'(SELECT {expr_sql} AS {expr_alias} FROM {table_ref}) AS _sub'
                sql = f'SELECT COUNT(DISTINCT {expr_alias}) AS "count" FROM {subquery}'
                
                # Re-apply regex filter against the projected expression
                if regex_pattern:
                    like_pattern = regex_pattern.replace("'", "''")
                    sql = f"{sql} WHERE toString({expr_alias}) LIKE '%{like_pattern}%'"
        
        logger.info(f"Executing distinct count query: {sql}")
        
        return sql
    
    @staticmethod
    def _expand_table_map(
        table_map: dict,
        known_tables: set,
        database: Optional[str],
        dialect,
    ) -> dict:
        """Include all joined tables in table_map for virtual column name resolution."""
        expanded = dict(table_map)
        for tname in known_tables:
            if tname in expanded:
                continue
            if dialect.supports_schema_prefix and database:
                expanded[tname] = Table(tname, schema=database)
            else:
                expanded[tname] = Table(tname)
        return expanded

    @staticmethod
    def _infer_single_source_table(
        source_fields: List[str],
        known_tables: set,
        default_table: str,
    ) -> Optional[str]:
        """When all source fields belong to one table, return that table name."""
        tables: set = set()
        for field_name in source_fields:
            if '.' in field_name:
                prefix = field_name.split('.', 1)[0]
                if prefix in known_tables:
                    tables.add(prefix)
                    continue
            tables.add(default_table)
        if len(tables) == 1:
            return next(iter(tables))
        return None
    
    def _apply_regex_filter(
        self,
        count_query: Query,
        field_expr: Term,
        regex_pattern: str,
        datetime_part: Optional[str],
        datetime_mode: Optional[str]
    ) -> Query:
        """Apply LIKE pattern filter to the count query.
        
        Always cast to string before LIKE comparison to support both
        string and numeric columns. LIKE only works on string types in SQL.
        """
        from backend.services.query_components.terms import CustomFunction
        
        # Convert to LIKE pattern: %pattern%
        like_pattern = f"%{regex_pattern}%"
        
        # Always cast to string for LIKE comparison - this works for both
        # string columns (no-op cast) and numeric columns (converts to string)
        if self._dialect.name == 'clickhouse':
            # ClickHouse uses toString() function
            string_expr = CustomFunction('toString', [field_expr])
            count_query = count_query.where(string_expr.like(like_pattern))
        else:
            # DuckDB uses CAST(..., 'VARCHAR')
            count_query = count_query.where(
                Cast(field_expr, 'VARCHAR').like(like_pattern)
            )
        
        return count_query
    
    def check_composite_key_uniqueness(
        self,
        table: str,
        columns: List[str],
        database: Optional[str] = None
    ) -> dict:
        """Check whether a set of columns forms a unique key in a table.

        Args:
            table: Table name
            columns: List of column names that form the composite key
            database: Database name (required for ClickHouse)

        Returns:
            Dict with total_rows, unique_keys, is_unique, duplicate_rows
        """
        ValidationService.require_database_for_clickhouse(
            database, self.conn_details, "checking key uniqueness"
        )

        quote_char = self._dialect.quote_char

        def q(name: str) -> str:
            return quote_char + name + quote_char

        if self._dialect.name == 'clickhouse' and database:
            table_ref = f'{q(database)}.{q(table)}'
            key_cols = ','.join(q(c) for c in columns)
            # ClickHouse: use uniqExact(tuple(...)) for exact distinct count
            tuple_args = ','.join(q(c) for c in columns)
            sql = (
                f'SELECT count() AS total_rows, '
                f'uniqExact(tuple({tuple_args})) AS unique_keys '
                f'FROM {table_ref}'
            )
        else:
            # DuckDB / generic SQL
            table_ref = q(table)
            key_cols = ','.join(q(c) for c in columns)
            sql = (
                f'SELECT count(*) AS total_rows, '
                f'count(DISTINCT ({key_cols})) AS unique_keys '
                f'FROM {table_ref}'
            )

        logger.info(f"Checking composite key uniqueness: {sql}")

        try:
            col_names, rows = self.connector.fetch_data(sql)
            if rows and len(rows) > 0:
                row = rows[0]
                if isinstance(row, dict):
                    total = int(row.get('total_rows', 0))
                    unique = int(row.get('unique_keys', 0))
                elif isinstance(row, (list, tuple)):
                    total = int(row[0])
                    unique = int(row[1])
                else:
                    total, unique = 0, 0
            else:
                total, unique = 0, 0

            return {
                "total_rows": total,
                "unique_keys": unique,
                "is_unique": total == unique,
                "duplicate_rows": total - unique
            }
        except Exception as e:
            logger.error(f"Error checking composite key uniqueness: {e}")
            raise QueryExecutionError(f"Failed to check key uniqueness: {e}")

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
