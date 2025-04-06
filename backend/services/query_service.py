"""Service responsible for translating query descriptions into executable queries."""

from backend.models.query import QueryDescription, Measure, Filter, OrderBy
from typing import Any, Dict, List
from pypika import Query, Table, Criterion, Order, Field
from pypika.functions import Count, Sum, Avg, Min, Max
from pypika.terms import Function, PseudoColumn

# Mapping from our model to Pypika functions
# Using Function for distinct count to generate COUNT(DISTINCT `field_name`)
# Note: get_sql(quote_char) is used to get the properly quoted field name
AGGREGATION_MAP = {
    'sum': Sum,
    'avg': Avg,
    'count': Count,
    'count_distinct': lambda field_term: Function('COUNT', PseudoColumn(f'DISTINCT {field_term.get_sql(quote_char="`")}')),
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
            table_name: The name of the table to query.
            db_type: The type of database (e.g., 'clickhouse', 'duckdb') - may affect syntax slightly.

        Returns:
            A SQL query string.
        """
        # Ensure table name is quoted to handle potential special characters/keywords
        # Use backticks as default, suitable for ClickHouse and DuckDB
        t = Table(table_name)
        q = Query.from_(t)

        # SELECT Clause (Dimensions + Measures)
        select_fields: List[Any] = []
        all_aliases = set()

        if query_desc.dimensions:
            select_fields.extend([t[dim] for dim in query_desc.dimensions])

        for measure in query_desc.measures:
            agg_func_builder = AGGREGATION_MAP.get(measure.aggregation)
            if not agg_func_builder:
                raise ValueError(f"Unsupported aggregation function: {measure.aggregation}")

            # Ensure field names used in aggregations are quoted (done by t[...])
            field_term = t[measure.field]
            agg_term = agg_func_builder(field_term)
            # Use Field() for alias to ensure it's treated correctly, don't quote alias
            select_fields.append(agg_term.as_(Field(measure.alias)))
            all_aliases.add(measure.alias)

        if not select_fields:
             raise ValueError("Query must have at least one dimension or measure.")

        q = q.select(*select_fields)

        # WHERE Clause (Filters)
        criteria: List[Criterion] = []
        for f in query_desc.filters:
            operator_func = OPERATOR_MAP.get(f.operator)
            if not operator_func:
                 raise ValueError(f"Unsupported filter operator: {f.operator}")

            # Ensure field name is quoted (done by t[...])
            field = t[f.field]
            value = f.value

            if f.operator in ['is null', 'is not null']:
                criteria.append(operator_func(field, None))
            elif f.operator in ['in', 'not in']:
                 if not isinstance(value, list):
                     raise ValueError(f"Value for '{f.operator}' must be a list.")
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
                q = q.groupby(*[t[dim] for dim in query_desc.dimensions])
            else:
                # If only dimensions are selected, use DISTINCT
                 q = q.distinct()

        # ORDER BY Clause
        for order in query_desc.orderBy:
             # Check if the field is an alias or a direct table field
             if order.field in all_aliases:
                 field_term = Field(order.field)
             else:
                 field_term = t[order.field]

             pypika_order = Order.desc if order.direction == 'desc' else Order.asc
             q = q.orderby(field_term, order=pypika_order)

        # LIMIT and OFFSET Clause
        if query_desc.limit is not None:
            if query_desc.limit < 0:
                 raise ValueError("Limit cannot be negative.")
            q = q.limit(query_desc.limit)
        if query_desc.offset is not None:
            if query_desc.offset < 0:
                raise ValueError("Offset cannot be negative.")
            q = q.offset(query_desc.offset)

        # Compile the query to string
        # Use backticks as default quoting, compatible with ClickHouse/DuckDB
        sql_string = q.get_sql(quote_char='`')

        print(f"Generated SQL ({db_type}): {sql_string}") # Logging for debug
        return sql_string

    # Potential future methods:
    # def translate_to_pandas(self, query_desc: QueryDescription, connector: Any) -> Any:
    #     # Logic to generate Pandas operations
    #     pass 