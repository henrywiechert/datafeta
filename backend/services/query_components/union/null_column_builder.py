"""Build NULL column expressions for schema alignment across UNION tables."""

from __future__ import annotations

import logging
import re
from typing import Dict, List, Optional, Set, Tuple, TYPE_CHECKING

if TYPE_CHECKING:
    from backend.dialects import SqlDialect
    from backend.models.query import Dimension, Measure


# Mapping of common type names to ClickHouse types
CLICKHOUSE_TYPE_MAPPING = {
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


def extract_base_clickhouse_type(ch_type: str) -> str:
    """
    Strip Nullable(...) and LowCardinality(...) wrappers from a ClickHouse type
    to get the base type suitable for CAST(NULL AS Nullable(<base>)).

    Examples:
        'Float64' → 'Float64'
        'Nullable(Float64)' → 'Float64'
        'LowCardinality(String)' → 'String'
        'LowCardinality(Nullable(String))' → 'String'
    """
    result = ch_type.strip()
    changed = True
    while changed:
        changed = False
        for prefix in ('Nullable(', 'LowCardinality('):
            if result.startswith(prefix) and result.endswith(')'):
                result = result[len(prefix):-1].strip()
                changed = True
    return result


def map_output_type_to_clickhouse(output_type: str) -> str:
    """
    Map virtual column output types to ClickHouse Nullable types.
    
    Args:
        output_type: The output type from VirtualColumnDefinition (e.g., 'DOUBLE', 'INTEGER', 'VARCHAR')
        
    Returns:
        ClickHouse-compatible Nullable type string
    """
    type_upper = output_type.upper()
    return CLICKHOUSE_TYPE_MAPPING.get(type_upper, type_upper)


def build_null_column(
    field_key: str, 
    is_measure: bool, 
    dialect: "SqlDialect",
    output_type: Optional[str] = None,
    column_type: Optional[str] = None,
) -> str:
    """
    Build NULL column expression with appropriate casting.
    
    Args:
        field_key: The column alias/key
        is_measure: Whether this is a measure column
        dialect: SQL dialect for database-specific syntax
        output_type: Optional type hint for casting (e.g., from virtual column definition)
        column_type: Optional actual DB column type (e.g., 'Float64', 'Nullable(Int32)').
                     Used to match the real column type in UNION ALL schema alignment.
        
    Returns:
        SQL expression for NULL column with proper casting
    """
    return dialect.cast_null_expr(
        alias=field_key,
        type_hint=output_type,
        is_measure=is_measure,
        column_type=column_type,
    )


def build_null_only_query(
    database: str,
    table_name: str,
    missing_dimension_keys: List[str],
    missing_measure_keys: List[Tuple[str, "Measure"]],
    dialect: "SqlDialect",
    virtual_columns: Optional[List] = None,
    column_types: Optional[Dict[str, str]] = None,
    logger: Optional[logging.Logger] = None,
) -> str:
    """
    Build a query with only NULL values when all requested fields are missing.
    
    Args:
        database: Database name
        table_name: Table name
        missing_dimension_keys: List of dimension field keys that are missing
        missing_measure_keys: List of (field_key, measure) tuples that are missing
        dialect: SQL dialect for database-specific syntax
        virtual_columns: Optional list of VirtualColumnDefinition objects for type hints
        column_types: Optional mapping of column name → DB data type from other tables
        logger: Optional logger instance
        
    Returns:
        SQL query string with NULL values
    """
    logger = logger or logging.getLogger(__name__)
    column_types = column_types or {}
    quote_char = dialect.quote_char
    
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
    
    # Add NULL for all dimensions (in order) - use virtual column type hints when available,
    # then fall back to actual column types from other tables in the UNION
    for field_key in missing_dimension_keys:
        output_type = vc_type_map.get(field_key)
        col_type = column_types.get(field_key)
        select_items.append(
            build_null_column(field_key, False, dialect, output_type, column_type=col_type)
        )
    
    # Add NULL for all measures (in order)
    for field_key, measure in missing_measure_keys:
        select_items.append(build_null_column(field_key, True, dialect))
    
    # Determine query type:
    # - If any dimensions: return 0 rows (dimensions without values don't make sense)
    # - If only measures: return 1 NULL row for aggregation
    if missing_dimension_keys:
        sql = f"SELECT {', '.join(select_items)} FROM {table_reference} WHERE 1=0"
        logger.info(f"All dimensions missing from table {table_name}, generated empty result (0 rows)")
    else:
        sql = f"SELECT {', '.join(select_items)} FROM {table_reference} LIMIT 1"
        logger.info(f"All measures missing from table {table_name}, generated NULL-only aggregated query (1 row)")
    
    return sql


def parse_select_expressions(
    select_clause: str, 
    quote_char: str,
) -> Dict[str, str]:
    """
    Parse SELECT clause to extract expression-to-alias mapping.
    
    Args:
        select_clause: The SELECT clause string (without SELECT keyword)
        quote_char: Quote character for identifiers
        
    Returns:
        Dictionary mapping alias -> expression
    """
    # Split by comma, respecting nested parentheses
    select_items_raw = []
    paren_depth = 0
    current_item: List[str] = []
    
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


def rebuild_select_with_nulls(
    single_sql: str,
    all_dimension_fields: List[Tuple[str, "Dimension"]],
    all_measure_fields: List[Tuple[str, "Measure"]],
    table_columns: Set[str],
    table_name: str,
    dialect: "SqlDialect",
    virtual_columns: Optional[List] = None,
    vc_source_map: Optional[Dict[str, List[str]]] = None,
    can_compute_virtual_column_fn: Optional[callable] = None,
    column_types: Optional[Dict[str, str]] = None,
    logger: Optional[logging.Logger] = None,
) -> str:
    """
    Rebuild the SELECT clause to include all fields in correct order, with NULLs for missing fields.
    
    Args:
        single_sql: Generated SQL from single table translation
        all_dimension_fields: All dimension fields requested
        all_measure_fields: All measure fields requested
        table_columns: Set of columns that exist in this table
        table_name: Table name (for logging)
        dialect: SQL dialect for database-specific syntax
        virtual_columns: Optional list of VirtualColumnDefinition objects for type hints
        vc_source_map: Map of virtual column name -> source field names
        can_compute_virtual_column_fn: Function to check if virtual column can be computed
        column_types: Optional mapping of column name → DB data type from other tables
        logger: Optional logger instance
        
    Returns:
        Rebuilt SQL with all fields in correct order
    """
    logger = logger or logging.getLogger(__name__)
    column_types = column_types or {}
    quote_char = dialect.quote_char
    
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
    existing_expressions = parse_select_expressions(select_clause, quote_char)
    
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
            if can_compute_virtual_column_fn:
                field_available = can_compute_virtual_column_fn(dim.field, vc_source_map, table_columns)
            else:
                # Fallback: assume available if no checker provided
                field_available = True
        else:
            # Physical column: check if column exists
            field_available = not table_columns or dim.field in table_columns
        
        if field_available:
            # Field exists - use the expression from generated SQL (preserves optimizations)
            if field_key in existing_expressions:
                expr = existing_expressions[field_key]
                # Guard: when the input SQL was generated by build_null_only_query
                # (e.g. table skipped because a *filter* field is missing), the parsed
                # expression is a NULL cast even though this column physically exists
                # in the table.  Replace it with a direct column reference so that
                # ClickHouse resolves the real column type and avoids NO_COMMON_TYPE
                # errors in UNION ALL.  We only do this for physical columns; virtual
                # columns don't have a physical column to reference.
                if not is_virtual and expr.strip().upper().startswith("CAST(NULL"):
                    logger.debug(
                        "Replacing NULL-cast expression for available physical column '%s' "
                        "in table %s with direct column reference",
                        field_key, table_name,
                    )
                    expr = f"{quote_char}{field_key}{quote_char}"
            else:
                # Fallback: select the (already-aliased) output column name.
                # This is critical for derived dimension aliases like datetime parts:
                # e.g. dim.field="utc" but field_key="utc_second_timeline". In optimized/budget-wrapped SQL,
                # the top-level FROM may not expose the raw base field ("utc"), but it does expose the alias.
                expr = f"{quote_char}{field_key}{quote_char}"
            
            select_items.append(f"{expr} AS {quote_char}{field_key}{quote_char}")
        else:
            # Field missing - NULL (use virtual column output_type if available,
            # then fall back to actual column types from other tables in the UNION)
            output_type = vc_type_map.get(dim.field)
            col_type = column_types.get(field_key)
            select_items.append(
                build_null_column(field_key, False, dialect, output_type, column_type=col_type)
            )
    for field_key, measure in all_measure_fields:
        is_star_count = measure.aggregation == "count" and measure.field == "*"
        is_virtual = measure.field in vc_source_map

        measure_available = False
        if is_star_count:
            measure_available = True
        elif not table_columns:
            measure_available = True
        elif is_virtual:
            if can_compute_virtual_column_fn:
                measure_available = can_compute_virtual_column_fn(measure.field, vc_source_map, table_columns)
            else:
                measure_available = True
        else:
            measure_available = measure.field in table_columns

        if measure_available:
            if field_key in existing_expressions:
                expr = existing_expressions[field_key]
            else:
                expr = f"{quote_char}{field_key}{quote_char}"
            
            if dialect.name == 'clickhouse':
                select_items.append(
                    f"CAST({expr} AS Nullable(Float64)) AS {quote_char}{field_key}{quote_char}"
                )
            else:
                select_items.append(f"{expr} AS {quote_char}{field_key}{quote_char}")
        else:
            select_items.append(build_null_column(field_key, True, dialect))
    
    # Rebuild the complete SQL with ordered SELECT
    rebuilt_sql = f"SELECT {', '.join(select_items)} FROM{from_and_rest}"
    logger.debug(f"Rebuilt SQL for table {table_name} with {len(select_items)} fields in correct order, preserving optimizations")
    
    return rebuilt_sql
