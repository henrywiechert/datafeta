"""Service responsible for translating query descriptions into executable queries."""

import logging # Import logging
from backend.models.query import QueryDescription, Measure, Filter, OrderBy
from typing import Any, Dict, List, Union
from pypika import Query, Table, Criterion, Order, Field
from pypika.functions import Count, Sum, Avg, Min, Max
from pypika.terms import Function, PseudoColumn
from backend.exceptions import QueryGenerationError

# Get logger for this module
logger = logging.getLogger(__name__)

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
                # Using custom SQL since pypika doesn't have built-in EXTRACT syntax
                from pypika.terms import ValueWrapper
                extract_part = part_extract_map.get(date_part, date_part.upper())
                # Return a custom function that will be rendered as EXTRACT(part FROM field)
                return Function('EXTRACT', ValueWrapper(extract_part), field_term)
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
                from pypika.terms import ValueWrapper
                extract_part = part_extract_map.get(date_part, date_part.upper())
                return Function('EXTRACT', ValueWrapper(extract_part), field_term)

    def translate_to_sql(self, query_desc: QueryDescription, table_name: str, db_type: str = 'clickhouse', with_sampling: bool = False) -> str:
        """
        Translates a QueryDescription object into a SQL string.
        Uses Pypika for safe query construction.

        Args:
            query_desc: The validated query description object.
            table_name: The name of the table to query (used as fallback or for non-schema sources).
            db_type: The type of database (e.g., 'clickhouse', 'duckdb') - may affect syntax slightly.
            with_sampling: If true, applies sampling for large raw queries.

        Returns:
            A SQL query string.
        """
        # Choose quote character based on target DB type
        if db_type == 'clickhouse':
            quote_char = '`' # Backticks for ClickHouse
        else: # Default to standard double quotes (e.g., for DuckDB)
            quote_char = '"'

        # Create table reference, including schema (database) if provided
        if db_type == 'clickhouse' and query_desc.target_database:
            actual_table_name = query_desc.target_table
            t = Table(actual_table_name, schema=query_desc.target_database)
        else:
            actual_table_name = query_desc.target_table
            t = Table(actual_table_name)

        q = Query.from_(t)

        # SELECT Clause (Dimensions + Measures)
        select_fields: List[Any] = []
        all_aliases = set()
        # Track which dimensions have datetime parts (these will be aliased)
        datetime_part_fields = set()

        if query_desc.dimensions:
            for dim in query_desc.dimensions:
                field_term = t[dim.field]
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
                select_fields.append(field_term)

        for measure in query_desc.measures:
            agg_func_builder = AGGREGATION_MAP.get(measure.aggregation)
            if not agg_func_builder:
                raise QueryGenerationError(f"Unsupported aggregation function: {measure.aggregation}")

            field_term = t[measure.field]
            agg_term = agg_func_builder(field_term)
            
            # For DuckDB, wrap AVG and SUM with COALESCE to handle NULL results
            if db_type != 'clickhouse' and measure.aggregation in ['avg', 'sum']:
                from pypika.functions import Coalesce
                agg_term = Coalesce(agg_term, 0)
            
            # Pass alias as a simple string to .as_()
            select_fields.append(agg_term.as_(measure.alias))
            all_aliases.add(measure.alias)

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

            # Ensure field name is quoted (done by t[...])
            field = t[f.field]
            value = f.value

            if f.operator in ['is null', 'is not null']:
                criteria.append(operator_func(field, None))
            elif f.operator in ['in', 'not in']:
                 if not isinstance(value, list):
                     raise QueryGenerationError(f"Value for '{f.operator}' operator must be a list.")
                 # Pypika expects a tuple for isin
                 criteria.append(operator_func(field, tuple(value)))
            else:
                criteria.append(operator_func(field, value))
        
        # Automatically filter out NULLs from continuous dimensions
        # NULL values in continuous dimensions (timestamps, prices, etc.) cannot be 
        # visualized in tick-strips or scatter plots, and filtering them at query time
        # can dramatically reduce dataset size (especially when most rows have NULLs)
        if query_desc.dimensions:
            for dim in query_desc.dimensions:
                if dim.flavour == 'continuous':
                    criteria.append(t[dim.field].notnull())

        if criteria:
            # Combine all criteria with AND
            q = q.where(Criterion.all(criteria))

        # GROUP BY Clause
        if query_desc.dimensions:
            # Only group if there are measures, otherwise it's just selecting distinct dimension combinations
            if query_desc.measures:
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
                # Use axis information (if provided) to distinguish tick-strips from scatter plots
                continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']
                discrete_dims = [d for d in query_desc.dimensions if d.flavour == 'discrete']
                
                # Check if continuous dimensions span both axes (scatter plot scenario)
                has_continuous_on_x = any(d.axis == 'x' for d in continuous_dims)
                has_continuous_on_y = any(d.axis == 'y' for d in continuous_dims)
                is_scatter_plot = has_continuous_on_x and has_continuous_on_y
                
                if not is_scatter_plot:
                    # Deduplicate for:
                    # - Tick-strip (continuous dims on same axis or single continuous dim)
                    # - Discrete-only queries
                    # Use GROUP BY when mixing discrete + continuous for proper SQL semantics
                    if discrete_dims and continuous_dims:
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
                        q = q.distinct()
                # else: scatter plot case (continuous dims on both X and Y) - keep all points, no deduplication

        # ORDER BY Clause
        if query_desc.orderBy:
            for order in query_desc.orderBy:
                # Check if this field was aliased in SELECT (either a measure or datetime part)
                if order.field in all_aliases:
                    # Use the alias name directly - it refers to the already-computed expression
                    field_term = order.field
                else:
                    # Regular field, just reference it
                    field_term = t[order.field]

                pypika_order = Order.desc if order.direction == 'desc' else Order.asc
                # Pypika needs the field term (string or Field object) for order by
                # If it's an alias string, Pypika should handle it correctly.
                # If it's a table field, t[order.field] provides the Field object.
                q = q.orderby(field_term, order=pypika_order)

        # --- NEW: Add sampling for large raw queries on supported databases ---
        is_raw_query = not query_desc.measures
        is_single_dimension = len(query_desc.dimensions) == 1

        # Apply sampling only if enabled, it's a raw query for a single dimension,
        # and no user-defined limit, order, or filters exist.
        # This targets the simple "drag a field to see its distribution" use case.
        if with_sampling and is_raw_query and is_single_dimension and query_desc.limit is None and not query_desc.orderBy and not query_desc.filters:
            # First, add a WHERE ... IS NOT NULL clause to sample from non-null values.
            dimension_field_name = query_desc.dimensions[0].field
            q = q.where(t[dimension_field_name].notnull())

            if db_type == 'clickhouse':
                # Using ORDER BY rand() is a compatible way to sample on any table engine.
                q = q.orderby(Function('rand')).limit(5000)
            # In the future, other DB-specific sampling can be added here
            # elif db_type == 'postgresql':
            #     q = q.orderby(Function('random')).limit(5000)

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
        return sql_string

    # Potential future methods:
    # def translate_to_pandas(self, query_desc: QueryDescription, connector: Any) -> Any:
    #     # Logic to generate Pandas operations
    #     pass 