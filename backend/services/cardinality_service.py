# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Service for calculating cardinality (distinct counts) of fields."""

import logging
from typing import Any, Dict, List, Optional, Tuple

from pypika import Query, Table
from pypika.terms import Term
from pypika.functions import Cast

from backend.connectors.base import BaseConnector
from backend.models.data_source import ConnectionDetails
from backend.models.query import Filter, QueryDescription
from backend.exceptions import QueryExecutionError, InvalidInputError
from backend.dialects import get_dialect
from backend.services.validation_service import ValidationService
from backend.services.query_components.cast_field_applier import get_field_with_cast
from backend.services.query_components.column_source_resolver import (
    build_column_expression,
    resolve_column_source,
)
from backend.services.query_components.field_reference_parser import FieldReferenceParser
from backend.services.query_components.filter_builder import FilterBuilder
from backend.services.query_components.filter_table_scope import scope_filters_to_table
from backend.services.query_components.schema_type_provider import SchemaTypeProvider

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
        self._type_provider = SchemaTypeProvider(connector)
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
        source_table: Optional[str] = None,
        filters: Optional[List[Filter]] = None,
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
            filters: Optional sibling filters that constrain the distinct count for
                     cascading ("Relevant") picker lists.
            
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
            source_table=source_table,
            filters=filters,
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
        source_table: Optional[str] = None,
        filters: Optional[List[Filter]] = None,
    ) -> str:
        """Build the COUNT(DISTINCT) SQL query.

        For JOINed tables: We query the specific source table directly, not the JOIN.
        This ensures we get ALL distinct values from that table, not just the ones
        that match the JOIN condition. See `column_source_resolver`.
        """
        resolved = resolve_column_source(
            field=field,
            table=table,
            database=database,
            dialect=self._dialect,
            db_type=self.conn_details.type,
            type_provider=self._type_provider,
            virtual_columns=virtual_columns,
            virtual_table=virtual_table,
            source_table=source_table,
            log_context="Cardinality query",
        )

        field = resolved.field
        db_table = resolved.db_table
        table_map = resolved.table_map
        known_tables = resolved.known_tables
        resolved_table_name = resolved.resolved_table_name
        resolved_from_join = resolved.resolved_from_join
        field_prefix_is_column_name = resolved.field_prefix_is_column_name
        vc_builder = resolved.vc_builder

        count_query = Query.from_(db_table)

        field_expr = build_column_expression(
            resolved,
            dialect=self._dialect,
            database=database,
            type_provider=self._type_provider,
            datetime_part=datetime_part,
            datetime_mode=datetime_mode,
        )

        # Build count query using custom CountDistinct
        count_expr = CountDistinct(field_expr)
        count_query = count_query.select(count_expr.as_('count'))

        # Apply sibling filters (cascading discrete picker lists)
        filter_criteria_sql: List[str] = []
        if filters:
            count_query, filter_criteria_sql = self._apply_sibling_filters(
                count_query=count_query,
                filters=filters,
                table_map=table_map,
                db_table=db_table,
                known_tables=known_tables,
                resolved_table_name=resolved_table_name,
                vc_builder=vc_builder,
                strip_resolved_prefix=not field_prefix_is_column_name,
            )
        
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
                # Sibling filters reference other columns — keep them on the inner FROM.
                inner_where = ''
                if filter_criteria_sql:
                    inner_where = ' WHERE ' + ' AND '.join(filter_criteria_sql)
                subquery = f'(SELECT {expr_sql} AS {expr_alias} FROM {table_ref}{inner_where}) AS _sub'
                sql = f'SELECT COUNT(DISTINCT {expr_alias}) AS "count" FROM {subquery}'
                
                # Re-apply regex filter against the projected expression
                if regex_pattern:
                    like_pattern = regex_pattern.replace("'", "''")
                    sql = f"{sql} WHERE toString({expr_alias}) LIKE '%{like_pattern}%'"
        
        logger.info(f"Executing distinct count query: {sql}")
        
        return sql

    def _apply_sibling_filters(
        self,
        count_query: Query,
        filters: List[Filter],
        table_map: dict,
        db_table: Any,
        known_tables: set,
        resolved_table_name: str,
        vc_builder: Optional[Any],
        strip_resolved_prefix: bool = True,
    ) -> Tuple[Query, List[str]]:
        """Apply sibling filters to count_query; return (query, criterion SQL).

        The count always runs against a single table, so filters that reference a
        different (joined) table are skipped instead of producing invalid SQL.
        """
        resolvable = scope_filters_to_table(
            filters,
            known_tables,
            resolved_table_name,
            is_virtual_column=vc_builder.is_virtual_column if vc_builder else None,
            log_context="Cardinality query",
            strip_resolved_prefix=strip_resolved_prefix,
        )
        if not resolvable:
            return count_query, []

        query_desc = QueryDescription(target_table='_cardinality', filters=resolvable)
        field_parser = FieldReferenceParser(
            table_map=table_map,
            default_table=db_table,
            vc_builder=vc_builder,
        )
        builder = FilterBuilder(
            parse_field_reference=field_parser.parse,
            get_field_with_cast=get_field_with_cast,
        )
        criteria = builder.build(
            query_desc=query_desc,
            table_map=table_map,
            default_table=db_table,
            dialect=self._dialect,
            primary_table=db_table,
        )
        quote_char = self._dialect.quote_char
        criterion_sql: List[str] = []
        for criterion in criteria:
            count_query = count_query.where(criterion)
            criterion_sql.append(criterion.get_sql(quote_char=quote_char))
        return count_query, criterion_sql

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
