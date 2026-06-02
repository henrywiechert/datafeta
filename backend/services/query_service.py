# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Service responsible for translating query descriptions into executable queries."""

import logging
from typing import Any, Dict, List, Optional, Set, Tuple

from pypika import Criterion, Order, Query, Table
from pypika.functions import Avg, Coalesce, Count, Max, Min, Sum
from pypika.terms import Function

from backend.exceptions import QueryGenerationError
from backend.models.query import Dimension, Filter, Measure, OrderBy, QueryDescription
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
from backend.services.query_components.cast_field_applier import (
    get_field_with_cast,
    apply_cast_if_configured,
)
from backend.services.query_components.optimization_context_builder import (
    OptimizationContextBuilder,
)
from backend.services.query_components.result_budget_applier import apply_result_budget
from backend.services.query_components.filter_builder import FilterBuilder
from backend.services.query_components.sampling_limits_builder import (
    SamplingAndLimitsBuilder,
)
from backend.services.query_components.optimization_applier import OptimizationApplier
from backend.services.query_components.grouping_ordering_builder import (
    GroupingOrderingBuilder,
)
from backend.services.query_components.union import UnionQueryBuilder
from backend.services.query_components.virtual_column_builder import (
    VirtualColumnExpressionBuilder,
)
from backend.services.query_components.field_reference_parser import (
    FieldReferenceParser,
)
from backend.services.query_components.distinct_applier import DistinctApplier
from backend.services.query_components.cdf_query_builder import build_cdf_sql
from backend.services.query_components.box_plot_query_builder import build_box_plot_sql

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

    def _get_column_types_for_duckdb(
        self,
        db_type: str,
        connector: Optional[Any],
        table_name: str,
        target_database: Optional[str],
    ) -> Optional[Dict[str, str]]:
        """Fetch column types to enable narrow-int BIGINT promotion in DuckDB virtual columns.

        Returns a mapping of column name -> upper-cased DB data type, or None when
        the types cannot be determined (non-DuckDB backend, no connector, or any
        transient error during metadata retrieval).
        """
        if db_type not in {'duckdb', 'csv', 'file', 'kaggle', 'hive_parquet'} or connector is None:
            return None
        try:
            cols = connector.list_columns(database=target_database, table=table_name)
            return {col.name: col.data_type for col in cols}
        except Exception:
            logger.debug(
                "Could not fetch column types for DuckDB virtual column type promotion",
                exc_info=True,
            )
            return None

    def _get_field_with_cast(self, table: Any, field_name: str, column_casts: Optional[Dict[str, Dict[str, str]]] = None) -> Any:
        """Get a field reference, applying CAST if configured. Delegates to cast_field_applier."""
        return get_field_with_cast(table, field_name, column_casts)

    def _apply_cast_if_configured(
        self,
        field_identifier: str,
        field_term: Any,
        column_casts: Optional[Dict[str, Dict[str, str]]]
    ) -> Any:
        """Apply CastField wrapper when configured. Delegates to cast_field_applier."""
        return apply_cast_if_configured(field_identifier, field_term, column_casts)

    def _build_table_context(
        self,
        query_desc: QueryDescription,
        db_type: str,
        fallback_table_name: Optional[str]
    ) -> TableContext:
        """Create initial PyPika query and table context for the provided description."""
        from backend.dialects import get_dialect
        dialect = get_dialect(db_type)
        builder = TableContextBuilder()
        return builder.build(query_desc, dialect, fallback_table_name)

    def _build_optimization_context(
        self,
        query_desc: QueryDescription,
        optimizer: Optional[Any],
        with_optimization: bool
    ) -> OptimizationContext:
        """Create optimization plan and derivative configs. Delegates to OptimizationContextBuilder."""
        builder = OptimizationContextBuilder(logger=logger)
        return builder.build(query_desc, optimizer, with_optimization)

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
        from backend.dialects import get_dialect
        dialect = get_dialect(db_type)
        
        field_parser = FieldReferenceParser(
            table_map=table_map,
            default_table=default_table,
            vc_builder=vc_builder
        )
        
        builder = SelectClauseBuilder(
            parse_field_reference=field_parser.parse,
            apply_cast_if_configured=self._apply_cast_if_configured,
            vc_builder=vc_builder,
        )

        return builder.build(
            query_desc=query_desc,
            table_map=table_map,
            default_table=default_table,
            dialect=dialect,
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
        from backend.dialects import get_dialect
        dialect = get_dialect(db_type)
        
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
            dialect=dialect,
            primary_table=primary_table,
        )

    def _build_having_criteria(
        self,
        query_desc: QueryDescription,
        table_map: Dict[str, Any],
        default_table: Any,
        vc_builder: Optional[VirtualColumnExpressionBuilder] = None,
    ) -> List[Criterion]:
        """Return HAVING criteria for group-scoped (measure) filters."""
        field_parser = FieldReferenceParser(
            table_map=table_map,
            default_table=default_table,
            vc_builder=vc_builder,
        )
        builder = FilterBuilder(
            parse_field_reference=field_parser.parse,
            apply_cast_if_configured=self._apply_cast_if_configured,
            get_field_with_cast=self._get_field_with_cast,
        )
        return builder.build_having(
            query_desc=query_desc,
            aggregation_map=AGGREGATION_MAP,
            table_map=table_map,
            default_table=default_table,
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
        from backend.dialects import get_dialect
        dialect = get_dialect(db_type)
        builder = SamplingAndLimitsBuilder(logger=logger)
        return builder.apply(
            query=query,
            query_desc=query_desc,
            dialect=dialect,
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

    def _translate_cdf_query(
        self,
        query_desc: QueryDescription,
        table_name: str,
        db_type: str,
        quote_char: str,
        connector: Optional[Any] = None,
    ) -> Tuple[str, Any]:
        """Build a CDF query using quantile breakpoints.

        Reuses the standard table-context and filter pipelines, then delegates
        the actual SQL construction to :func:`build_cdf_sql`.
        """
        table_context = self._build_table_context(query_desc, db_type, table_name)
        t = table_context.primary_table

        # Build WHERE clause via the standard filter pipeline
        vc_builder = None
        if query_desc.virtual_columns:
            column_types = self._get_column_types_for_duckdb(
                db_type, connector, table_name, query_desc.target_database
            )
            vc_builder = VirtualColumnExpressionBuilder(
                table_map=table_context.table_map,
                default_table=table_context.default_table,
                db_type=db_type,
                column_types=column_types,
                source_database=query_desc.target_database,
                source_table=query_desc.target_table,
            )
            for vc in query_desc.virtual_columns:
                vc_builder.register_virtual_column(vc)

        criteria = self._build_filter_criteria(
            query_desc,
            table_context.table_map,
            table_context.default_table,
            db_type,
            t,
            vc_builder,
        )

        filter_fragment = ""
        if criteria:
            from pypika import Criterion as _Crit
            combined = _Crit.all(criteria)
            filter_fragment = f"WHERE {combined.get_sql(quote_char=quote_char)}"

        # Build FROM clause (handles JOINs if present)
        from_clause = f"FROM {quote_char}{query_desc.target_table}{quote_char}"
        if query_desc.target_database:
            from_clause = f"FROM {quote_char}{query_desc.target_database}{quote_char}.{quote_char}{query_desc.target_table}{quote_char}"

        sql = build_cdf_sql(
            query_desc,
            db_type,
            quote_char,
            filter_sql_fragment=filter_fragment,
            from_clause=from_clause,
        )

        logger.info("CDF query (%s): %s", db_type, sql)
        return sql, {'optimizations': [], 'hints_used': None, 'override': None}

    def _build_specialized_from_clause(
        self,
        base_query: Query,
        quote_char: str,
    ) -> str:
        """Compile the FROM/JOIN portion from an existing PyPika query."""
        sql = base_query.select("*").get_sql(quote_char=quote_char)
        marker = " FROM "
        from_idx = sql.upper().find(marker)
        if from_idx == -1:
            raise QueryGenerationError(f"Unable to derive FROM clause from query: {sql}")
        return sql[from_idx + 1:]

    def _translate_box_plot_query(
        self,
        query_desc: QueryDescription,
        table_name: str,
        db_type: str,
        quote_char: str,
        connector: Optional[Any] = None,
    ) -> Tuple[str, Any]:
        """Build a grouped box-plot summary query."""
        table_context = self._build_table_context(query_desc, db_type, table_name)
        t = table_context.primary_table

        vc_builder = None
        if query_desc.virtual_columns:
            column_types = self._get_column_types_for_duckdb(
                db_type, connector, table_name, query_desc.target_database
            )
            vc_builder = VirtualColumnExpressionBuilder(
                table_map=table_context.table_map,
                default_table=table_context.default_table,
                db_type=db_type,
                column_types=column_types,
                source_database=query_desc.target_database,
                source_table=query_desc.target_table,
            )
            for vc in query_desc.virtual_columns:
                vc_builder.register_virtual_column(vc)

        criteria = self._build_filter_criteria(
            query_desc,
            table_context.table_map,
            table_context.default_table,
            db_type,
            t,
            vc_builder,
        )

        filter_fragment = ""
        if criteria:
            from pypika import Criterion as _Crit
            combined = _Crit.all(criteria)
            filter_fragment = f"WHERE {combined.get_sql(quote_char=quote_char)}"

        from_clause = self._build_specialized_from_clause(table_context.query, quote_char)

        field_parser = FieldReferenceParser(
            table_map=table_context.table_map,
            default_table=table_context.default_table,
            vc_builder=vc_builder,
        )

        group_fields: list[tuple[str, str]] = []
        for dim in query_desc.dimensions or []:
            field_term = field_parser.parse(dim.field)
            field_term = self._apply_cast_if_configured(dim.field, field_term, query_desc.column_casts)
            alias = dim.field
            if dim.date_part and dim.date_mode:
                field_term = DateTimeService.get_datetime_part_expression(
                    field_term, dim.date_part, dim.date_mode, db_type
                )
                alias = f"{dim.field}_{dim.date_part}_{dim.date_mode}"
            group_fields.append((field_term.get_sql(quote_char=quote_char), alias))

        value_fields: list[tuple[str, str]] = []
        for box_field in query_desc.box_plot_fields or []:
            field_term = field_parser.parse(box_field.field)
            field_term = self._apply_cast_if_configured(box_field.field, field_term, query_desc.column_casts)
            if box_field.date_part and box_field.date_mode:
                field_term = DateTimeService.get_datetime_part_expression(
                    field_term, box_field.date_part, box_field.date_mode, db_type
                )
            value_fields.append((field_term.get_sql(quote_char=quote_char), box_field.alias))

        color_field_sql = None
        if query_desc.box_plot_color_field:
            color_term = field_parser.parse(query_desc.box_plot_color_field)
            color_term = self._apply_cast_if_configured(
                query_desc.box_plot_color_field,
                color_term,
                query_desc.column_casts,
            )
            color_field_sql = color_term.get_sql(quote_char=quote_char)

        sql = build_box_plot_sql(
            query_desc,
            db_type,
            quote_char,
            group_fields,
            value_fields,
            filter_sql_fragment=filter_fragment,
            from_clause=from_clause,
            color_field_sql=color_field_sql,
        )

        logger.info("Box-plot summary query (%s): %s", db_type, sql)
        return sql, {'optimizations': [], 'hints_used': None, 'override': None}

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

        # Handle CDF (cumulative distribution function) query mode
        if query_desc.query_mode == 'cdf' and query_desc.cdf_fields:
            return self._translate_cdf_query(
                query_desc, table_name, db_type, quote_char, connector=connector,
            )

        # Handle grouped box-plot summary query mode
        if query_desc.query_mode == 'box_plot' and query_desc.box_plot_fields:
            return self._translate_box_plot_query(
                query_desc, table_name, db_type, quote_char, connector=connector,
            )

        # For filter value queries with JOINed tables, query the source table directly
        # This ensures we get ALL distinct values, not just those matching the JOIN condition
        # IMPORTANT: Only split on '.' if the prefix is a known table name.
        # Column names can legitimately contain dots (e.g., 'tableName.colName' as a literal).
        if (query_desc.fetch_filter_values and 
            query_desc.virtual_table and 
            query_desc.virtual_table.joined_tables and
            query_desc.dimensions and len(query_desc.dimensions) == 1):
            
            dim = query_desc.dimensions[0]
            field_name = dim.field
            
            # Check if field is qualified (e.g., "races.status")
            if '.' in field_name:
                parts = field_name.split('.', 1)
                if len(parts) == 2:
                    potential_table_name, remaining = parts
                    
                    # Validate prefix against known table names
                    known_tables = {query_desc.virtual_table.primary_table}
                    for jt in query_desc.virtual_table.joined_tables:
                        known_tables.add(jt.table_name)
                    
                    if potential_table_name in known_tables:
                        source_table_name = potential_table_name
                        column_name = remaining
                    
                        # Create a simplified query desc for the source table directly
                        logger.info(
                            f"Filter value query: Using source table '{source_table_name}' directly "
                            f"for field '{column_name}' (bypassing JOIN to get ALL distinct values)"
                        )
                        
                        # Create a new dimension with just the column name
                        from backend.models.query import Dimension
                        simplified_dim = Dimension(
                            field=column_name,
                            flavour=dim.flavour,
                            axis=dim.axis,
                            date_part=dim.date_part,
                            date_mode=dim.date_mode,
                        )
                        
                        # Create a copy of query_desc without the virtual_table (for single table query)
                        # We need to query the source table directly
                        simplified_query_desc = QueryDescription(
                            target_table=source_table_name,
                            target_database=query_desc.target_database,
                            dimensions=[simplified_dim],
                            measures=query_desc.measures,
                            filters=query_desc.filters,  # Keep filters but they may need adjustment
                            orderBy=query_desc.orderBy,
                            limit=query_desc.limit,
                            offset=query_desc.offset,
                            optimization_hints=query_desc.optimization_hints,
                            column_casts=query_desc.column_casts,
                            label_fields=query_desc.label_fields,
                            virtual_table=None,  # No JOIN - query single table
                            virtual_columns=query_desc.virtual_columns,
                            result_budget=query_desc.result_budget,
                            force_raw_rows=query_desc.force_raw_rows,
                            fetch_filter_values=query_desc.fetch_filter_values,
                            filter_value_result_alias=field_name,
                            distinct_value_regex=query_desc.distinct_value_regex,
                            use_random_sample=query_desc.use_random_sample,
                        )
                        
                        # Recursively call translate_to_sql with the simplified query
                        return self.translate_to_sql(
                            simplified_query_desc,
                            source_table_name,
                            db_type=db_type,
                            with_sampling=with_sampling,
                            with_optimization=with_optimization,
                            optimizer=optimizer,
                            connector=connector,
                        )
                    else:
                        # Prefix doesn't match a known table — the dot is part of the column name
                        logger.info(
                            f"Filter value query: Field '{field_name}' has dot but prefix "
                            f"'{potential_table_name}' is not a known table ({known_tables}). "
                            f"Treating full name as column name."
                        )

        table_context = self._build_table_context(query_desc, db_type, table_name)
        q = table_context.query
        table_map = table_context.table_map
        default_table = table_context.default_table
        t = table_context.primary_table

        # NEW: Initialize virtual column builder if virtual columns are defined
        vc_builder = None
        if query_desc.virtual_columns:
            column_types = self._get_column_types_for_duckdb(
                db_type, connector, table_name, query_desc.target_database
            )
            vc_builder = VirtualColumnExpressionBuilder(
                table_map=table_map,
                default_table=default_table,
                db_type=db_type,
                column_types=column_types,
                source_database=query_desc.target_database,
                source_table=query_desc.target_table,
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

        having_criteria = self._build_having_criteria(
            query_desc,
            table_context.table_map,
            table_context.default_table,
            vc_builder,
        )
        if having_criteria:
            q = q.having(Criterion.all(having_criteria))

        q = self._apply_ordering(q, query_desc.orderBy, all_aliases, t, table_context.table_map, table_context.default_table, vc_builder)

        q = self._apply_sampling_and_limits(q, query_desc, db_type, t, with_sampling)

        # Compile the query to string using the chosen quote char
        sql_string = q.get_sql(quote_char=quote_char)
        logger.info(f"Generated SQL ({db_type}): {sql_string}")

        # --- Result budget / reduction (best-effort) ---------------------------------
        # This is applied after the pypika query is compiled. We wrap SQL with an outer
        # sampling query when the frontend requests a result_budget (e.g. oversize scatter).
        try:
            from backend.dialects import get_dialect
            dialect = get_dialect(db_type)
            sql_string = apply_result_budget(sql_string, query_desc, dialect=dialect, logger=logger)
        except Exception as exc:  # pragma: no cover
            logger.warning("Result budget wrapper failed, continuing without reduction: %s", exc, exc_info=True)
        
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