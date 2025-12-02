"""Builder responsible for translating UNION virtual tables into SQL."""

from __future__ import annotations

import logging
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from backend.models.query import Dimension, Measure, QueryDescription


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

        # Build list of (database, table_name) tuples for all tables in the union
        # Primary table uses target_database from query_desc
        primary_db = query_desc.target_database or ""
        
        # Parse primary table in case it's also a qualified name
        # Using '/' separator to avoid conflicts with column names that contain dots
        if not primary_db and '/' in virtual_table.primary_table:
            parts = virtual_table.primary_table.split('/', 1)
            if len(parts) == 2:
                primary_db, primary_table = parts
                table_refs = [(primary_db, primary_table)]
            else:
                table_refs = [(primary_db, virtual_table.primary_table)]
        else:
            table_refs = [(primary_db, virtual_table.primary_table)]
        
        # Union tables can specify their own database
        for ut in virtual_table.union_tables:
            # If table_name contains '/' and no explicit database is provided,
            # treat it as a fully qualified database/table reference
            # Using '/' separator to avoid conflicts with column names that contain dots
            if (ut.database is None or ut.database == "") and '/' in ut.table_name:
                parts = ut.table_name.split('/', 1)
                if len(parts) == 2:
                    db, table = parts
                    table_refs.append((db, table))
                else:
                    # Shouldn't happen, but fallback to using primary_db
                    db = primary_db
                    table_refs.append((db, ut.table_name))
            else:
                db = ut.database if ut.database else primary_db
                table_refs.append((db, ut.table_name))
        
        self._logger.info("Building UNION ALL query for tables: %s", 
                         [f"{db}.{tbl}" if db else tbl for db, tbl in table_refs])

        # First pass: determine which fields exist in which tables
        # This ensures we can build consistent SELECT lists with proper column order
        table_columns_map = {}  # {(database, table_name): Set[column_names]}
        for database, table_name in table_refs:
            table_columns_map[(database, table_name)] = self._get_table_columns(database, table_name)
        
        # Build the complete ordered list of field names (for consistent SELECT order)
        # Order: dimensions first, then measures
        all_dimension_fields = []
        for dim in query_desc.dimensions:
            if dim.field not in ("_source_database", "_source_table"):
                if dim.date_part and dim.date_mode:
                    field_key = f"{dim.field}_{dim.date_part}_{dim.date_mode}"
                else:
                    field_key = dim.field
                all_dimension_fields.append((field_key, dim))
        
        all_measure_fields = []
        for measure in query_desc.measures:
            field_key = measure.alias if measure.alias else f"{measure.aggregation}({measure.field})"
            all_measure_fields.append((field_key, measure))

        union_queries: List[str] = []
        for database, table_name in table_refs:
            table_columns = table_columns_map.get((database, table_name), set())
            
            # Check for source tracking dimensions
            has_source_db_dim = any(d.field == "_source_database" for d in query_desc.dimensions)
            has_source_table_dim = any(d.field == "_source_table" for d in query_desc.dimensions)

            # Special case: only source tracking columns requested
            if (has_source_db_dim or has_source_table_dim) and not all_dimension_fields and not all_measure_fields:
                # Build table reference (database and table_name are already properly parsed)
                if database:
                    table_reference = f"{quote_char}{database}{quote_char}.{quote_char}{table_name}{quote_char}"
                else:
                    table_reference = f"{quote_char}{table_name}{quote_char}"
                
                source_cols = []
                if has_source_db_dim:
                    source_cols.append(f"'{database}' AS {quote_char}_source_database{quote_char}")
                if has_source_table_dim:
                    source_cols.append(f"'{table_name}' AS {quote_char}_source_table{quote_char}")
                
                simple_sql = f"SELECT {', '.join(source_cols)} FROM {table_reference} LIMIT 1"
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

            # Check if ALL fields are missing from this table
            if table_columns and not existing_dimensions and not existing_measures:
                # All requested fields are missing from this table - build NULL-only query
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
                    single_sql = f"SELECT {', '.join(select_items)} FROM {table_reference} WHERE 1=0"
                    self._logger.info(f"All dimensions missing from table {table_name}, generated empty result (0 rows)")
                else:
                    single_sql = f"SELECT {', '.join(select_items)} FROM {table_reference} LIMIT 1"
                    self._logger.info(f"All measures missing from table {table_name}, generated NULL-only aggregated query (1 row)")
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
                
                # Parse the generated SQL to extract SELECT expressions
                if "FROM" in single_sql:
                    select_clause, from_and_rest = single_sql.split("FROM", 1)
                    
                    # Extract the SELECT expressions that were generated (with optimizations applied)
                    select_clause = select_clause.strip()
                    if select_clause.upper().startswith("SELECT"):
                        select_clause = select_clause[6:].strip()
                    if select_clause.upper().startswith("DISTINCT"):
                        select_clause = select_clause[8:].strip()
                    
                    # Parse existing SELECT items to extract expressions by alias
                    import re
                    existing_expressions = {}
                    # Split by comma first, then parse each item
                    # This handles complex expressions with nested commas better
                    select_items_raw = []
                    paren_depth = 0
                    current_item = []
                    for char in select_clause:
                        if char == '(':
                            paren_depth += 1
                            current_item.append(char)
                        elif char == ')':
                            paren_depth -= 1
                            current_item.append(char)
                        elif char == ',' and paren_depth == 0:
                            select_items_raw.append(''.join(current_item).strip())
                            current_item = []
                        else:
                            current_item.append(char)
                    if current_item:
                        select_items_raw.append(''.join(current_item).strip())
                    
                    # Now parse each item to extract expression and alias
                    for item in select_items_raw:
                        # Pattern: <expression> AS `alias` or <expression> `alias`
                        pattern = r'^(.+?)\s+(?:AS\s+)?' + re.escape(quote_char) + r'([^' + re.escape(quote_char) + r']+)' + re.escape(quote_char) + r'$'
                        match = re.match(pattern, item.strip(), re.IGNORECASE)
                        if match:
                            expr = match.group(1).strip()
                            alias = match.group(2)
                            existing_expressions[alias] = expr
                    
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
                                # Fallback: use raw field (shouldn't happen if translate_single_table worked)
                                select_items.append(f"{quote_char}{dim.field}{quote_char} AS {quote_char}{field_key}{quote_char}")
                        else:
                            # Field missing - NULL
                            select_items.append(f"NULL AS {quote_char}{field_key}{quote_char}")
                    
                    # Add measures in order
                    for field_key, measure in all_measure_fields:
                        if not table_columns or measure.field in table_columns:
                            # Field exists - use expression from generated SQL and add type cast for ClickHouse
                            if field_key in existing_expressions:
                                expr = existing_expressions[field_key]
                                if db_type == 'clickhouse':
                                    select_items.append(f"CAST({expr} AS Nullable(Float64)) AS {quote_char}{field_key}{quote_char}")
                                else:
                                    select_items.append(f"{expr} AS {quote_char}{field_key}{quote_char}")
                            else:
                                # Fallback: build aggregation manually
                                agg_expr = f"{measure.aggregation.upper()}({quote_char}{measure.field}{quote_char})"
                                if db_type == 'clickhouse':
                                    select_items.append(f"CAST({agg_expr} AS Nullable(Float64)) AS {quote_char}{field_key}{quote_char}")
                                else:
                                    select_items.append(f"{agg_expr} AS {quote_char}{field_key}{quote_char}")
                        else:
                            # Field missing - NULL
                            if db_type == 'clickhouse':
                                select_items.append(f"CAST(NULL AS Nullable(Float64)) AS {quote_char}{field_key}{quote_char}")
                            else:
                                select_items.append(f"NULL AS {quote_char}{field_key}{quote_char}")
                    
                    # Rebuild the complete SQL with ordered SELECT
                    single_sql = f"SELECT {', '.join(select_items)} FROM{from_and_rest}"
                    self._logger.debug(f"Rebuilt SQL for table {table_name} with {len(select_items)} fields in correct order, preserving optimizations")

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
        
        # For measure-only queries (no dimensions), we need to aggregate across all union results
        # Example: MIN/MAX queries for filter ranges need the overall min/max, not per-table
        needs_outer_aggregation = has_measures and not has_dimensions
        
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

            where_clauses: List[str] = []
            
            # Handle _source_database filters
            for filt in source_db_filters:
                if filt.operator == '=':
                    where_clauses.append(f"{quote_char}_source_database{quote_char} = '{filt.value}'")
                elif filt.operator == '!=':
                    where_clauses.append(f"{quote_char}_source_database{quote_char} != '{filt.value}'")
                elif filt.operator == 'in':
                    values = "', '".join(str(v) for v in filt.value)
                    where_clauses.append(
                        f"{quote_char}_source_database{quote_char} IN ('{values}')"
                    )
                elif filt.operator == 'not in':
                    values = "', '".join(str(v) for v in filt.value)
                    where_clauses.append(
                        f"{quote_char}_source_database{quote_char} NOT IN ('{values}')"
                    )
                elif filt.operator == 'like':
                    where_clauses.append(
                        f"{quote_char}_source_database{quote_char} LIKE '{filt.value}'"
                    )
            
            # Handle _source_table filters
            for filt in source_table_filters:
                if filt.operator == '=':
                    where_clauses.append(f"{quote_char}_source_table{quote_char} = '{filt.value}'")
                elif filt.operator == '!=':
                    where_clauses.append(f"{quote_char}_source_table{quote_char} != '{filt.value}'")
                elif filt.operator == 'in':
                    values = "', '".join(str(v) for v in filt.value)
                    where_clauses.append(
                        f"{quote_char}_source_table{quote_char} IN ('{values}')"
                    )
                elif filt.operator == 'not in':
                    values = "', '".join(str(v) for v in filt.value)
                    where_clauses.append(
                        f"{quote_char}_source_table{quote_char} NOT IN ('{values}')"
                    )
                elif filt.operator == 'like':
                    where_clauses.append(
                        f"{quote_char}_source_table{quote_char} LIKE '{filt.value}'"
                    )

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

            final_sql = outer_sql
        else:
            final_sql = union_sql

        self._logger.info("Generated UNION ALL query: %s...", final_sql[:200])
        return final_sql, []
