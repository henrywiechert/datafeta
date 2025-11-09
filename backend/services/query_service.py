"""Service responsible for translating query descriptions into executable queries."""

import logging
from typing import Any, Dict, List, Optional, Set, Tuple

from pypika import Criterion, Order, Query, Table
from pypika.functions import Avg, Coalesce, Count, Max, Min, Sum
from pypika.terms import Function

from backend.exceptions import QueryGenerationError
from backend.models.query import Filter, Measure, OrderBy, QueryDescription
from backend.services.query_components.contexts import (
    OptimizationContext,
    SelectClauseResult,
    TableContext,
)
from backend.services.query_components.select_builder import SelectClauseBuilder
from backend.services.query_components.terms import (
    CastField,
    ExtractTerm,
    QuotedField,
    UnquotedField,
)
from backend.services.query_components.filter_builder import FilterBuilder

logger = logging.getLogger(__name__)


# Mapping from our model to Pypika functions
AGGREGATION_MAP = {
    'sum': Sum,
    'avg': Avg,
    'count': Count,
    'count_distinct': lambda field_term: Count(field_term).distinct(),
    'min': Min,
    'max': Max,
}

# Centralized datetime extraction maps per engine
CLICKHOUSE_DATE_PART_MAP = {
    'year': lambda f: Function('toYear', f),
    'month': lambda f: Function('toMonth', f),
    'day': lambda f: Function('toDayOfMonth', f),
    'weekday': lambda f: Function('toDayOfWeek', f),
    'hour': lambda f: Function('toHour', f),
    'minute': lambda f: Function('toMinute', f),
    'second': lambda f: Function('toSecond', f),
    'millisecond': lambda f: Function('toUnixTimestamp64Milli', f) % 1000,
    'microsecond': lambda f: Function('toUnixTimestamp64Micro', f) % 1000000,
    'nanosecond': lambda f: Function('toUnixTimestamp64Nano', f) % 1000000000,
}

SQL_DATE_PART_MAP = {
    'year': 'YEAR',
    'month': 'MONTH',
    'day': 'DAY',
    'weekday': 'DOW',
    'hour': 'HOUR',
    'minute': 'MINUTE',
    'second': 'SECOND',
    'millisecond': 'MILLISECOND',
    'microsecond': 'MICROSECOND',
    'nanosecond': 'NANOSECOND',
}


