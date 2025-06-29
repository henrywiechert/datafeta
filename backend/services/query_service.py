"""Service responsible for translating query descriptions into executable queries."""

import logging # Import logging
from backend.models.query import QueryDescription, Measure, Filter, OrderBy
from typing import Any, Dict, List
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
    'count_distinct': lambda field_term: Count(field_term, distinct=True),
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

    def translate_to_sql(self, query_desc: QueryDescription, table_name: str, db_type: str = 'clickhouse') -> str:
        """
        Translates a QueryDescription object into a SQL string.
        Uses Pypika for safe query construction.

        Args:
            query_desc: The validated query description object.
            table_name: The name of the table to query (used as fallback or for non-schema sources).
            db_type: The type of database (e.g., 'clickhouse', 'duckdb') - may affect syntax slightly.

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

        if query_desc.dimensions:
            select_fields.extend([t[dim.field] for dim in query_desc.dimensions])

        for measure in query_desc.measures:
            agg_func_builder = AGGREGATION_MAP.get(measure.aggregation)
            if not agg_func_builder:
                raise QueryGenerationError(f"Unsupported aggregation function: {measure.aggregation}")

            field_term = t[measure.field]
            agg_term = agg_func_builder(field_term)
            # Pass alias as a simple string to .as_()
            select_fields.append(agg_term.as_(measure.alias))
            all_aliases.add(measure.alias)

        if not select_fields:
             raise QueryGenerationError("Query must have at least one dimension or measure.")

        q = q.select(*select_fields)

        # WHERE Clause (Filters)
        criteria: List[Criterion] = []
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

        if criteria:
            # Combine all criteria with AND
            q = q.where(Criterion.all(criteria))

        # GROUP BY Clause
        if query_desc.dimensions:
            # Only group if there are measures, otherwise it's just selecting distinct dimension combinations
            if query_desc.measures:
                q = q.groupby(*[t[dim.field] for dim in query_desc.dimensions])
            else:
                # If only dimensions are selected, use DISTINCT only if all dimensions are discrete
                is_any_continuous = any(d.flavour == 'continuous' for d in query_desc.dimensions)
                if not is_any_continuous:
                    q = q.distinct()

        # ORDER BY Clause
        for order in query_desc.orderBy:
             if order.field in all_aliases:
                 # Use the alias string directly
                 field_term = order.field
             else:
                 field_term = t[order.field]

             pypika_order = Order.desc if order.direction == 'desc' else Order.asc
             # Pypika needs the field term (string or Field object) for order by
             # If it's an alias string, Pypika should handle it correctly.
             # If it's a table field, t[order.field] provides the Field object.
             q = q.orderby(field_term, order=pypika_order)

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