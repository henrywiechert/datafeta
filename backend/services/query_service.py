"""Service responsible for translating query descriptions into executable queries."""

import logging
from typing import Any, Dict, List, Optional, Set, Tuple

from pypika import Criterion, Order, Query, Table
from pypika.functions import Avg, Coalesce, Count, Max, Min, Sum
from pypika.terms import Function

from backend.exceptions import QueryGenerationError
from backend.models.query import Filter, Measure, OrderBy, QueryDescription
from backend.services.datetime_service import DateTimeService
from backend.services.query_components.contexts import (
    OptimizationContext,
    SelectClauseResult,
    TableContext,
)
from backend.services.query_components.select_builder import SelectClauseBuilder
from backend.services.query_components.table_context_builder import TableContextBuilder
from backend.services.query_components.terms import (
    CastField,
    ExtractTerm,
    QuotedField,
    UnquotedField,
)
from backend.services.query_components.filter_builder import FilterBuilder
from backend.services.query_components.sampling_limits_builder import (
    SamplingAndLimitsBuilder,
)
from backend.services.query_components.optimization_applier import OptimizationApplier
from backend.services.query_components.grouping_ordering_builder import (
    GroupingOrderingBuilder,
)
from backend.services.query_components.union_query_builder import UnionQueryBuilder
from backend.services.query_components.virtual_column_builder import (
    VirtualColumnExpressionBuilder,
)
from backend.services.query_components.field_reference_parser import (
    FieldReferenceParser,
)
from backend.services.query_components.distinct_applier import DistinctApplier

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