class QueryService:

    def _get_datetime_part_expression(self, field_term: Any, date_part: str, date_mode: str, db_type: str) -> Any:
        """
        Generate database-specific SQL expression for extracting datetime parts.
        """
        if db_type == 'clickhouse':
            extractor = CLICKHOUSE_DATE_PART_MAP.get(date_part)
            if not extractor:
                raise QueryGenerationError(f"Unsupported datetime part '{date_part}' for ClickHouse")
            return extractor(field_term)

        extract_part = SQL_DATE_PART_MAP.get(date_part, date_part.upper())
        return ExtractTerm(extract_part, field_term)


    def _get_field_with_cast(self, table: Any, field_name: str, column_casts: Optional[Dict[str, Dict[str, str]]] = None) -> Any:
        """
        Get a field reference, applying CAST if configured for this column.
        
        Args:
            table: PyPika Table object
            field_name: Name of the field
            column_casts: Dictionary mapping column names to {cast_type, replacement_pattern}
                         Example: {'Revenue': {'cast_type': 'DOUBLE', 'replacement_pattern': ','}}
        
        Returns:
            PyPika Field object or CastField object
        """
        field = table[field_name]
        return self._apply_cast_if_configured(field_name, field, column_casts)

    def _apply_cast_if_configured(
        self,
        field_identifier: str,
        field_term: Any,
        column_casts: Optional[Dict[str, Dict[str, str]]]
    ) -> Any:
        """Apply CastField wrapper when a cast configuration exists for the field."""
        if not column_casts:
            return field_term

        cast_config = column_casts.get(field_identifier)
        if not cast_config:
            return field_term

        cast_type = cast_config.get('cast_type')
        if not cast_type:
            return field_term

        replacement_pattern = cast_config.get('replacement_pattern')
        return CastField(field_term, cast_type, replacement_pattern)

    def _build_table_context(
        self,
        query_desc: QueryDescription,
        db_type: str,
        fallback_table_name: Optional[str]
    ) -> TableContext:
        """Create initial PyPika query and table context for the provided description."""
        table_map: Dict[str, Any] = {}

        if query_desc.virtual_table:
            primary_table_name = query_desc.virtual_table.primary_table
            if db_type == 'clickhouse' and query_desc.target_database:
                primary_table = Table(primary_table_name, schema=query_desc.target_database)
            else:
                primary_table = Table(primary_table_name)

            table_map[primary_table_name] = primary_table
            query = Query.from_(primary_table)

            for join_def in query_desc.virtual_table.joined_tables:
                if db_type == 'clickhouse' and query_desc.target_database:
                    join_table = Table(join_def.table_name, schema=query_desc.target_database)
                else:
                    join_table = Table(join_def.table_name)

                table_map[join_def.table_name] = join_table

                if join_def.on_conditions:
                    condition = join_def.on_conditions[0]
                    parts = condition.split('=')
                    if len(parts) == 2:
                        left_part = parts[0].strip().split('.')
                        right_part = parts[1].strip().split('.')
                        if len(left_part) == 2 and len(right_part) == 2:
                            left_table_name, left_col = left_part
                            right_table_name, right_col = right_part

                            left_table_obj = table_map.get(left_table_name, primary_table)
                            right_table_obj = table_map.get(right_table_name, join_table)

                            if join_def.join_type == 'LEFT':
                                query = query.left_join(join_table).on(left_table_obj[left_col] == right_table_obj[right_col])
                            elif join_def.join_type == 'RIGHT':
                                query = query.right_join(join_table).on(left_table_obj[left_col] == right_table_obj[right_col])
                            elif join_def.join_type == 'FULL':
                                query = query.full_outer_join(join_table).on(left_table_obj[left_col] == right_table_obj[right_col])
                            else:
                                query = query.inner_join(join_table).on(left_table_obj[left_col] == right_table_obj[right_col])

            default_table = table_map.get(primary_table_name, primary_table)
            return TableContext(query=query, table_map=table_map, default_table=default_table, primary_table=primary_table)

        # Single table query
        target_table_name = query_desc.target_table or fallback_table_name
        if not target_table_name:
            raise QueryGenerationError("Target table must be specified for single table queries.")
        if db_type == 'clickhouse' and query_desc.target_database:
            table = Table(target_table_name, schema=query_desc.target_database)
        else:
            table = Table(target_table_name)

        table_map[target_table_name] = table
        query = Query.from_(table)
        return TableContext(query=query, table_map=table_map, default_table=table, primary_table=table)

    def _build_optimization_context(
        self,
        query_desc: QueryDescription,
        optimizer: Optional[Any],
        with_optimization: bool
    ) -> OptimizationContext:
        """Create optimization plan and derivative configs when available."""
        rounding_config: Dict[str, Any] = {}
        binning_config: Dict[str, Any] = {}
        optimization_plan = None
        use_category_dedup = False

        if with_optimization and optimizer:
            try:
                optimization_plan = optimizer.create_plan(query_desc)
                for strategy in optimization_plan.strategies:
                    if hasattr(strategy, 'prepare_rounding_config'):
                        rounding_config = strategy.prepare_rounding_config(query_desc)
                        logger.info(f"Rounding config prepared: {rounding_config}")
                    if hasattr(strategy, 'prepare_binning_config'):
                        binning_config = strategy.prepare_binning_config(query_desc)
                        logger.info(f"Binning config prepared: {binning_config}")
                    if strategy.__class__.__name__ == 'CategoryDeduplicationStrategy':
                        use_category_dedup = True
                        logger.info("Category deduplication will be applied")
            except Exception as exc:
                logger.warning(f"Failed to create optimization plan early: {exc}")

        return OptimizationContext(
            plan=optimization_plan,
            rounding_config=rounding_config,
            binning_config=binning_config,
            use_category_dedup=use_category_dedup,
        )

    def _build_select_clause(
        self,
        query_desc: QueryDescription,
        table_map: Dict[str, Any],
        default_table: Any,
        db_type: str,
        rounding_config: Dict[str, Any],
        binning_config: Dict[str, Any],
        use_category_dedup: bool,
    ) -> SelectClauseResult:
        """Assemble SELECT fields and related alias/grouping metadata."""
        builder = SelectClauseBuilder(
            parse_field_reference=self._parse_field_reference,
            apply_cast_if_configured=self._apply_cast_if_configured,
            get_datetime_part_expression=self._get_datetime_part_expression,
        )

        return builder.build(
            query_desc=query_desc,
            table_map=table_map,
            default_table=default_table,
            db_type=db_type,
            rounding_config=rounding_config,
            binning_config=binning_config,
            use_category_dedup=use_category_dedup,
            aggregation_map=AGGREGATION_MAP,
        )

    def _build_filter_criteria(
        self,
        query_desc: QueryDescription,
        table_map: Dict[str, Any],
        default_table: Any,
        db_type: str,
        primary_table: Any
    ) -> List[Criterion]:
        """Translate filters, automatic null guards, and regex sampling into Criterion list."""
        builder = FilterBuilder(
            parse_field_reference=self._parse_field_reference,
            apply_cast_if_configured=self._apply_cast_if_configured,
            get_datetime_part_expression=self._get_datetime_part_expression,
            get_field_with_cast=self._get_field_with_cast,
        )

        return builder.build(
            query_desc=query_desc,
            table_map=table_map,
            default_table=default_table,
            db_type=db_type,
            primary_table=primary_table,
        )

    def _apply_optimizations(
        self,
        query: Query,
        optimization_plan: Optional[Any],
        query_desc: QueryDescription,
        primary_table: Any,
        binning_config: Dict[str, Any],
        use_category_dedup: bool,
        with_optimization: bool,
        optimizer: Optional[Any]
    ) -> Tuple[Query, List[Dict[str, Any]]]:
        """Apply optimization plan and return resulting query and metadata."""
        optimization_metadata: List[Dict[str, Any]] = []

        if with_optimization and optimizer and optimization_plan:
            try:
                if 'unix_timestamp' in (binning_config or {}) and not query._distinct:
                    query = query.distinct()

                if use_category_dedup:
                    logger.info("Category deduplication active - skipping DISTINCT, using GROUP BY instead")
                else:
                    query = optimization_plan.apply(query, query_desc, primary_table)

                optimization_metadata = optimization_plan.get_metadata_summary()
                if optimization_metadata:
                    logger.info(f"Applied {len(optimization_metadata)} optimizations")
            except Exception as exc:
                logger.error(f"Optimization failed, falling back to unoptimized: {exc}", exc_info=True)

        return query, optimization_metadata

    def _apply_grouping(
        self,
        query: Query,
        query_desc: QueryDescription,
        db_type: str,
        primary_table: Any,
        use_category_dedup: bool,
        groupby_field_info_for_dedup: List[Tuple[str, Optional[Any]]],
        with_optimization: bool,
        optimizer: Optional[Any]
    ) -> Query:
        """Apply GROUP BY or DISTINCT logic derived from dimensions and strategies."""
        if not query_desc.dimensions:
            return query

        if use_category_dedup and groupby_field_info_for_dedup:
            logger.info(f"Building GROUP BY with {len(groupby_field_info_for_dedup)} fields (using aliases)")
            for field_name, precision in groupby_field_info_for_dedup:
                query = query.groupby(primary_table[field_name])
                if precision is not None:
                    logger.debug(f"  GROUP BY {field_name} (precision={precision})")
                else:
                    logger.debug(f"  GROUP BY {field_name} (no rounding)")
            logger.info(f"Applied GROUP BY on {len(groupby_field_info_for_dedup)} continuous dimensions for category dedup")
            return query

        if query_desc.measures:
            groupby_fields = []
            for dim in query_desc.dimensions:
                field_term = primary_table[dim.field]
                if dim.date_part and dim.date_mode:
                    field_term = self._get_datetime_part_expression(field_term, dim.date_part, dim.date_mode, db_type)
                groupby_fields.append(field_term)
            return query.groupby(*groupby_fields)

        if with_optimization and optimizer:
            return query

        continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']
        discrete_dims = [d for d in query_desc.dimensions if d.flavour == 'discrete']

        has_continuous_on_x = any(d.axis == 'x' for d in continuous_dims)
        has_continuous_on_y = any(d.axis == 'y' for d in continuous_dims)
        is_scatter_plot = has_continuous_on_x and has_continuous_on_y

        if not is_scatter_plot:
            if discrete_dims and continuous_dims:
                groupby_fields = []
                for dim in query_desc.dimensions:
                    field_term = primary_table[dim.field]
                    if dim.date_part and dim.date_mode:
                        field_term = self._get_datetime_part_expression(field_term, dim.date_part, dim.date_mode, db_type)
                    groupby_fields.append(field_term)
                return query.groupby(*groupby_fields)
            return query.distinct()

        return query

    def _apply_ordering(
        self,
        query: Query,
        order_by: List[OrderBy],
        all_aliases: Set[str],
        primary_table: Any
    ) -> Query:
        """Apply ORDER BY clauses using aliases where appropriate."""
        if not order_by:
            return query

        for order in order_by:
            if order.field in all_aliases:
                field_term = QuotedField(order.field)
            else:
                field_term = primary_table[order.field]

            pypika_order = Order.desc if order.direction == 'desc' else Order.asc
            query = query.orderby(field_term, order=pypika_order)

        return query

    def _apply_sampling_and_limits(
        self,
        query: Query,
        query_desc: QueryDescription,
        db_type: str,
        primary_table: Any,
        with_sampling: bool
    ) -> Query:
        """Apply sampling, random order, limits, and offsets based on query metadata."""
        is_raw_query = not query_desc.measures
        is_single_dimension = len(query_desc.dimensions) == 1 if query_desc.dimensions else False

        if (
            with_sampling
            and is_raw_query
            and is_single_dimension
            and query_desc.limit is None
            and not query_desc.orderBy
            and not query_desc.filters
            and not query_desc.use_random_sample
        ):
            dimension = query_desc.dimensions[0]
            if dimension.flavour == 'continuous':
                dimension_field_name = dimension.field
                query = query.where(primary_table[dimension_field_name].notnull())

            if db_type == 'clickhouse':
                query = query.orderby(Function('rand')).limit(5000)

        if query_desc.use_random_sample:
            random_func = 'rand' if db_type == 'clickhouse' else 'random'
            query = query.orderby(Function(random_func))
            logger.info("Applied random sampling for distinct value query")

        if query_desc.limit is not None:
            if query_desc.limit < 0:
                raise QueryGenerationError("Limit cannot be negative.")
            query = query.limit(query_desc.limit)

        if query_desc.offset is not None:
            if query_desc.offset < 0:
                raise QueryGenerationError("Offset cannot be negative.")
            query = query.offset(query_desc.offset)

        return query

    def _parse_field_reference(self, field_name: str, table_map: Dict[str, Any], default_table: Any) -> Any:
        """
        Parse a field reference that may include a table prefix (e.g., 'customers.name').
        
        Special handling for ClickHouse nested columns:
        - Some ClickHouse columns have periods in their names (nested structures)
        - Column names may include the table name as a prefix (e.g., 'tableName.column.subcolumn')
        - We need to distinguish between:
          a) Real table prefix for multi-table queries: 'orders.amount' where 'orders' is a joined table
          b) Column name with periods in a single-table query: 'tableName.measurement.field' is the full column name
        
        Strategy:
        - In multi-table queries (len(table_map) > 1): Parse as table.column if the prefix matches a known table
        - In single-table queries (len(table_map) == 1): Treat the entire field name as a column name (don't split)
          Exception: If the prefix matches a table OTHER than the default table, still split (handles edge cases)
        
        Args:
            field_name: Field name, optionally with table prefix
            table_map: Dictionary mapping table names to PyPika Table objects
            default_table: Default table to use if no prefix specified
            
        Returns:
            PyPika Field object
        """
        if '.' in field_name:
            parts = field_name.split('.', 1)
            if len(parts) == 2:
                potential_table_name, remaining = parts
                
                # Check if this looks like a table prefix
                is_table_prefix = potential_table_name in table_map
                
                if is_table_prefix:
                    # Check if this is a multi-table query
                    is_multi_table = len(table_map) > 1
                    
                    # Get the default table's name for comparison
                    default_table_name = None
                    for tname, tobj in table_map.items():
                        if tobj == default_table:
                            default_table_name = tname
                            break
                    
                    # Only split if:
                    # 1. It's a multi-table query, OR
                    # 2. The potential table name is different from the default table
                    #    (this would be unusual but possible in edge cases)
                    if is_multi_table or potential_table_name != default_table_name:
                        # Treat as table.column reference
                        logger.debug(f"Splitting field '{field_name}' into table '{potential_table_name}' and column '{remaining}'")
                        return table_map[potential_table_name][remaining]
                    else:
                        # Single-table query and the prefix matches our only table
                        # This means the column name itself includes the table prefix
                        # Don't split - use the full name as column
                        logger.debug(f"Single-table query: treating '{field_name}' as full column name (not splitting)")
                        return default_table[field_name]
                else:
                    # Not a known table prefix - use full name as column
                    logger.debug(f"'{potential_table_name}' not in table_map, using full field name '{field_name}' as column")
                    return default_table[field_name]
        
        # No periods - simple column name
        return default_table[field_name]

    def _translate_union_query(
        self,
        query_desc: QueryDescription,
        db_type: str = 'clickhouse',
        quote_char: str = '`',
        with_sampling: bool = False,
        with_optimization: bool = True,
        optimizer: Optional[Any] = None
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Translates a QueryDescription with UNION ALL virtual table into SQL.
        
        Combines multiple tables using UNION ALL. Tables should have similar schemas
        (at least some common columns). Only columns that are referenced in the query
        will be selected, so partial schema matches work fine as long as the queried
        columns exist in all tables.
        
        Args:
            query_desc: Query description with virtual_table in union mode
            db_type: Database type
            quote_char: Quote character for identifiers
            with_sampling: Whether to apply sampling
            with_optimization: Whether to apply optimizations
            optimizer: Query optimizer instance
            
        Returns:
            Tuple of (SQL query string, optimization metadata)
        """
        virtual_table = query_desc.virtual_table
        if not virtual_table or virtual_table.mode != 'union':
            raise ValueError("Query description must have virtual_table in union mode")
        
        # Get all tables to union (primary + union tables)
        all_tables = [virtual_table.primary_table] + [
            ut.table_name for ut in virtual_table.union_tables
        ]
        
        logger.info(f"Building UNION ALL query for tables: {all_tables}")
        
        # Build individual SELECT queries for each table
        union_queries = []
        for table_name in all_tables:
            # Create a modified query_desc for this specific table
            single_table_desc = query_desc.copy(deep=True)
            single_table_desc.target_table = table_name
            single_table_desc.virtual_table = None  # Remove virtual table for single query
            
            # Check if _source_table is the only dimension (special case)
            has_source_table_dim = any(d.field == '_source_table' for d in single_table_desc.dimensions)
            other_dimensions = [d for d in single_table_desc.dimensions if d.field != '_source_table']
            
            # If _source_table is the only thing being selected, we need to select something from the actual table
            # We'll just select the literal, but we need at least one column to make a valid query
            if has_source_table_dim and len(other_dimensions) == 0 and len(single_table_desc.measures) == 0:
                # Create a simple SELECT query that just returns the table name
                # This is a special case where user only wants to see which tables exist
                simple_sql = f"SELECT '{table_name}' AS {quote_char}_source_table{quote_char} FROM {quote_char}{query_desc.target_database}{quote_char}.{quote_char}{table_name}{quote_char} LIMIT 1"
                union_queries.append(f"({simple_sql})")
                continue
            
            # Filter out _source_table from dimensions/filters/orderBy since it doesn't exist in physical tables
            single_table_desc.dimensions = other_dimensions
            single_table_desc.filters = [
                f for f in single_table_desc.filters if f.field != '_source_table'
            ]
            # Remove ORDER BY and LIMIT from individual queries - we'll apply them to the UNION result
            single_table_desc.orderBy = []
            single_table_desc.limit = None
            single_table_desc.offset = None
            
            # Translate single table query
            single_sql, _ = self.translate_to_sql(
                single_table_desc,
                table_name=table_name,
                db_type=db_type,
                with_sampling=False,  # Don't sample individual queries
                with_optimization=False  # Don't optimize individual queries
            )
            
            # Add a virtual column to identify the source table
            # Inject the column after SELECT and before FROM
            # This adds: SELECT ..., 'table_name' AS _source_table FROM ...
            if 'FROM' in single_sql:
                select_part, from_part = single_sql.split('FROM', 1)
                # Add the source table column before FROM
                # Remove trailing whitespace/comma from select_part
                select_part = select_part.rstrip()
                if select_part.endswith(','):
                    select_part = select_part[:-1]
                # Add the virtual column
                modified_sql = f"{select_part}, '{table_name}' AS {quote_char}_source_table{quote_char} FROM{from_part}"
                union_queries.append(f"({modified_sql})")
            else:
                # Fallback if no FROM clause (shouldn't happen)
                union_queries.append(f"({single_sql})")
        
        # Combine with UNION ALL
        union_sql = "\nUNION ALL\n".join(union_queries)
        
        # Check if this is an explicit filter value query (set by frontend)
        # When fetching filter values across UNION tables, we need to deduplicate
        # but ONLY on the data column, not including _source_table
        needs_distinct = query_desc.fetch_filter_values is True
        distinct_columns = []
        
        if needs_distinct:
            # Build list of columns to select (excluding _source_table for DISTINCT)
            for dim in query_desc.dimensions:
                if dim.field != '_source_table':
                    # Handle datetime parts - they get aliased
                    if dim.date_part and dim.date_mode:
                        col_name = f"{dim.field}_{dim.date_part}_{dim.date_mode}"
                    else:
                        col_name = dim.field
                    distinct_columns.append(f"{quote_char}{col_name}{quote_char}")
            logger.info(f"Filter value query (fetch_filter_values=True) - will apply DISTINCT on: {distinct_columns}")
        
        # Check if we need an outer query (for ORDER BY, LIMIT, _source_table filters, or DISTINCT)
        source_table_filters = [f for f in query_desc.filters if f.field == '_source_table']
        needs_outer_query = query_desc.orderBy or query_desc.limit or query_desc.offset or source_table_filters or needs_distinct
        
        if needs_outer_query:
            # Build outer query for ordering/limiting/filtering on _source_table/applying DISTINCT
            if needs_distinct and distinct_columns:
                # Filter value query: Select DISTINCT only on data columns, not _source_table
                # This prevents duplicate values when the same value exists in multiple tables
                columns_list = ', '.join(distinct_columns)
                outer_sql = f"SELECT DISTINCT {columns_list} FROM (\n{union_sql}\n) AS union_result"
                logger.info(f"Applied DISTINCT to filter value query in UNION mode")
            else:
                # Regular query: Select all columns
                outer_sql = f"SELECT * FROM (\n{union_sql}\n) AS union_result"
            
            # Add WHERE clause for _source_table filters
            if source_table_filters:
                where_clauses = []
                for filter_obj in source_table_filters:
                    if filter_obj.operator == '=':
                        where_clauses.append(f"{quote_char}_source_table{quote_char} = '{filter_obj.value}'")
                    elif filter_obj.operator == '!=':
                        where_clauses.append(f"{quote_char}_source_table{quote_char} != '{filter_obj.value}'")
                    elif filter_obj.operator == 'in':
                        values = "', '".join(str(v) for v in filter_obj.value)
                        where_clauses.append(f"{quote_char}_source_table{quote_char} IN ('{values}')")
                    elif filter_obj.operator == 'not in':
                        values = "', '".join(str(v) for v in filter_obj.value)
                        where_clauses.append(f"{quote_char}_source_table{quote_char} NOT IN ('{values}')")
                    elif filter_obj.operator == 'like':
                        where_clauses.append(f"{quote_char}_source_table{quote_char} LIKE '{filter_obj.value}'")
                    # Add more operators as needed
                
                if where_clauses:
                    outer_sql += f"\nWHERE {' AND '.join(where_clauses)}"
            
            # Add ORDER BY
            if query_desc.orderBy:
                order_clauses = []
                for order in query_desc.orderBy:
                    direction = "DESC" if order.direction == 'desc' else "ASC"
                    order_clauses.append(f"{quote_char}{order.field}{quote_char} {direction}")
                outer_sql += f"\nORDER BY {', '.join(order_clauses)}"
            
            # Add LIMIT and OFFSET
            if query_desc.limit:
                outer_sql += f"\nLIMIT {query_desc.limit}"
                if query_desc.offset:
                    outer_sql += f" OFFSET {query_desc.offset}"
            
            final_sql = outer_sql
        else:
            final_sql = union_sql
        
        logger.info(f"Generated UNION ALL query: {final_sql[:200]}...")
        
        # Return with empty optimization metadata
        return (final_sql, [])

    def translate_to_sql(
        self, 
        query_desc: QueryDescription, 
        table_name: str, 
        db_type: str = 'clickhouse', 
        with_sampling: bool = False,
        with_optimization: bool = True,
        optimizer: Optional[Any] = None
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Translates a QueryDescription object into a SQL string.
        Uses Pypika for safe query construction.

        Args:
            query_desc: The validated query description object.
            table_name: The name of the table to query (used as fallback or for non-schema sources).
            db_type: The type of database (e.g., 'clickhouse', 'duckdb') - may affect syntax slightly.
            with_sampling: If true, applies sampling for large raw queries.
            with_optimization: Whether to apply query optimizations.
            optimizer: QueryOptimizer instance (optional).

        Returns:
            Tuple of (SQL query string, optimization metadata list).
        """
        # Choose quote character based on target DB type
        if db_type == 'clickhouse':
            quote_char = '`' # Backticks for ClickHouse
        else: # Default to standard double quotes (e.g., for DuckDB)
            quote_char = '"'

        # Handle UNION ALL mode separately
        if query_desc.virtual_table and query_desc.virtual_table.mode == 'union':
            return self._translate_union_query(
                query_desc, 
                db_type=db_type,
                quote_char=quote_char,
                with_sampling=with_sampling,
                with_optimization=with_optimization,
                optimizer=optimizer
            )

        table_context = self._build_table_context(query_desc, db_type, table_name)
        q = table_context.query
        table_map = table_context.table_map
        default_table = table_context.default_table
        t = table_context.primary_table

        optimization_ctx = self._build_optimization_context(query_desc, optimizer, with_optimization)
        rounding_config = optimization_ctx.rounding_config
        binning_config = optimization_ctx.binning_config
        optimization_plan = optimization_ctx.plan
        use_category_dedup = optimization_ctx.use_category_dedup

        select_result = self._build_select_clause(
            query_desc,
            table_map,
            default_table,
            db_type,
            rounding_config,
            binning_config,
            use_category_dedup,
        )
        select_fields = select_result.fields
        all_aliases = select_result.aliases
        groupby_field_info_for_dedup = select_result.groupby_field_info_for_dedup

        q = q.select(*select_fields)

        criteria = self._build_filter_criteria(
            query_desc,
            table_map,
            default_table,
            db_type,
            t,
        )

        if criteria:
            q = q.where(Criterion.all(criteria))

        q, optimization_metadata = self._apply_optimizations(
            q,
            optimization_plan,
            query_desc,
            t,
            binning_config,
            use_category_dedup,
            with_optimization,
            optimizer,
        )
        
        # CRITICAL: Ensure DISTINCT is applied for discrete-only queries (filter queries)
        # This is essential for filter panels to show unique values only
        if not query_desc.measures and query_desc.dimensions:
            discrete_dims = [d for d in query_desc.dimensions if d.flavour == 'discrete']
            continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']
            
            # For pure discrete queries (no continuous dims), always apply DISTINCT
            # This ensures filter panels show unique values
            if len(discrete_dims) > 0 and len(continuous_dims) == 0:
                if not use_category_dedup and not q._distinct:
                    q = q.distinct()
                    logger.info("Applied DISTINCT to discrete-only query for filter deduplication")
        
        q = self._apply_grouping(
            q,
            query_desc,
            db_type,
            t,
            use_category_dedup,
            groupby_field_info_for_dedup,
            with_optimization,
            optimizer,
        )

        q = self._apply_ordering(q, query_desc.orderBy, all_aliases, t)

        q = self._apply_sampling_and_limits(q, query_desc, db_type, t, with_sampling)

        # Compile the query to string using the chosen quote char
        sql_string = q.get_sql(quote_char=quote_char)
        logger.info(f"Generated SQL ({db_type}): {sql_string}")
        
        # Build extended metadata including hints and override
        extended_metadata = {
            'optimizations': optimization_metadata,
            'hints_used': optimization_plan.hints_used if optimization_plan else None,
            'override': optimization_plan.override if optimization_plan else None
        }
        
        return sql_string, extended_metadata

    # Potential future methods:
    # def translate_to_pandas(self, query_desc: QueryDescription, connector: Any) -> Any:
    #     # Logic to generate Pandas operations
    #     pass 