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

    def _get_datetime_part_expression(self, field_term: Any, date_part: str, date_mode: str, db_type: str) -> Any:
        """
        Generate database-specific SQL expression for extracting datetime parts.
        
        Delegates to DateTimeService for the actual implementation.
        This method is kept for backward compatibility with existing code.
        
        Args:
            field_term: The field/column to extract from
            date_part: The part to extract (year, month, day, hour, etc.)
            date_mode: Either 'distinct' or 'timeline'
            db_type: The database type (clickhouse, duckdb, etc.)
        
        Returns:
            PyPika expression for the datetime extraction
            
        Behavior:
            - distinct mode: Extracts just the part (e.g., hour → 0-23, month → 1-12)
            - timeline mode: Truncates to preserve timeline (e.g., hour → "2024-01-15 14:00:00")
        """
        return DateTimeService.get_datetime_part_expression(
            field_term, date_part, date_mode, db_type
        )


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
                        # Split only on first dot to handle column names that contain dots
                        left_part = parts[0].strip().split('.', 1)
                        right_part = parts[1].strip().split('.', 1)
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
        vc_builder: Optional[VirtualColumnExpressionBuilder] = None,
    ) -> SelectClauseResult:
        """Assemble SELECT fields and related alias/grouping metadata."""
        
        # Create field reference parser that handles virtual columns
        field_parser = FieldReferenceParser(
            table_map=table_map,
            default_table=default_table,
            vc_builder=vc_builder
        )
        
        # Create adapter function to match the old signature (field_name, table_map, default_table)
        # while using the new parser that only needs field_name
        def parse_field_adapter(field_name: str, table_map_param: Dict[str, Any], default_table_param: Any) -> Any:
            return field_parser.parse(field_name)
        
        builder = SelectClauseBuilder(
            parse_field_reference=parse_field_adapter,
            apply_cast_if_configured=self._apply_cast_if_configured,
            get_datetime_part_expression=self._get_datetime_part_expression,
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
        
        # Create adapter function to match the old signature
        def parse_field_adapter(field_name: str, table_map_param: Dict[str, Any], default_table_param: Any) -> Any:
            return field_parser.parse(field_name)
        
        builder = FilterBuilder(
            parse_field_reference=parse_field_adapter,
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
        use_category_dedup: bool,
        groupby_field_info_for_dedup: List[Tuple[str, Optional[Any]]],
        with_optimization: bool,
        optimizer: Optional[Any],
        vc_builder: Optional[VirtualColumnExpressionBuilder] = None
    ) -> Query:
        builder = GroupingOrderingBuilder(
            logger=logger,
            get_datetime_part_expression=self._get_datetime_part_expression,
        )
        return builder.apply_grouping(
            query,
            query_desc=query_desc,
            db_type=db_type,
            primary_table=primary_table,
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
        vc_builder: Optional[VirtualColumnExpressionBuilder] = None
    ) -> Query:
        builder = GroupingOrderingBuilder(logger=logger)
        return builder.apply_ordering(
            query,
            order_by=order_by,
            all_aliases=all_aliases,
            primary_table=primary_table,
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
                default_table=default_table
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
            vc_builder,
        )

        q = self._apply_ordering(q, query_desc.orderBy, all_aliases, t, vc_builder)

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