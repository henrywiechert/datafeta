"""Service responsible for translating query descriptions into executable queries."""

import logging # Import logging
from backend.models.query import QueryDescription, Measure, Filter, OrderBy
from typing import Any, Dict, List, Union, Tuple, Optional
from pypika import Query, Table, Criterion, Order, Field
from pypika.functions import Count, Sum, Avg, Min, Max
from pypika.terms import Function, PseudoColumn, Term
from backend.exceptions import QueryGenerationError

# Get logger for this module
logger = logging.getLogger(__name__)


class ExtractTerm(Term):
    """Custom pypika term for EXTRACT(part FROM field) syntax."""
    def __init__(self, part: str, field: Term):
        super().__init__()
        self.part = part
        self.field = field
    
    def get_sql(self, **kwargs) -> str:
        """Render as EXTRACT(part FROM field) with optional alias."""
        field_sql = self.field.get_sql(**kwargs)
        sql = f"EXTRACT({self.part} FROM {field_sql})"
        
        # Handle alias if present (pypika stores it in self.alias)
        if hasattr(self, 'alias') and self.alias:
            quote_char = kwargs.get('quote_char', '"')
            sql = f"{sql} {quote_char}{self.alias}{quote_char}"
        
        return sql


class UnquotedField(Term):
    """Custom pypika term for referencing aliases without quotes in ORDER BY."""
    def __init__(self, name: str):
        super().__init__()
        self.name = name
    
    def get_sql(self, **kwargs) -> str:
        """Return the field name without quotes."""
        return self.name


class QuotedField(Term):
    """Custom pypika term for referencing aliases WITH quotes in ORDER BY."""
    def __init__(self, name: str):
        super().__init__()
        self.name = name
    
    def get_sql(self, **kwargs) -> str:
        """Return the field name WITH quotes (handles spaces and special characters)."""
        quote_char = kwargs.get('quote_char', '"')
        return f"{quote_char}{self.name}{quote_char}"


class CastField(Term):
    """Custom pypika term for CAST(field AS type) with optional string replacement."""
    def __init__(self, field: Term, cast_type: str, replacement_pattern: Optional[str] = None):
        super().__init__()
        self.field = field
        self.cast_type = cast_type
        self.replacement_pattern = replacement_pattern
    
    def get_sql(self, **kwargs) -> str:
        """Render as CAST(REPLACE(field, pattern, '') AS type) or CAST(field AS type)."""
        field_sql = self.field.get_sql(**kwargs)
        
        if self.replacement_pattern:
            # CAST(REPLACE(field, 'pattern', '') AS type)
            pattern_escaped = self.replacement_pattern.replace("'", "''")
            sql = f"CAST(REPLACE({field_sql}, '{pattern_escaped}', '') AS {self.cast_type})"
        else:
            # Simple CAST(field AS type)
            sql = f"CAST({field_sql} AS {self.cast_type})"
        
        # Handle alias if present
        if hasattr(self, 'alias') and self.alias:
            quote_char = kwargs.get('quote_char', '"')
            sql = f"{sql} {quote_char}{self.alias}{quote_char}"
        
        return sql


# Mapping from our model to Pypika functions
# Using Function for distinct count to generate COUNT(DISTINCT `field_name`)
# Note: get_sql(quote_char) is used to get the properly quoted field name
AGGREGATION_MAP = {
    'sum': Sum,
    'avg': Avg,
    'count': Count,
    'count_distinct': lambda field_term: Count(field_term).distinct(),
    'min': Min,
    'max': Max,
}

# Mapping from our model operators to Pypika criteria methods/standard SQL operators
OPERATOR_MAP = {
    '=': lambda f, v: f == v,
    '!=': lambda f, v: f != v,
    '>': lambda f, v: f > v,
    '<': lambda f, v: f < v,
    '>=': lambda f, v: f >= v,
    '<=': lambda f, v: f <= v,
    'in': lambda f, v: f.isin(v),
    'not in': lambda f, v: ~f.isin(v),
    'like': lambda f, v: f.like(v),
    'ilike': lambda f, v: f.ilike(v), # Pypika's ilike might need DB specific handling (e.g., LOWER())
    'is null': lambda f, v: f.isnull(),
    'is not null': lambda f, v: f.notnull(),
}