class QueryService:

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
        builder = TableContextBuilder()
        return builder.build(query_desc, db_type, fallback_table_name)

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
        vc_builder: Optional[VirtualColumnExpressionBuilder] = None,
    ) -> SelectClauseResult:
        """Assemble SELECT fields and related alias/grouping metadata."""
        
        # Create field reference parser that handles virtual columns
        field_parser = FieldReferenceParser(
            table_map=table_map,
            default_table=default_table,
            vc_builder=vc_builder
        )
        
        builder = SelectClauseBuilder(
            parse_field_reference=field_parser.parse,
            apply_cast_if_configured=self._apply_cast_if_configured,
            vc_builder=vc_builder,  # Pass vc_builder for aliasing logic
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
        primary_table: Any,
        vc_builder: Optional[VirtualColumnExpressionBuilder] = None,
    ) -> List[Criterion]:
        """Translate filters, automatic null guards, and regex sampling into Criterion list."""
        
        # Create field reference parser that handles virtual columns
        field_parser = FieldReferenceParser(
            table_map=table_map,
            default_table=default_table,
            vc_builder=vc_builder
        )
        
        builder = FilterBuilder(
            parse_field_reference=field_parser.parse,
            apply_cast_if_configured=self._apply_cast_if_configured,
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
        applier = OptimizationApplier(logger=logger)
        return applier.apply(
            query=query,
            optimization_plan=optimization_plan,
            query_desc=query_desc,
            primary_table=primary_table,
            binning_config=binning_config,
            use_category_dedup=use_category_dedup,
            with_optimization=with_optimization,
            optimizer=optimizer,
        )

    def _apply_grouping(
        self,
        query: Query,
        query_desc: QueryDescription,
        db_type: str,
        primary_table: Any,
        table_map: Dict[str, Any],
        default_table: Any,
        use_category_dedup: bool,
        groupby_field_info_for_dedup: List[Tuple[str, Optional[Any]]],
        with_optimization: bool,
        optimizer: Optional[Any],
        vc_builder: Optional[VirtualColumnExpressionBuilder] = None
    ) -> Query:
        builder = GroupingOrderingBuilder(
            logger=logger,
        )
        return builder.apply_grouping(
            query,
            query_desc=query_desc,
            db_type=db_type,
            primary_table=primary_table,
            table_map=table_map,
            default_table=default_table,
            use_category_dedup=use_category_dedup,
            groupby_field_info_for_dedup=groupby_field_info_for_dedup,
            with_optimization=with_optimization,
            optimizer=optimizer,
            vc_builder=vc_builder,
        )

    def _apply_ordering(
        self,
        query: Query,
        order_by: List[OrderBy],
        all_aliases: Set[str],
        primary_table: Any,
        table_map: Dict[str, Any],
        default_table: Any,
        vc_builder: Optional[VirtualColumnExpressionBuilder] = None
    ) -> Query:
        builder = GroupingOrderingBuilder(logger=logger)
        return builder.apply_ordering(
            query,
            order_by=order_by,
            all_aliases=all_aliases,
            primary_table=primary_table,
            table_map=table_map,
            default_table=default_table,
            vc_builder=vc_builder,
        )

    def _apply_sampling_and_limits(
        self,
        query: Query,
        query_desc: QueryDescription,
        db_type: str,
        primary_table: Any,
        with_sampling: bool
    ) -> Query:
        """Delegate sampling and limit logic to SamplingAndLimitsBuilder."""
        builder = SamplingAndLimitsBuilder(logger=logger)
        return builder.apply(
            query=query,
            query_desc=query_desc,
            db_type=db_type,
            primary_table=primary_table,
            with_sampling=with_sampling,
        )

    def _parse_field_reference(self, field_name: str, table_map: Dict[str, Any], default_table: Any) -> Any:
        """
        Parse a field reference that may include a table prefix (e.g., 'customers.name').
        
        DEPRECATED: Use FieldReferenceParser class instead. This method is kept for
        backward compatibility with existing tests.
        
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

    def translate_to_sql(
        self, 
        query_desc: QueryDescription, 
        table_name: str, 
        db_type: str = 'clickhouse', 
        with_sampling: bool = False,
        with_optimization: bool = True,
        optimizer: Optional[Any] = None,
        connector: Optional[Any] = None
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
            connector: Database connector (optional, needed for union table column filtering).

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
            builder = UnionQueryBuilder(
                translate_single_table=self.translate_to_sql,
                connector=connector,
                logger=logger,
            )
            return builder.translate(
                query_desc,
                db_type=db_type,
                quote_char=quote_char,
                with_sampling=with_sampling,
                with_optimization=with_optimization,
                optimizer=optimizer,
            )

        table_context = self._build_table_context(query_desc, db_type, table_name)
        q = table_context.query
        table_map = table_context.table_map
        default_table = table_context.default_table
        t = table_context.primary_table

        # NEW: Initialize virtual column builder if virtual columns are defined
        vc_builder = None
        if query_desc.virtual_columns:
            vc_builder = VirtualColumnExpressionBuilder(
                table_map=table_map,
                default_table=default_table,
                db_type=db_type,
            )
            
            # Register all virtual columns
            for vc in query_desc.virtual_columns:
                try:
                    vc_builder.register_virtual_column(vc)
                    logger.info(f"Registered virtual column: {vc.name}")
                except QueryGenerationError as e:
                    logger.error(f"Failed to register virtual column '{vc.name}': {e}")
                    raise

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
            vc_builder,  # NEW: Pass virtual column builder
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
            vc_builder,  # NEW: Pass virtual column builder
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
        
        # Apply DISTINCT for discrete-only dimension queries (e.g., filter panels)
        distinct_applier = DistinctApplier()
        q = distinct_applier.apply_if_needed(q, query_desc, use_category_dedup)
        
        q = self._apply_grouping(
            q,
            query_desc,
            db_type,
            t,
            table_context.table_map,
            table_context.default_table,
            use_category_dedup,
            groupby_field_info_for_dedup,
            with_optimization,
            optimizer,
            vc_builder,
        )

        q = self._apply_ordering(q, query_desc.orderBy, all_aliases, t, table_context.table_map, table_context.default_table, vc_builder)

        q = self._apply_sampling_and_limits(q, query_desc, db_type, t, with_sampling)

        # Compile the query to string using the chosen quote char
        sql_string = q.get_sql(quote_char=quote_char)
        logger.info(f"Generated SQL ({db_type}): {sql_string}")

        # --- Result budget / reduction (best-effort) ---------------------------------
        # This is applied after the pypika query is compiled. We wrap SQL with an outer
        # sampling query when the frontend requests a result_budget (e.g. oversize scatter).
        try:
            sql_string = self._apply_result_budget(sql_string, query_desc, db_type=db_type, quote_char=quote_char)
        except Exception as exc:  # pragma: no cover
            logger.warning("Result budget wrapper failed, continuing without reduction: %s", exc, exc_info=True)
        
        # Build extended metadata including hints and override
        extended_metadata = {
            'optimizations': optimization_metadata,
            'hints_used': optimization_plan.hints_used if optimization_plan else None,
            'override': optimization_plan.override if optimization_plan else None
        }
        
        return sql_string, extended_metadata

    def _apply_result_budget(self, sql: str, query_desc: QueryDescription, *, db_type: str, quote_char: str) -> str:
        budget = getattr(query_desc, "result_budget", None)
        if not budget:
            return sql
        if not getattr(budget, "max_rows", None) or budget.strategy == "none":
            return sql

        # Only apply to "raw" queries.
        # Aggregated queries already reduce via GROUP BY and should not be randomly sampled here.
        if query_desc.measures:
            return sql

        # If the frontend explicitly provided a budget, apply it for any non-aggregated query.
        # Do NOT depend on axis metadata here: during UI interactions we can temporarily miss axis info,
        # which would cause inconsistent "first drag" behavior.

        max_rows = int(budget.max_rows)
        strategy = budget.strategy
        stratify_field = budget.stratify_field
        min_per = int(budget.min_per_stratum or 0)

        # Normalize the base query as a subquery
        base_sql = sql.strip().rstrip(";")

        if strategy == "stratified" and stratify_field:
            # Best-effort stratified sampling with window functions.
            # This is designed to preserve proportions across discrete categories.
            #
            # ClickHouse uses rand(); DuckDB uses random().
            rand_func = "rand()" if db_type == "clickhouse" else "random()"
            qf = f"{quote_char}{stratify_field}{quote_char}"
            # ClickHouse supports greatest(); DuckDB supports greatest().
            # Use integer truncation for target rows per stratum.
            if db_type == "clickhouse":
                target_expr = f"greatest({min_per}, intDiv({max_rows} * cat_cnt, total_cnt))"
            else:
                target_expr = f"greatest({min_per}, cast({max_rows} * cat_cnt / total_cnt as integer))"

            return f"""
SELECT * FROM (
  SELECT
    base.*,
    row_number() OVER (PARTITION BY {qf} ORDER BY {rand_func}) AS rn,
    count(*) OVER (PARTITION BY {qf}) AS cat_cnt,
    count(*) OVER () AS total_cnt
  FROM (
    {base_sql}
  ) AS base
) AS sampled
WHERE rn <= {target_expr}
""".strip()

        # Fallback: random global sample to max_rows
        rand_func = "rand" if db_type == "clickhouse" else "random"
        return f'SELECT * FROM (\n{base_sql}\n) AS base\nORDER BY {rand_func}()\nLIMIT {max_rows}'

    # Potential future methods:
    # def translate_to_pandas(self, query_desc: QueryDescription, connector: Any) -> Any:
    #     # Logic to generate Pandas operations
    #     pass 