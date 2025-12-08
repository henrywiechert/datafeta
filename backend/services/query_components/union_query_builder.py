"""Builder responsible for translating UNION virtual tables into SQL."""

from __future__ import annotations

import logging
import re
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from backend.models.query import Dimension, Filter, Measure, QueryDescription


class UnionQueryBuilder:
    """Encapsulates the UNION-specific translation previously in QueryService."""

    def __init__(
        self,
        translate_single_table: Callable[[QueryDescription, str, str, bool, bool, Optional[object]], Tuple[str, List[Dict]]],
        *,
        connector: Optional[Any] = None,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        self._translate_single_table = translate_single_table
        self._connector = connector
        self._logger = logger or logging.getLogger(__name__)

    def _get_table_columns(self, database: str, table_name: str) -> Set[str]:
        """
        Get the set of column names for a specific table.
        
        Args:
            database: Database name
            table_name: Table name
            
        Returns:
            Set of column names that exist in the table
        """
        if not self._connector:
            # If no connector available, assume all columns exist (backward compatibility)
            return set()
        
        try:
            columns = self._connector.list_columns(database, table_name)
            column_names = {col.name for col in columns}
            self._logger.debug(f"Table {database}.{table_name} has {len(column_names)} columns")
            return column_names
        except Exception as e:
            self._logger.warning(f"Could not fetch columns for {database}.{table_name}: {e}. Assuming all fields exist.")
            return set()  # Empty set means "don't filter" (assume all exist)

    def _parse_table_references(
        self, 
        query_desc: QueryDescription
    ) -> List[Tuple[str, str]]:
        """Extract list of (database, table_name) tuples from query description."""
        virtual_table = query_desc.virtual_table
        primary_db = query_desc.target_database or ""
        
        # Parse primary table
        if not primary_db and '/' in virtual_table.primary_table:
            parts = virtual_table.primary_table.split('/', 1)
            primary_db, primary_table = parts if len(parts) == 2 else (primary_db, virtual_table.primary_table)
            table_refs = [(primary_db, primary_table)]
        else:
            table_refs = [(primary_db, virtual_table.primary_table)]
        
        # Parse union tables
        for ut in virtual_table.union_tables:
            if (ut.database is None or ut.database == "") and '/' in ut.table_name:
                parts = ut.table_name.split('/', 1)
                db, table = parts if len(parts) == 2 else (primary_db, ut.table_name)
            else:
                db = ut.database if ut.database else primary_db
                table = ut.table_name
            table_refs.append((db, table))
        
        return table_refs

    def _build_field_lists(
        self,
        query_desc: QueryDescription
    ) -> Tuple[List[Tuple[str, Dimension]], List[Tuple[str, Measure]]]:
        """Build ordered lists of (field_key, field) tuples for dimensions and measures."""
        dimension_fields = []
        for dim in query_desc.dimensions:
            if dim.field not in ("_source_database", "_source_table"):
                field_key = f"{dim.field}_{dim.date_part}_{dim.date_mode}" if (dim.date_part and dim.date_mode) else dim.field
                dimension_fields.append((field_key, dim))
        
        measure_fields = []
        for measure in query_desc.measures:
            field_key = measure.alias if measure.alias else f"{measure.aggregation}({measure.field})"
            measure_fields.append((field_key, measure))
        
        return dimension_fields, measure_fields

    def _parse_select_expressions(
        self, 
        select_clause: str, 
        quote_char: str
    ) -> Dict[str, str]:
        """Parse SELECT clause to extract expression-to-alias mapping."""
        # Split by comma, respecting nested parentheses
        select_items_raw = []
        paren_depth = 0
        current_item = []
        
        for char in select_clause:
            if char == '(':
                paren_depth += 1
            elif char == ')':
                paren_depth -= 1
            elif char == ',' and paren_depth == 0:
                select_items_raw.append(''.join(current_item).strip())
                current_item = []
                continue
            current_item.append(char)
        
        if current_item:
            select_items_raw.append(''.join(current_item).strip())
        
        # Extract aliases
        expressions = {}
        pattern = r'^(.+?)\s+(?:AS\s+)?' + re.escape(quote_char) + r'([^' + re.escape(quote_char) + r']+)' + re.escape(quote_char) + r'$'
        
        for item in select_items_raw:
            match = re.match(pattern, item.strip(), re.IGNORECASE)
            if match:
                expressions[match.group(2)] = match.group(1).strip()
        
        return expressions

    def _build_null_column(
        self, 
        field_key: str, 
        is_measure: bool, 
        db_type: str, 
        quote_char: str
    ) -> str:
        """Build NULL column expression with appropriate casting."""
        if is_measure and db_type == 'clickhouse':
            return f"CAST(NULL AS Nullable(Float64)) AS {quote_char}{field_key}{quote_char}"
        return f"NULL AS {quote_char}{field_key}{quote_char}"

    def _build_source_filter_where_clauses(
        self,
        filters: List[Filter],
        quote_char: str
    ) -> List[str]:
        """Build WHERE clauses for source tracking filters (_source_database, _source_table)."""
        where_clauses = []
        
        for filt in filters:
            field_quoted = f"{quote_char}{filt.field}{quote_char}"
            
            if filt.operator == '=':
                where_clauses.append(f"{field_quoted} = '{filt.value}'")
            elif filt.operator == '!=':
                where_clauses.append(f"{field_quoted} != '{filt.value}'")
            elif filt.operator == 'in':
                values = "', '".join(str(v) for v in filt.value)
                where_clauses.append(f"{field_quoted} IN ('{values}')")
            elif filt.operator == 'not in':
                values = "', '".join(str(v) for v in filt.value)
                where_clauses.append(f"{field_quoted} NOT IN ('{values}')")
            elif filt.operator == 'like':
                where_clauses.append(f"{field_quoted} LIKE '{filt.value}'")
        
        return where_clauses

    def _build_source_only_query(
        self,
        database: str,
        table_name: str,
        has_source_db_dim: bool,
        has_source_table_dim: bool,
        quote_char: str,
    ) -> str:
        """
        Build a simple query when only source tracking columns are requested.
        
        Args:
            database: Database name
            table_name: Table name
            has_source_db_dim: Whether _source_database is requested
            has_source_table_dim: Whether _source_table is requested
            quote_char: Quote character to use
            
        Returns:
            SQL query string
        """
        if database:
            table_reference = f"{quote_char}{database}{quote_char}.{quote_char}{table_name}{quote_char}"
        else:
            table_reference = f"{quote_char}{table_name}{quote_char}"
        
        source_cols = []
        if has_source_db_dim:
            source_cols.append(f"'{database}' AS {quote_char}_source_database{quote_char}")
        if has_source_table_dim:
            source_cols.append(f"'{table_name}' AS {quote_char}_source_table{quote_char}")
        
        return f"SELECT {', '.join(source_cols)} FROM {table_reference} LIMIT 1"

    def _build_null_only_query(
        self,
        database: str,
        table_name: str,
        missing_dimension_keys: List[str],
        missing_measure_keys: List[Tuple[str, Measure]],
        db_type: str,
        quote_char: str,
    ) -> str:
        """
        Build a query with only NULL values when all requested fields are missing.
        
        Args:
            database: Database name
            table_name: Table name
            missing_dimension_keys: List of dimension field keys that are missing
            missing_measure_keys: List of (field_key, measure) tuples that are missing
            db_type: Database type (e.g., 'clickhouse')
            quote_char: Quote character to use
            
        Returns:
            SQL query string with NULL values
        """
        if database:
            table_reference = f"{quote_char}{database}{quote_char}.{quote_char}{table_name}{quote_char}"
        else:
            table_reference = f"{quote_char}{table_name}{quote_char}"
        
        select_items = []
        
        # Add NULL for all dimensions (in order)
        for field_key in missing_dimension_keys:
            select_items.append(f"NULL AS {quote_char}{field_key}{quote_char}")
        
        # Add NULL for all measures (in order)
        for field_key, measure in missing_measure_keys:
            if db_type == 'clickhouse':
                select_items.append(f"CAST(NULL AS Nullable(Float64)) AS {quote_char}{field_key}{quote_char}")
            else:
                select_items.append(f"NULL AS {quote_char}{field_key}{quote_char}")
        
        # Determine query type:
        # - If any dimensions: return 0 rows (dimensions without values don't make sense)
        # - If only measures: return 1 NULL row for aggregation
        if missing_dimension_keys:
            sql = f"SELECT {', '.join(select_items)} FROM {table_reference} WHERE 1=0"
            self._logger.info(f"All dimensions missing from table {table_name}, generated empty result (0 rows)")
        else:
            sql = f"SELECT {', '.join(select_items)} FROM {table_reference} LIMIT 1"
            self._logger.info(f"All measures missing from table {table_name}, generated NULL-only aggregated query (1 row)")
        
        return sql

    def _rebuild_select_with_nulls(
        self,
        single_sql: str,
        all_dimension_fields: List[Tuple[str, Dimension]],
        all_measure_fields: List[Tuple[str, Measure]],
        table_columns: Set[str],
        table_name: str,
        db_type: str,
        quote_char: str,
    ) -> str:
        """
        Rebuild the SELECT clause to include all fields in correct order, with NULLs for missing fields.
        
        Args:
            single_sql: Generated SQL from single table translation
            all_dimension_fields: All dimension fields requested
            all_measure_fields: All measure fields requested
            table_columns: Set of columns that exist in this table
            table_name: Table name (for logging)
            db_type: Database type (e.g., 'clickhouse')
            quote_char: Quote character to use
            
        Returns:
            Rebuilt SQL with all fields in correct order
        """
        if "FROM" not in single_sql:
            return single_sql
        
        select_clause, from_and_rest = single_sql.split("FROM", 1)
        
        # Extract the SELECT expressions that were generated (with optimizations applied)
        select_clause = select_clause.strip()
        if select_clause.upper().startswith("SELECT"):
            select_clause = select_clause[6:].strip()
        if select_clause.upper().startswith("DISTINCT"):
            select_clause = select_clause[8:].strip()
        
        # Parse existing SELECT items to extract expressions by alias
        existing_expressions = self._parse_select_expressions(select_clause, quote_char)
        
        # Build new SELECT clause with ALL fields in correct order
        select_items = []
        
        # Add dimensions in order
        for field_key, dim in all_dimension_fields:
            if not table_columns or dim.field in table_columns:
                # Field exists - use the expression from generated SQL (preserves optimizations)
                if field_key in existing_expressions:
                    expr = existing_expressions[field_key]
                    select_items.append(f"{expr} AS {quote_char}{field_key}{quote_char}")
                else:
                    # Fallback: use raw field
                    select_items.append(f"{quote_char}{dim.field}{quote_char} AS {quote_char}{field_key}{quote_char}")
            else:
                # Field missing - NULL
                select_items.append(self._build_null_column(field_key, False, db_type, quote_char))
        
        # Add measures in order
        for field_key, measure in all_measure_fields:
            if not table_columns or measure.field in table_columns:
                # Field exists - use expression from generated SQL
                if field_key in existing_expressions:
                    expr = existing_expressions[field_key]
                else:
                    # Fallback: build aggregation manually
                    expr = f"{measure.aggregation.upper()}({quote_char}{measure.field}{quote_char})"
                
                # Add type cast for ClickHouse
                if db_type == 'clickhouse':
                    select_items.append(f"CAST({expr} AS Nullable(Float64)) AS {quote_char}{field_key}{quote_char}")
                else:
                    select_items.append(f"{expr} AS {quote_char}{field_key}{quote_char}")
            else:
                # Field missing - NULL
                select_items.append(self._build_null_column(field_key, True, db_type, quote_char))
        
        # Rebuild the complete SQL with ordered SELECT
        rebuilt_sql = f"SELECT {', '.join(select_items)} FROM{from_and_rest}"
        self._logger.debug(f"Rebuilt SQL for table {table_name} with {len(select_items)} fields in correct order, preserving optimizations")
        
        return rebuilt_sql

    def _build_outer_query(
        self,
        union_sql: str,
        all_measure_fields: List[Tuple[str, Measure]],
        needs_outer_aggregation: bool,
        needs_distinct: bool,
        distinct_columns: List[str],
        source_db_filters: List[Filter],
        source_table_filters: List[Filter],
        query_desc: QueryDescription,
        quote_char: str,
    ) -> str:
        """
        Build the outer query wrapper around UNION SQL for aggregation, DISTINCT, WHERE, ORDER BY, LIMIT.
        
        Args:
            union_sql: The UNION ALL SQL
            all_measure_fields: All measure fields requested
            needs_outer_aggregation: Whether to apply outer aggregation
            needs_distinct: Whether to apply DISTINCT
            distinct_columns: Columns to apply DISTINCT on
            source_db_filters: Filters on _source_database
            source_table_filters: Filters on _source_table
            query_desc: Query description with orderBy, limit, offset
            quote_char: Quote character to use
            
        Returns:
            Complete SQL with outer query wrapper
        """
        if needs_outer_aggregation:
            # Build outer aggregation query for measure-only queries
            # Re-aggregate across all union results to get overall min/max/sum/etc
            select_parts = []
            for field_key, measure in all_measure_fields:
                agg = measure.aggregation.upper()
                # Map aggregations that need re-aggregation
                if agg == "MIN":
                    select_parts.append(f"MIN({quote_char}{field_key}{quote_char}) AS {quote_char}{field_key}{quote_char}")
                elif agg == "MAX":
                    select_parts.append(f"MAX({quote_char}{field_key}{quote_char}) AS {quote_char}{field_key}{quote_char}")
                elif agg == "SUM":
                    select_parts.append(f"SUM({quote_char}{field_key}{quote_char}) AS {quote_char}{field_key}{quote_char}")
                elif agg == "COUNT":
                    select_parts.append(f"SUM({quote_char}{field_key}{quote_char}) AS {quote_char}{field_key}{quote_char}")
                elif agg == "COUNT_DISTINCT":
                    # Can't re-aggregate count distinct, keep as-is
                    select_parts.append(f"SUM({quote_char}{field_key}{quote_char}) AS {quote_char}{field_key}{quote_char}")
                elif agg == "AVG":
                    # For average, we need weighted average if possible, otherwise just average the averages
                    select_parts.append(f"AVG({quote_char}{field_key}{quote_char}) AS {quote_char}{field_key}{quote_char}")
                else:
                    # Default: just select the field
                    select_parts.append(f"{quote_char}{field_key}{quote_char}")
            
            outer_sql = f"SELECT {', '.join(select_parts)} FROM (\n{union_sql}\n) AS union_result"
            self._logger.info("Applied outer aggregation for measure-only UNION query to get overall min/max/sum")
        elif needs_distinct and distinct_columns:
            # Include source tracking columns in the SELECT even with DISTINCT
            # They're excluded from the DISTINCT list but must be in the result
            all_columns = distinct_columns + [
                f"{quote_char}_source_database{quote_char}",
                f"{quote_char}_source_table{quote_char}"
            ]
            columns_list = ", ".join(all_columns)
            outer_sql = f"SELECT DISTINCT {columns_list} FROM (\n{union_sql}\n) AS union_result"
            self._logger.info("Applied DISTINCT to filter value query in UNION mode (including source columns)")
        else:
            outer_sql = f"SELECT * FROM (\n{union_sql}\n) AS union_result"

        # Build WHERE clauses for source tracking filters
        where_clauses = []
        where_clauses.extend(self._build_source_filter_where_clauses(source_db_filters, quote_char))
        where_clauses.extend(self._build_source_filter_where_clauses(source_table_filters, quote_char))

        if where_clauses:
            outer_sql += f"\nWHERE {' AND '.join(where_clauses)}"

        if query_desc.orderBy:
            order_fragments = []
            for order in query_desc.orderBy:
                direction = "DESC" if order.direction == 'desc' else "ASC"
                order_fragments.append(f"{quote_char}{order.field}{quote_char} {direction}")
            outer_sql += f"\nORDER BY {', '.join(order_fragments)}"

        if query_desc.limit is not None:
            outer_sql += f"\nLIMIT {query_desc.limit}"
            if query_desc.offset:
                outer_sql += f" OFFSET {query_desc.offset}"

        return outer_sql

    def translate(
        self,
        query_desc: QueryDescription,
        *,
        db_type: str,
        quote_char: str,
        with_sampling: bool,
        with_optimization: bool,
        optimizer: Optional[object],
    ) -> Tuple[str, List[Dict]]:
        virtual_table = query_desc.virtual_table
        if not virtual_table or virtual_table.mode != "union":
            raise ValueError("Query description must have virtual_table in union mode")

        # Parse table references from query
        table_refs = self._parse_table_references(query_desc)
        self._logger.info("Building UNION ALL query for tables: %s", 
                         [f"{db}.{tbl}" if db else tbl for db, tbl in table_refs])

        # Fetch column information for all tables
        table_columns_map = {
            (db, table): self._get_table_columns(db, table) 
            for db, table in table_refs
        }
        
        # Build ordered field lists
        all_dimension_fields, all_measure_fields = self._build_field_lists(query_desc)

        union_queries: List[str] = []
        for database, table_name in table_refs:
            table_columns = table_columns_map.get((database, table_name), set())
            
            # Check for source tracking dimensions
            has_source_db_dim = any(d.field == "_source_database" for d in query_desc.dimensions)
            has_source_table_dim = any(d.field == "_source_table" for d in query_desc.dimensions)

            # Special case: only source tracking columns requested
            if (has_source_db_dim or has_source_table_dim) and not all_dimension_fields and not all_measure_fields:
                simple_sql = self._build_source_only_query(
                    database, table_name, has_source_db_dim, has_source_table_dim, quote_char
                )
                union_queries.append(f"({simple_sql})")
                continue

            # Build query for this table with consistent column order
            # Create a query descriptor with only fields that exist in this table
            if hasattr(query_desc, "model_copy"):
                single_table_desc = query_desc.model_copy(deep=True)
            else:  # pragma: no cover - fallback for Pydantic < 2.0
                single_table_desc = query_desc.copy(deep=True)
            single_table_desc.target_table = table_name
            single_table_desc.target_database = database
            single_table_desc.virtual_table = None
            
            # Filter to only dimensions that exist in this table
            existing_dimensions = []
            missing_dimension_keys = []
            for field_key, dim in all_dimension_fields:
                if not table_columns or dim.field in table_columns:
                    existing_dimensions.append(dim)
                else:
                    missing_dimension_keys.append(field_key)
            
            # Filter to only measures that exist in this table
            existing_measures = []
            missing_measure_keys = []
            for field_key, measure in all_measure_fields:
                if not table_columns or measure.field in table_columns:
                    existing_measures.append(measure)
                else:
                    missing_measure_keys.append((field_key, measure))
            
            single_table_desc.dimensions = existing_dimensions
            single_table_desc.measures = existing_measures
            # Filter out source tracking filters (handled in outer query)
            single_table_desc.filters = [f for f in single_table_desc.filters 
                                        if f.field not in ("_source_database", "_source_table")]
            single_table_desc.orderBy = []
            single_table_desc.limit = None
            single_table_desc.offset = None

            # Skip tables that have no measures when measures are requested
            # This prevents tables without the requested fields from polluting results with NULL rows
            if all_measure_fields and not existing_measures:
                self._logger.info(f"Skipping table {table_name} - has dimensions but none of the requested measures")
                continue

            # Check if ALL fields are missing from this table
            if table_columns and not existing_dimensions and not existing_measures:
                single_sql = self._build_null_only_query(
                    database, table_name, missing_dimension_keys, missing_measure_keys, db_type, quote_char
                )
            else:
                # Generate SQL for fields that exist in this table
                single_sql, _ = self._translate_single_table(
                    single_table_desc,
                    table_name,
                    db_type,
                    with_sampling=with_sampling,
                    with_optimization=with_optimization,
                    optimizer=optimizer,
                )
                
                # Rebuild SELECT clause to include all fields in correct order, with NULLs for missing
                single_sql = self._rebuild_select_with_nulls(
                    single_sql, all_dimension_fields, all_measure_fields,
                    table_columns, table_name, db_type, quote_char
                )

            # Add source tracking columns to the query
            if "FROM" in single_sql:
                select_part, from_part = single_sql.split("FROM", 1)
                select_part = select_part.rstrip()
                if select_part.endswith(','):
                    select_part = select_part[:-1]
                
                # Add both _source_database and _source_table
                modified_sql = (
                    f"{select_part}, "
                    f"'{database}' AS {quote_char}_source_database{quote_char}, "
                    f"'{table_name}' AS {quote_char}_source_table{quote_char} "
                    f"FROM{from_part}"
                )
                union_queries.append(f"({modified_sql})")
            else:
                union_queries.append(f"({single_sql})")

        union_sql = "\nUNION ALL\n".join(union_queries)

        # Determine if DISTINCT is needed:
        # 1. Explicitly requested via fetch_filter_values flag
        # 2. For dimension-only queries (no measures) to avoid duplicate combinations in UNION
        has_dimensions = bool(all_dimension_fields)
        has_measures = bool(all_measure_fields)
        needs_distinct = query_desc.fetch_filter_values is True or (has_dimensions and not has_measures)
        
        # Check if we have source tracking dimensions (_source_database, _source_table)
        has_source_dimensions = any(
            dim.field in ("_source_database", "_source_table") 
            for dim in query_desc.dimensions
        )
        
        # For measure-only queries (no dimensions at all, including source tracking), 
        # we need to aggregate across all union results
        # Example: MIN/MAX queries for filter ranges need the overall min/max, not per-table
        # But do NOT apply if we have source tracking dimensions or ORDER BY (chart queries)
        needs_outer_aggregation = (
            has_measures 
            and not has_dimensions 
            and not has_source_dimensions
            and not bool(query_desc.orderBy)
        )
        
        distinct_columns: List[str] = []
        if needs_distinct:
            for dim in query_desc.dimensions:
                # Skip source tracking columns in distinct list
                if dim.field in ("_source_database", "_source_table"):
                    continue
                if dim.date_part and dim.date_mode:
                    col_name = f"{dim.field}_{dim.date_part}_{dim.date_mode}"
                else:
                    col_name = dim.field
                distinct_columns.append(f"{quote_char}{col_name}{quote_char}")
            
            if query_desc.fetch_filter_values:
                self._logger.info(
                    "Filter value query (fetch_filter_values=True) - will apply DISTINCT on: %s",
                    distinct_columns,
                )
            else:
                self._logger.info(
                    "Dimension-only UNION query - will apply DISTINCT to avoid duplicate combinations on: %s",
                    distinct_columns,
                )

        # Get filters for source tracking columns
        source_db_filters = [f for f in query_desc.filters if f.field == "_source_database"]
        source_table_filters = [f for f in query_desc.filters if f.field == "_source_table"]
        needs_outer_query = (
            bool(query_desc.orderBy)
            or query_desc.limit is not None
            or query_desc.offset is not None
            or bool(source_db_filters)
            or bool(source_table_filters)
            or needs_distinct
            or needs_outer_aggregation
        )

        if needs_outer_query:
            final_sql = self._build_outer_query(
                union_sql, all_measure_fields, needs_outer_aggregation,
                needs_distinct, distinct_columns, source_db_filters, source_table_filters,
                query_desc, quote_char
            )
        else:
            final_sql = union_sql

        self._logger.info("Generated UNION ALL query: %s...", final_sql[:200])
        return final_sql, []
