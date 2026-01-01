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

    def _apply_result_budget(
        self,
        sql: str,
        query_desc: QueryDescription,
        *,
        db_type: str,
        quote_char: str,
    ) -> str:
        """
        Apply result budget / sampling to the final UNION SQL.
        
        Supports strategies:
        - 'none': No sampling
        - 'random': Random sampling with ORDER BY rand() LIMIT n
        - 'stratified': Proportional sampling across categories
        - 'preserve_extremes': Include min/max rows for stable axis scales
        """
        budget = getattr(query_desc, "result_budget", None)
        if not budget:
            return sql
        if not getattr(budget, "max_rows", None) or budget.strategy == "none":
            return sql

        # Only apply to "raw" queries (no measures = dimension-only scatter/tick plots)
        if query_desc.measures:
            return sql

        max_rows = int(budget.max_rows)
        strategy = budget.strategy
        base_sql = sql.strip().rstrip(";")

        if strategy == "preserve_extremes":
            # Preserve min/max rows for stable axis scales in scatter plots
            preserve_fields = budget.preserve_fields
            if not preserve_fields:
                # Auto-detect: use continuous dimensions
                preserve_fields = [
                    d.field for d in query_desc.dimensions
                    if d.flavour == 'continuous'
                ]

            if not preserve_fields:
                self._logger.info("preserve_extremes: no continuous fields found, falling back to random")
                strategy = "random"
            else:
                rand_func = "rand()" if db_type == "clickhouse" else "random()"

                # Build CTE-based query that preserves extremes
                # LIMIT 1 is critical: many rows may share the same min/max value
                extreme_selects = []
                for field in preserve_fields:
                    qf = f"{quote_char}{field}{quote_char}"
                    extreme_selects.append(
                        f"SELECT * FROM base WHERE {qf} = (SELECT MIN({qf}) FROM base) LIMIT 1"
                    )
                    extreme_selects.append(
                        f"SELECT * FROM base WHERE {qf} = (SELECT MAX({qf}) FROM base) LIMIT 1"
                    )

                extremes_union = "\nUNION ALL\n".join(extreme_selects)
                reserved_for_extremes = len(preserve_fields) * 2
                sample_limit = max(1, max_rows - reserved_for_extremes)

                return f"""WITH base AS (
{base_sql}
),
extremes AS (
{extremes_union}
),
sample AS (
SELECT * FROM base ORDER BY {rand_func} LIMIT {sample_limit}
)
SELECT * FROM extremes
UNION ALL
SELECT * FROM sample""".strip()

        # Fallback: random global sample to max_rows
        rand_func = "rand" if db_type == "clickhouse" else "random"
        return f'SELECT * FROM (\n{base_sql}\n) AS base\nORDER BY {rand_func}()\nLIMIT {max_rows}'

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

    def _map_output_type_to_clickhouse(self, output_type: str) -> str:
        """
        Map virtual column output types to ClickHouse Nullable types.
        
        Args:
            output_type: The output type from VirtualColumnDefinition (e.g., 'DOUBLE', 'INTEGER', 'VARCHAR')
            
        Returns:
            ClickHouse-compatible Nullable type string
        """
        type_upper = output_type.upper()
        # Map common type names to ClickHouse types
        type_mapping = {
            'DOUBLE': 'Float64',
            'FLOAT': 'Float64',
            'FLOAT64': 'Float64',
            'REAL': 'Float64',
            'INTEGER': 'Int64',
            'INT': 'Int64',
            'INT64': 'Int64',
            'BIGINT': 'Int64',
            'SMALLINT': 'Int32',
            'INT32': 'Int32',
            'VARCHAR': 'String',
            'STRING': 'String',
            'TEXT': 'String',
            'BOOLEAN': 'UInt8',
            'BOOL': 'UInt8',
        }
        return type_mapping.get(type_upper, type_upper)

    def _build_null_column(
        self, 
        field_key: str, 
        is_measure: bool, 
        db_type: str, 
        quote_char: str,
        output_type: Optional[str] = None
    ) -> str:
        """
        Build NULL column expression with appropriate casting.
        
        Args:
            field_key: The column alias/key
            is_measure: Whether this is a measure column
            db_type: Database type (e.g., 'clickhouse')
            quote_char: Quote character for identifiers
            output_type: Optional type hint for casting (e.g., from virtual column definition)
            
        Returns:
            SQL expression for NULL column with proper casting
        """
        if db_type == 'clickhouse':
            # For ClickHouse, we must cast NULL to avoid 'Nothing' type errors in Arrow format
            if output_type:
                ch_type = self._map_output_type_to_clickhouse(output_type)
                return f"CAST(NULL AS Nullable({ch_type})) AS {quote_char}{field_key}{quote_char}"
            elif is_measure:
                return f"CAST(NULL AS Nullable(Float64)) AS {quote_char}{field_key}{quote_char}"
            else:
                # Default for non-measure columns without type hint: use String for safety
                # String is the most flexible type for dimensions
                return f"CAST(NULL AS Nullable(String)) AS {quote_char}{field_key}{quote_char}"
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
        virtual_columns: Optional[List] = None,
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
            virtual_columns: Optional list of VirtualColumnDefinition objects for type hints
            
        Returns:
            SQL query string with NULL values
        """
        if database:
            table_reference = f"{quote_char}{database}{quote_char}.{quote_char}{table_name}{quote_char}"
        else:
            table_reference = f"{quote_char}{table_name}{quote_char}"
        
        # Build a lookup map for virtual column output types
        vc_type_map: Dict[str, Optional[str]] = {}
        if virtual_columns:
            for vc in virtual_columns:
                vc_type_map[vc.name] = getattr(vc, 'output_type', None)
        
        select_items = []
        
        # Add NULL for all dimensions (in order) - use virtual column type hints when available
        for field_key in missing_dimension_keys:
            output_type = vc_type_map.get(field_key)
            select_items.append(self._build_null_column(field_key, False, db_type, quote_char, output_type))
        
        # Add NULL for all measures (in order)
        for field_key, measure in missing_measure_keys:
            select_items.append(self._build_null_column(field_key, True, db_type, quote_char))
        
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
        virtual_columns: Optional[List] = None,
        vc_source_map: Optional[Dict[str, List[str]]] = None,
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
            virtual_columns: Optional list of VirtualColumnDefinition objects for type hints
            vc_source_map: Map of virtual column name -> source field names
            
        Returns:
            Rebuilt SQL with all fields in correct order
        """
        # Build a lookup map for virtual column output types
        vc_type_map: Dict[str, Optional[str]] = {}
        if virtual_columns:
            for vc in virtual_columns:
                vc_type_map[vc.name] = getattr(vc, 'output_type', None)
        
        # Use provided vc_source_map or empty dict
        vc_source_map = vc_source_map or {}
        
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
            # Check if this is a virtual column
            is_virtual = dim.field in vc_source_map
            
            # Determine if field can be computed for this table
            field_available = False
            if is_virtual:
                # Virtual column: check if source fields exist
                field_available = self._can_compute_virtual_column(dim.field, vc_source_map, table_columns)
            else:
                # Physical column: check if column exists
                field_available = not table_columns or dim.field in table_columns
            
            if field_available:
                # Field exists - use the expression from generated SQL (preserves optimizations)
                if field_key in existing_expressions:
                    expr = existing_expressions[field_key]
                    select_items.append(f"{expr} AS {quote_char}{field_key}{quote_char}")
                else:
                    # Fallback: select the (already-aliased) output column name.
                    # This is critical for derived dimension aliases like datetime parts:
                    # e.g. dim.field="utc" but field_key="utc_second_timeline". In optimized/budget-wrapped SQL,
                    # the top-level FROM may not expose the raw base field ("utc"), but it does expose the alias.
                    select_items.append(f"{quote_char}{field_key}{quote_char} AS {quote_char}{field_key}{quote_char}")
            else:
                # Field missing - NULL (use virtual column output_type if available)
                output_type = vc_type_map.get(dim.field)
                select_items.append(self._build_null_column(field_key, False, db_type, quote_char, output_type))
        
        # Add measures in order
        for field_key, measure in all_measure_fields:
            # COUNT(*) is valid for any table; it does not require a physical column named "*".
            is_star_count = measure.aggregation == "count" and measure.field == "*"
            if not table_columns or measure.field in table_columns or is_star_count:
                # Field exists - use expression from generated SQL
                if field_key in existing_expressions:
                    expr = existing_expressions[field_key]
                else:
                    # Fallback: select the (already-aliased) output column name.
                    # The single-table SQL is expected to have produced a column with this alias,
                    # even if it is nested inside sampling/budget wrappers.
                    expr = f"{quote_char}{field_key}{quote_char}"
                
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
            # For fetch_filter_values queries, we want unique values across all tables
            # so we should NOT include source tracking columns (they cause duplicates)
            # For regular dimension-only queries, we include source columns for identification
            if query_desc.fetch_filter_values:
                columns_list = ", ".join(distinct_columns)
                outer_sql = f"SELECT DISTINCT {columns_list} FROM (\n{union_sql}\n) AS union_result"
                self._logger.info("Applied DISTINCT to filter value query in UNION mode (unique across all tables)")
            else:
                # Include source tracking columns in the SELECT even with DISTINCT
                # They're excluded from the DISTINCT list but must be in the result
                all_columns = distinct_columns + [
                    f"{quote_char}_source_database{quote_char}",
                    f"{quote_char}_source_table{quote_char}"
                ]
                columns_list = ", ".join(all_columns)
                outer_sql = f"SELECT DISTINCT {columns_list} FROM (\n{union_sql}\n) AS union_result"
                self._logger.info("Applied DISTINCT to dimension-only UNION query (including source columns)")
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

    def _get_virtual_column_source_fields(
        self,
        virtual_columns: Optional[List],
    ) -> Dict[str, List[str]]:
        """
        Extract source field names for each virtual column.
        
        This is used to determine if a virtual column can be computed
        from the columns available in a specific table.
        
        Args:
            virtual_columns: List of VirtualColumnDefinition objects
            
        Returns:
            Dictionary mapping virtual column name -> list of source field names
        """
        if not virtual_columns:
            return {}
        
        vc_source_map: Dict[str, List[str]] = {}
        for vc in virtual_columns:
            # Extract field references from expression using regex
            # Pattern matches identifiers: word or word.word
            expression = vc.expression
            pattern = r'\b([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)\b'
            matches = re.findall(pattern, expression)
            
            # Filter out SQL keywords and function names
            sql_keywords = {
                'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'AND', 'OR', 'NOT',
                'IS', 'NULL', 'TRUE', 'FALSE', 'IN', 'BETWEEN', 'LIKE',
                'ASC', 'DESC', 'AS', 'FROM', 'WHERE', 'GROUP', 'ORDER', 'BY',
            }
            function_names = {
                'ROUND', 'ABS', 'COALESCE', 'CONCAT', 'UPPER', 'LOWER',
                'LENGTH', 'SUBSTRING', 'CAST', 'SUM', 'AVG', 'COUNT', 
                'MIN', 'MAX', 'FLOOR', 'CEIL', 'SQRT', 'POW', 'MOD', 'SPLIT', 'INT'
            }
            
            source_fields = []
            for match in matches:
                if match.upper() not in sql_keywords and match.upper() not in function_names:
                    if match not in source_fields:
                        source_fields.append(match)
            
            vc_source_map[vc.name] = source_fields
            self._logger.debug(f"Virtual column '{vc.name}' depends on fields: {source_fields}")
        
        return vc_source_map
    
    def _can_compute_virtual_column(
        self,
        vc_name: str,
        vc_source_map: Dict[str, List[str]],
        table_columns: Set[str],
    ) -> bool:
        """
        Check if a virtual column can be computed from available table columns.
        
        Args:
            vc_name: Name of the virtual column
            vc_source_map: Map of virtual column name -> source fields
            table_columns: Set of columns available in the table
            
        Returns:
            True if all source fields exist in the table
        """
        if not table_columns:
            # No column info available - assume it can be computed (backward compatibility)
            return True
        
        source_fields = vc_source_map.get(vc_name, [])
        if not source_fields:
            # No source fields identified - assume it can't be computed
            return False
        
        # Check if ALL source fields exist in the table
        return all(field in table_columns for field in source_fields)

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
        
        # Build map of virtual column source fields for determining availability per-table
        vc_source_map = self._get_virtual_column_source_fields(query_desc.virtual_columns)
        
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
            # Don't apply result_budget to sub-queries - it will be applied to the final UNION SQL
            single_table_desc.result_budget = None
            
            # Filter to only dimensions that exist in this table
            # For virtual columns, check if source fields exist (not the virtual column name itself)
            existing_dimensions = []
            missing_dimension_keys = []
            for field_key, dim in all_dimension_fields:
                # Check if this is a virtual column
                is_virtual = dim.field in vc_source_map
                
                if is_virtual:
                    # For virtual columns, check if source fields exist in table
                    if self._can_compute_virtual_column(dim.field, vc_source_map, table_columns):
                        existing_dimensions.append(dim)
                        self._logger.debug(f"Virtual column '{dim.field}' can be computed for table {table_name}")
                    else:
                        missing_dimension_keys.append(field_key)
                        self._logger.debug(f"Virtual column '{dim.field}' cannot be computed for table {table_name} - missing source fields")
                elif not table_columns or dim.field in table_columns:
                    # Physical column: exists if in table_columns
                    existing_dimensions.append(dim)
                else:
                    missing_dimension_keys.append(field_key)
            
            # Filter to only measures that exist in this table
            existing_measures = []
            missing_measure_keys = []
            for field_key, measure in all_measure_fields:
                # COUNT(*) is valid for any table; it does not require a column named "*".
                is_star_count = measure.aggregation == "count" and measure.field == "*"
                if not table_columns or measure.field in table_columns or is_star_count:
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

            # If the query has filters on fields that do not exist in this table, this table must
            # contribute an empty result set (those rows would have NULLs for the missing field
            # in the aligned UNION schema, and thus fail the filter predicates).
            #
            # Without this guard, ClickHouse/DuckDB will error with UNKNOWN_IDENTIFIER.
            if table_columns:
                missing_filter_fields = [
                    f.field for f in single_table_desc.filters
                    if f.field not in table_columns
                ]
                if missing_filter_fields:
                    self._logger.info(
                        "Skipping table %s.%s due to missing filter fields: %s",
                        database, table_name, missing_filter_fields,
                    )
                    has_dimensions = bool(all_dimension_fields)
                    has_measures = bool(all_measure_fields)

                    # For dimension queries, return 0 rows with the aligned schema.
                    if has_dimensions:
                        dim_keys = [field_key for field_key, _d in all_dimension_fields]
                        single_sql = self._build_null_only_query(
                            database,
                            table_name,
                            dim_keys,
                            all_measure_fields,
                            db_type,
                            quote_char,
                            virtual_columns=query_desc.virtual_columns,
                        )
                    # For measure-only queries, return a single "empty-set" row.
                    # COUNT(*) over an empty set should be 0; other aggregations can be NULL.
                    elif has_measures:
                        select_items: List[str] = []
                        for field_key, measure in all_measure_fields:
                            is_count = measure.aggregation == "count"
                            if is_count:
                                if db_type == "clickhouse":
                                    select_items.append(
                                        f"CAST(0 AS Nullable(Float64)) AS {quote_char}{field_key}{quote_char}"
                                    )
                                else:
                                    select_items.append(f"0 AS {quote_char}{field_key}{quote_char}")
                            else:
                                select_items.append(self._build_null_column(field_key, True, db_type, quote_char))

                        # Include source tracking columns so outer filters (e.g. _source_database IN (...))
                        # remain valid.
                        select_items.append(f"'{database}' AS {quote_char}_source_database{quote_char}")
                        select_items.append(f"'{table_name}' AS {quote_char}_source_table{quote_char}")
                        union_queries.append(f"(SELECT {', '.join(select_items)})")
                        continue
                    else:
                        # No fields requested besides (maybe) source columns; safe to contribute nothing.
                        continue

                    # For the dimension-query empty-set SQL, fall through to the normal source-column
                    # injection below (it has a FROM clause we can augment).
                    # Ensure we don't apply the missing filters.
                    single_table_desc.filters = []
                    # We'll also skip the normal translation step below since we already have SQL.
                    # Rebuild it to include full column order + source tracking.
                    single_sql = self._rebuild_select_with_nulls(
                        single_sql, all_dimension_fields, all_measure_fields,
                        table_columns, table_name, db_type, quote_char,
                        virtual_columns=query_desc.virtual_columns,
                        vc_source_map=vc_source_map
                    )

                    # Add source tracking columns to the query
                    if "FROM" in single_sql:
                        select_part, from_part = single_sql.split("FROM", 1)
                        select_part = select_part.rstrip()
                        if select_part.endswith(','):
                            select_part = select_part[:-1]
                        modified_sql = (
                            f"{select_part}, "
                            f"'{database}' AS {quote_char}_source_database{quote_char}, "
                            f"'{table_name}' AS {quote_char}_source_table{quote_char} "
                            f"FROM{from_part}"
                        )
                        union_queries.append(f"({modified_sql})")
                    else:
                        union_queries.append(f"({single_sql})")
                    continue

            # Skip tables that have no measures when measures are requested
            # This prevents tables without the requested fields from polluting results with NULL rows
            if all_measure_fields and not existing_measures:
                self._logger.info(f"Skipping table {table_name} - has dimensions but none of the requested measures")
                continue

            # Check if ALL fields are missing from this table
            if table_columns and not existing_dimensions and not existing_measures:
                single_sql = self._build_null_only_query(
                    database, table_name, missing_dimension_keys, missing_measure_keys, db_type, quote_char,
                    virtual_columns=query_desc.virtual_columns
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
                    table_columns, table_name, db_type, quote_char,
                    virtual_columns=query_desc.virtual_columns,
                    vc_source_map=vc_source_map
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

        # If every table was skipped (e.g. schema mismatch), return a safe empty result
        # instead of generating invalid SQL like `FROM (\n\n) AS union_result`.
        if not union_queries:
            if all_measure_fields:
                parts = [f"0 AS {quote_char}{field_key}{quote_char}" for field_key, _m in all_measure_fields]
                return f"SELECT {', '.join(parts)}", []
            return "SELECT 1 WHERE 1=0", []

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
                # For filter value queries, include source tracking columns when they ARE the dimension
                # For other queries, skip them to avoid affecting DISTINCT on real data columns
                if dim.field in ("_source_database", "_source_table"):
                    if query_desc.fetch_filter_values:
                        # Include source tracking column - we want unique values for the filter dropdown
                        distinct_columns.append(f"{quote_char}{dim.field}{quote_char}")
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

        # Apply result budget to the final UNION SQL (not to individual sub-queries)
        final_sql = self._apply_result_budget(
            final_sql, query_desc, db_type=db_type, quote_char=quote_char
        )

        self._logger.info("Generated UNION ALL query: %s...", final_sql[:200])
        return final_sql, []