class QueryService:

    def _get_datetime_part_expression(self, field_term: Any, date_part: str, date_mode: str, db_type: str) -> Any:
        """
        Generate database-specific SQL expression for extracting datetime parts.
        
        Args:
            field_term: The field to extract from (pypika Field object)
            date_part: The part to extract (year, month, day, etc.)
            date_mode: Either 'distinct' or 'timeline'
            db_type: The database type (clickhouse, duckdb, etc.)
        
        Returns:
            A pypika expression for the datetime part extraction
        """
        if db_type == 'clickhouse':
            # ClickHouse datetime functions
            if date_mode == 'distinct':
                # Extract just the part (returns integer or string)
                part_func_map = {
                    'year': lambda f: Function('toYear', f),
                    'month': lambda f: Function('toMonth', f),
                    'day': lambda f: Function('toDayOfMonth', f),
                    'weekday': lambda f: Function('toDayOfWeek', f),  # Returns 1-7 (Monday=1)
                    'hour': lambda f: Function('toHour', f),
                    'minute': lambda f: Function('toMinute', f),
                    'second': lambda f: Function('toSecond', f),
                    # Subsecond parts: extract using modulo arithmetic
                    # millisecond: 0-999
                    'millisecond': lambda f: Function('toUnixTimestamp64Milli', f) % 1000,
                    # microsecond: 0-999999
                    'microsecond': lambda f: Function('toUnixTimestamp64Micro', f) % 1000000,
                    # nanosecond: 0-999999999
                    'nanosecond': lambda f: Function('toUnixTimestamp64Nano', f) % 1000000000,
                }
                return part_func_map[date_part](field_term)
            else:  # timeline mode
                # Timeline mode uses the SAME extraction as distinct mode
                # The difference is semantic (how the user intends to use it), not in the SQL
                # Timeline: temporal progression with grouping (e.g., hour 0-23 repeating per day)
                # Distinct: aggregate across all time (e.g., which hour has most activity)
                part_func_map = {
                    'year': lambda f: Function('toYear', f),
                    'month': lambda f: Function('toMonth', f),
                    'day': lambda f: Function('toDayOfMonth', f),
                    'weekday': lambda f: Function('toDayOfWeek', f),
                    'hour': lambda f: Function('toHour', f),
                    'minute': lambda f: Function('toMinute', f),
                    'second': lambda f: Function('toSecond', f),
                    # Subsecond parts: extract using modulo arithmetic
                    'millisecond': lambda f: Function('toUnixTimestamp64Milli', f) % 1000,
                    'microsecond': lambda f: Function('toUnixTimestamp64Micro', f) % 1000000,
                    'nanosecond': lambda f: Function('toUnixTimestamp64Nano', f) % 1000000000,
                }
                return part_func_map[date_part](field_term)
        else:
            # DuckDB or other SQL databases using EXTRACT
            if date_mode == 'distinct':
                # EXTRACT returns numeric values
                part_extract_map = {
                    'year': 'YEAR',
                    'month': 'MONTH',
                    'day': 'DAY',
                    'weekday': 'DOW',  # Day of week (0-6, Sunday=0)
                    'hour': 'HOUR',
                    'minute': 'MINUTE',
                    'second': 'SECOND',
                    'millisecond': 'MILLISECOND',
                    'microsecond': 'MICROSECOND',
                    'nanosecond': 'NANOSECOND',
                }
                # Use custom ExtractTerm for proper EXTRACT(part FROM field) syntax
                extract_part = part_extract_map.get(date_part, date_part.upper())
                return ExtractTerm(extract_part, field_term)
            else:  # timeline mode
                # Timeline mode uses the SAME extraction as distinct mode
                # The difference is semantic (how the user intends to use it), not in the SQL
                part_extract_map = {
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
                # Use custom ExtractTerm for proper EXTRACT(part FROM field) syntax
                extract_part = part_extract_map.get(date_part, date_part.upper())
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
        
        if column_casts and field_name in column_casts:
            cast_config = column_casts[field_name]
            cast_type = cast_config.get('cast_type')
            replacement_pattern = cast_config.get('replacement_pattern')
            
            if cast_type:
                return CastField(field, cast_type, replacement_pattern)
        
        return field

    def _parse_field_reference(self, field_name: str, table_map: Dict[str, Any], default_table: Any) -> Any:
        """
        Parse a field reference that may include a table prefix (e.g., 'customers.name').
        
        Args:
            field_name: Field name, optionally with table prefix
            table_map: Dictionary mapping table names to PyPika Table objects
            default_table: Default table to use if no prefix specified
            
        Returns:
            PyPika Field object
        """
        if '.' in field_name:
            # Field has table prefix
            parts = field_name.split('.', 1)
            if len(parts) == 2:
                table_name, col_name = parts
                if table_name in table_map:
                    return table_map[table_name][col_name]
                else:
                    logger.warning(f"Table '{table_name}' not found in table_map, using default table")
                    return default_table[field_name]  # Fall back to full name as single field
        
        # No table prefix - use default table
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
        
        Combines multiple tables with identical schemas using UNION ALL.
        All tables must have the same columns.
        
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
        
        # Wrap in subquery if needed for ORDER BY or LIMIT
        if query_desc.orderBy or query_desc.limit or query_desc.offset:
            # Build outer query for ordering/limiting
            outer_sql = f"SELECT * FROM (\n{union_sql}\n) AS union_result"
            
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

        # Handle virtual table with joins
        table_map = {}  # Maps table names to PyPika Table objects
        
        if query_desc.virtual_table:
            # Multi-table query with joins
            primary_table_name = query_desc.virtual_table.primary_table
            if db_type == 'clickhouse' and query_desc.target_database:
                t = Table(primary_table_name, schema=query_desc.target_database)
            else:
                t = Table(primary_table_name)
            
            table_map[primary_table_name] = t
            q = Query.from_(t)
            
            # Add JOINs
            for join_def in query_desc.virtual_table.joined_tables:
                if db_type == 'clickhouse' and query_desc.target_database:
                    join_table = Table(join_def.table_name, schema=query_desc.target_database)
                else:
                    join_table = Table(join_def.table_name)
                
                table_map[join_def.table_name] = join_table
                
                # Parse join condition (simplified - assumes format "table1.col1 = table2.col2")
                # For now, use raw SQL in join condition
                if join_def.on_conditions:
                    # Build join using first condition (can be extended for multiple conditions)
                    condition = join_def.on_conditions[0]
                    # We'll need to handle this carefully - for now, add join with basic parsing
                    parts = condition.split('=')
                    if len(parts) == 2:
                        left_part = parts[0].strip().split('.')
                        right_part = parts[1].strip().split('.')
                        if len(left_part) == 2 and len(right_part) == 2:
                            left_table_name, left_col = left_part
                            right_table_name, right_col = right_part
                            
                            left_table_obj = table_map.get(left_table_name, t)
                            right_table_obj = table_map.get(right_table_name, join_table)
                            
                            # Add the join
                            if join_def.join_type == 'LEFT':
                                q = q.left_join(join_table).on(left_table_obj[left_col] == right_table_obj[right_col])
                            elif join_def.join_type == 'RIGHT':
                                q = q.right_join(join_table).on(left_table_obj[left_col] == right_table_obj[right_col])
                            elif join_def.join_type == 'FULL':
                                q = q.full_outer_join(join_table).on(left_table_obj[left_col] == right_table_obj[right_col])
                            else:  # INNER
                                q = q.inner_join(join_table).on(left_table_obj[left_col] == right_table_obj[right_col])
        else:
            # Single table query (existing logic)
            if db_type == 'clickhouse' and query_desc.target_database:
                actual_table_name = query_desc.target_table
                t = Table(actual_table_name, schema=query_desc.target_database)
            else:
                actual_table_name = query_desc.target_table
                t = Table(actual_table_name)
            
            table_map[query_desc.target_table] = t
            q = Query.from_(t)

        # Create optimization plan EARLY before SELECT clause construction
        # This allows us to extract rounding/binning config for use during field selection
        rounding_config = {}
        binning_config = {}
        optimization_plan = None
        use_category_dedup = False  # Flag for category deduplication
        if with_optimization and optimizer:
            try:
                from backend.services.optimization.optimizer import OptimizationPlan
                optimization_plan = optimizer.create_plan(query_desc)
                # Extract rounding/binning config from strategies if present
                for strategy in optimization_plan.strategies:
                    if hasattr(strategy, 'prepare_rounding_config'):
                        rounding_config = strategy.prepare_rounding_config(query_desc)
                        logger.info(f"Rounding config prepared: {rounding_config}")
                    # Extract binning config from datetime binning strategy
                    if hasattr(strategy, 'prepare_binning_config'):
                        binning_config = strategy.prepare_binning_config(query_desc)
                        logger.info(f"Binning config prepared: {binning_config}")
                    # Check for category deduplication strategy
                    if strategy.__class__.__name__ == 'CategoryDeduplicationStrategy':
                        use_category_dedup = True
                        logger.info("Category deduplication will be applied")
            except Exception as e:
                logger.warning(f"Failed to create optimization plan early: {e}")

        # SELECT Clause (Dimensions + Measures)
        select_fields: List[Any] = []
        all_aliases = set()
        # Track which dimensions have datetime parts (these will be aliased)
        datetime_part_fields = set()
        # Track fields for GROUP BY when using category deduplication
        # Store tuples of (field_name, precision) instead of RoundFunction objects
        groupby_field_info_for_dedup = []
        
        # Determine default table for field references
        if query_desc.virtual_table:
            default_table = table_map.get(query_desc.virtual_table.primary_table, t)
        else:
            default_table = t

        if query_desc.dimensions:
            for dim in query_desc.dimensions:
                # Special handling for _source_table virtual column
                if dim.field == '_source_table':
                    # Inject the table name as a literal
                    actual_table = query_desc.target_table
                    field_term = Criterion.wrap_constant(actual_table).as_('_source_table')
                    select_fields.append(field_term)
                    all_aliases.add('_source_table')
                    continue
                
                # Parse field reference (may include table prefix like 'customers.name')
                field_term = self._parse_field_reference(dim.field, table_map, default_table)
                
                # Apply cast if configured (note: column_casts keys may also have table prefixes)
                if query_desc.column_casts and dim.field in query_desc.column_casts:
                    cast_config = query_desc.column_casts[dim.field]
                    cast_type = cast_config.get('cast_type')
                    replacement_pattern = cast_config.get('replacement_pattern')
                    if cast_type:
                        field_term = CastField(field_term, cast_type, replacement_pattern)
                
                # Apply binning if configured for this timeline dimension
                if binning_config and dim.field in binning_config and getattr(dim, 'date_mode', None) == 'timeline':
                    from pypika.functions import Function as PypikaFunction
                    unit = binning_config[dim.field]
                    # ClickHouse uses date_trunc(unit, field), DuckDB uses date_trunc(unit, field)
                    binned_expr = PypikaFunction('date_trunc', unit, field_term)
                    
                    # Store field info for GROUP BY if category dedup is enabled
                    if use_category_dedup:
                        groupby_field_info_for_dedup.append((dim.field, f"binned_{unit}"))
                    
                    # Preserve original field name as alias for SELECT
                    field_term = binned_expr.as_(dim.field)
                    all_aliases.add(dim.field)
                    logger.debug(f"Applied datetime binning to {dim.field} with unit {unit}")
                
                # Apply rounding if configured for this dimension (non-datetime)
                elif rounding_config and dim.field in rounding_config and dim.flavour == 'continuous':
                    from backend.services.optimization.strategies.adaptive_rounding import RoundingHelper
                    precision = rounding_config[dim.field]
                    rounded_expr = RoundingHelper.create_round_expression(field_term, precision, db_type)
                    
                    # Store field info for GROUP BY (just the field name and precision)
                    if use_category_dedup:
                        groupby_field_info_for_dedup.append((dim.field, precision))
                    
                    # Preserve original field name as alias for SELECT
                    field_term = rounded_expr.as_(dim.field)
                    all_aliases.add(dim.field)
                    logger.debug(f"Applied rounding to {dim.field} with precision {precision}")
                
                # For category deduplication: handle continuous and discrete dimensions
                elif use_category_dedup:
                    if dim.flavour == 'continuous':
                        # Continuous dimension without rounding - still needs GROUP BY
                        groupby_field_info_for_dedup.append((dim.field, None))  # None means no rounding
                        logger.debug(f"Added continuous dimension {dim.field} to GROUP BY for category dedup")
                    elif dim.flavour == 'discrete':
                        # Check if this discrete dimension has a filter applied
                        has_filter = any(f.field == dim.field for f in query_desc.filters)
                        
                        if has_filter:
                            # If filtered, add to GROUP BY instead of wrapping in any()
                            # This avoids ClickHouse's "aggregate function in WHERE" error
                            groupby_field_info_for_dedup.append((dim.field, None))
                            logger.debug(f"Added filtered discrete dimension {dim.field} to GROUP BY (not using any())")
                        else:
                            # No filter - wrap in aggregate (engine-specific)
                            # ClickHouse uses any(), DuckDB/others use first()
                            agg_func_name = 'any' if db_type == 'clickhouse' else 'first'
                            field_term = Function(agg_func_name, field_term).as_(dim.field)
                            all_aliases.add(dim.field)
                            logger.debug(f"Wrapped discrete dimension {dim.field} in {agg_func_name}() for category dedup")
                
                # Apply datetime part extraction if specified
                if dim.date_part and dim.date_mode:
                    field_term = self._get_datetime_part_expression(
                        field_term, dim.date_part, dim.date_mode, db_type
                    )
                    # Create a unique alias that includes the datetime part
                    # Format: fieldname_part_mode (e.g., unix_timestamp_day_timeline)
                    alias = f"{dim.field}_{dim.date_part}_{dim.date_mode}"
                    field_term = field_term.as_(alias)
                    all_aliases.add(alias)
                    datetime_part_fields.add(alias)
                else:
                    # If this dimension is a CAST expression, alias it back to the original field name
                    # so the result column label remains clean and ORDER BY can reference the alias.
                    if isinstance(field_term, CastField):
                        field_term = field_term.as_(dim.field)
                        all_aliases.add(dim.field)
                        logger.debug(f"Aliased casted dimension {dim.field} back to its original name")
                
                select_fields.append(field_term)

        for measure in query_desc.measures:
            agg_func_builder = AGGREGATION_MAP.get(measure.aggregation)
            if not agg_func_builder:
                raise QueryGenerationError(f"Unsupported aggregation function: {measure.aggregation}")

            # Parse field reference (may include table prefix)
            field_term = self._parse_field_reference(measure.field, table_map, default_table)
            
            # Apply cast if configured
            if query_desc.column_casts and measure.field in query_desc.column_casts:
                cast_config = query_desc.column_casts[measure.field]
                cast_type = cast_config.get('cast_type')
                replacement_pattern = cast_config.get('replacement_pattern')
                if cast_type:
                    field_term = CastField(field_term, cast_type, replacement_pattern)
            
            agg_term = agg_func_builder(field_term)
            
            # For DuckDB, wrap AVG and SUM with COALESCE to handle NULL results
            if db_type != 'clickhouse' and measure.aggregation in ['avg', 'sum']:
                from pypika.functions import Coalesce
                agg_term = Coalesce(agg_term, 0)
            
            # Pass alias as a simple string to .as_()
            select_fields.append(agg_term.as_(measure.alias))
            all_aliases.add(measure.alias)

        # --- NEW: Include label_fields as raw columns if provided and not already selected ---
        if getattr(query_desc, 'label_fields', None):
            existing_dimension_fields = {d.field for d in query_desc.dimensions} if query_desc.dimensions else set()
            existing_measure_fields = {m.field for m in query_desc.measures} if query_desc.measures else set()
            for lbl in query_desc.label_fields:
                # Skip if already present as dimension or measure source
                if lbl in existing_dimension_fields or lbl in existing_measure_fields:
                    continue
                # Add raw field; alias kept as original name for frontend lookup
                try:
                    # Parse field reference (may include table prefix)
                    raw_term = self._parse_field_reference(lbl, table_map, default_table)
                    
                    # Apply cast if configured
                    if query_desc.column_casts and lbl in query_desc.column_casts:
                        cast_config = query_desc.column_casts[lbl]
                        cast_type = cast_config.get('cast_type')
                        replacement_pattern = cast_config.get('replacement_pattern')
                        if cast_type:
                            raw_term = CastField(raw_term, cast_type, replacement_pattern)
                    
                    select_fields.append(raw_term.as_(lbl))
                    all_aliases.add(lbl)
                except Exception as e:
                    logger.warning(f"Failed to include label field '{lbl}' in SELECT: {e}")

        if not select_fields:
             raise QueryGenerationError("Query must have at least one dimension or measure.")

        q = q.select(*select_fields)

        # WHERE Clause (Filters)
        criteria: List[Criterion] = []
        
        # Add user-specified filters
        for f in query_desc.filters:
            operator_func = OPERATOR_MAP.get(f.operator)
            if not operator_func:
                 raise QueryGenerationError(f"Unsupported filter operator: {f.operator}")

            # Check if this filter needs datetime part extraction
            if f.date_part and f.date_mode:
                # Parse field reference (may include table prefix)
                field_term = self._parse_field_reference(f.field, table_map, default_table)
                
                # Apply cast if configured
                if query_desc.column_casts and f.field in query_desc.column_casts:
                    cast_config = query_desc.column_casts[f.field]
                    cast_type = cast_config.get('cast_type')
                    replacement_pattern = cast_config.get('replacement_pattern')
                    if cast_type:
                        field_term = CastField(field_term, cast_type, replacement_pattern)
                
                field = self._get_datetime_part_expression(
                    field_term, 
                    f.date_part, 
                    f.date_mode, 
                    db_type
                )
            else:
                # Parse field reference (may include table prefix)
                field = self._parse_field_reference(f.field, table_map, default_table)
                
                # Apply cast if configured
                if query_desc.column_casts and f.field in query_desc.column_casts:
                    cast_config = query_desc.column_casts[f.field]
                    cast_type = cast_config.get('cast_type')
                    replacement_pattern = cast_config.get('replacement_pattern')
                    if cast_type:
                        field = CastField(field, cast_type, replacement_pattern)
            
            value = f.value

            if f.operator in ['is null', 'is not null']:
                criteria.append(operator_func(field, None))
            elif f.operator in ['in', 'not in']:
                 if not isinstance(value, list):
                     raise QueryGenerationError(f"Value for '{f.operator}' operator must be a list.")
                 
                 # Handle NULL values specially - SQL IN doesn't match NULL
                 # Split into non-null values and null check
                 non_null_values = [v for v in value if v is not None]
                 has_null = any(v is None for v in value)
                 
                 if f.operator == 'in':
                     # Build: (field IN (non_nulls) OR field IS NULL)
                     if non_null_values and has_null:
                         # Both non-null and null: use OR
                         in_criterion = field.isin(tuple(non_null_values))
                         null_criterion = field.isnull()
                         criteria.append(in_criterion | null_criterion)
                     elif non_null_values:
                         # Only non-null values
                         criteria.append(field.isin(tuple(non_null_values)))
                     elif has_null:
                         # Only null
                         criteria.append(field.isnull())
                 else:  # 'not in'
                     # Build: (field NOT IN (non_nulls) AND field IS NOT NULL)
                     if non_null_values and has_null:
                         # Both: field not in non-nulls and not null
                         not_in_criterion = ~field.isin(tuple(non_null_values))
                         not_null_criterion = field.notnull()
                         criteria.append(not_in_criterion & not_null_criterion)
                     elif non_null_values:
                         # Only non-null values: just NOT IN
                         criteria.append(~field.isin(tuple(non_null_values)))
                     elif has_null:
                         # Only null: everything except null
                         criteria.append(field.notnull())
            else:
                criteria.append(operator_func(field, value))
        
        # Automatically filter out NULLs from continuous dimensions
        # NULL values in continuous dimensions (timestamps, prices, etc.) cannot be 
        # visualized in tick-strips or scatter plots, and filtering them at query time
        # can dramatically reduce dataset size (especially when most rows have NULLs)
        if query_desc.dimensions:
            for dim in query_desc.dimensions:
                if dim.flavour == 'continuous':
                    dim_field = self._get_field_with_cast(t, dim.field, query_desc.column_casts)
                    criteria.append(dim_field.notnull())
        
        # For distinct value queries: apply LIKE filter if regex pattern is provided
        # This is used when fetching filter metadata for fields with >5000 unique values
        if query_desc.distinct_value_regex and query_desc.dimensions:
            # Apply to the first dimension (distinct value queries only have one dimension)
            dim = query_desc.dimensions[0]
            
            # Get field reference with potential datetime part extraction
            if dim.date_part and dim.date_mode:
                field_term = self._get_field_with_cast(t, dim.field, query_desc.column_casts)
                field_expr = self._get_datetime_part_expression(
                    field_term, dim.date_part, dim.date_mode, db_type
                )
                # Cast to string for LIKE comparison
                if db_type == 'clickhouse':
                    from pypika.functions import Cast
                    field_expr = Cast(field_expr, 'String')
                else:
                    from pypika.functions import Cast
                    field_expr = Cast(field_expr, 'VARCHAR')
            else:
                field_expr = self._get_field_with_cast(t, dim.field, query_desc.column_casts)
            
            # Apply LIKE filter with %pattern% format
            like_pattern = f"%{query_desc.distinct_value_regex}%"
            criteria.append(field_expr.like(like_pattern))
            logger.info(f"Applied LIKE filter for distinct values: {like_pattern}")

        if criteria:
            # Combine all criteria with AND
            q = q.where(Criterion.all(criteria))

        # Apply query optimizations (e.g., DISTINCT for scatter plots)
        optimization_metadata = []
        if with_optimization and optimizer and optimization_plan:
            try:
                # Ensure DISTINCT when binning is active (belt-and-suspenders)
                # This guards against future strategy failures before apply()
                if 'unix_timestamp' in (binning_config or {}) and not q._distinct:
                    q = q.distinct()

                # If using category dedup with GROUP BY, we need special handling
                if use_category_dedup:
                    # Don't call .distinct() - GROUP BY handles deduplication
                    # Just prepare rounding config (already done above)
                    logger.info("Category deduplication active - skipping DISTINCT, using GROUP BY instead")
                else:
                    # Use the plan we created earlier
                    q = optimization_plan.apply(q, query_desc, t)
                
                optimization_metadata = optimization_plan.get_metadata_summary()
                
                if optimization_metadata:
                    logger.info(f"Applied {len(optimization_metadata)} optimizations")
            except Exception as e:
                logger.error(f"Optimization failed, falling back to unoptimized: {e}", exc_info=True)
        
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
        
        # GROUP BY Clause
        if query_desc.dimensions:
            # Special handling for category deduplication
            if use_category_dedup and groupby_field_info_for_dedup:
                # Build GROUP BY using field aliases (not the full ROUND expressions)
                # ClickHouse allows referencing SELECT aliases in GROUP BY
                logger.info(f"Building GROUP BY with {len(groupby_field_info_for_dedup)} fields (using aliases)")
                
                for field_name, precision in groupby_field_info_for_dedup:
                    # Use t[field_name] to reference the field with proper table context
                    # This ensures field names with spaces are properly quoted
                    q = q.groupby(t[field_name])
                    if precision is not None:
                        logger.debug(f"  GROUP BY {field_name} (aliased ROUND with precision={precision})")
                    else:
                        logger.debug(f"  GROUP BY {field_name} (no rounding)")
                
                logger.info(f"Applied GROUP BY on {len(groupby_field_info_for_dedup)} continuous dimensions for category dedup")
            # Only group if there are measures, otherwise it's just selecting distinct dimension combinations
            elif query_desc.measures:
                # Build GROUP BY expressions (apply datetime parts if needed)
                groupby_fields = []
                for dim in query_desc.dimensions:
                    field_term = t[dim.field]
                    if dim.date_part and dim.date_mode:
                        field_term = self._get_datetime_part_expression(
                            field_term, dim.date_part, dim.date_mode, db_type
                        )
                    groupby_fields.append(field_term)
                q = q.groupby(*groupby_fields)
            else:
                # If only dimensions (no measures), decide whether to deduplicate:
                # NOTE: This logic is now handled by the QueryOptimizer for scatter plots
                # But we keep it for backward compatibility when optimizer is disabled
                if not with_optimization or not optimizer:
                    continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']
                    discrete_dims = [d for d in query_desc.dimensions if d.flavour == 'discrete']
                    
                    # Check if continuous dimensions span both axes (scatter plot scenario)
                    has_continuous_on_x = any(d.axis == 'x' for d in continuous_dims)
                    has_continuous_on_y = any(d.axis == 'y' for d in continuous_dims)
                    is_scatter_plot = has_continuous_on_x and has_continuous_on_y
                    
                    if not is_scatter_plot:
                        # Deduplicate for tick-strips and discrete-only queries
                        if discrete_dims and continuous_dims:
                            groupby_fields = []
                            for dim in query_desc.dimensions:
                                field_term = t[dim.field]
                                if dim.date_part and dim.date_mode:
                                    field_term = self._get_datetime_part_expression(
                                        field_term, dim.date_part, dim.date_mode, db_type
                                    )
                                groupby_fields.append(field_term)
                            q = q.groupby(*groupby_fields)
                        else:
                            q = q.distinct()

        # ORDER BY Clause
        if query_desc.orderBy:
            for order in query_desc.orderBy:
                # Check if this field was aliased in SELECT (either a measure or datetime part)
                if order.field in all_aliases:
                    # Field has an alias (from temporal binning, rounding, or aggregation)
                    # Always use quoted aliases to ensure proper handling of spaces and special characters
                    # in alias names (which inherit from original field names)
                    field_term = QuotedField(order.field)
                else:
                    # Regular field, just reference it (uses table context for proper quoting)
                    field_term = t[order.field]

                pypika_order = Order.desc if order.direction == 'desc' else Order.asc
                q = q.orderby(field_term, order=pypika_order)

        # --- NEW: Add sampling for large raw queries on supported databases ---
        is_raw_query = not query_desc.measures
        is_single_dimension = len(query_desc.dimensions) == 1

        # Apply sampling only if enabled, it's a raw query for a single dimension,
        # and no user-defined limit, order, or filters exist.
        # This targets the simple "drag a field to see its distribution" use case.
        # IMPORTANT: Skip this if use_random_sample is set (our new distinct value query logic)
        if (with_sampling and is_raw_query and is_single_dimension and 
            query_desc.limit is None and not query_desc.orderBy and not query_desc.filters and
            not query_desc.use_random_sample):
            # Only add a WHERE ... IS NOT NULL clause for continuous dimensions
            # For discrete dimensions (e.g., filter metadata), we want to include NULLs
            dimension = query_desc.dimensions[0]
            if dimension.flavour == 'continuous':
                dimension_field_name = dimension.field
                q = q.where(t[dimension_field_name].notnull())

            if db_type == 'clickhouse':
                # Using ORDER BY rand() is a compatible way to sample on any table engine.
                q = q.orderby(Function('rand')).limit(5000)
            # In the future, other DB-specific sampling can be added here
            # elif db_type == 'postgresql':
            #     q = q.orderby(Function('random')).limit(5000)
        
        # For distinct value queries with >5000 items: use random sampling
        if query_desc.use_random_sample:
            if db_type == 'clickhouse':
                q = q.orderby(Function('rand'))
            elif db_type == 'duckdb':
                q = q.orderby(Function('random'))
            else:
                # Fallback for other databases
                q = q.orderby(Function('random'))
            logger.info("Applied random sampling for distinct value query")

        # LIMIT and OFFSET Clause
        if query_desc.limit is not None:
            if query_desc.limit < 0:
                 raise QueryGenerationError("Limit cannot be negative.")
            q = q.limit(query_desc.limit)
        if query_desc.offset is not None:
            if query_desc.offset < 0:
                raise QueryGenerationError("Offset cannot be negative.")
            q = q.offset(query_desc.offset)

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