"""Helpers for planning rounding and binning strategies."""

from __future__ import annotations

import logging
from typing import Dict, FrozenSet, List, Optional, Set, Tuple

from backend.connectors.base import BaseConnector
from backend.models.query import QueryDescription
from backend.services.datetime_service import DateTimeService

from ..config import OptimizerConfig
from ..estimators.base import ResultSizeEstimator
from ..strategies.adaptive_rounding import AdaptiveRoundingStrategy
from ..strategies.base import OptimizationStrategy
from ..strategies.datetime_binning import DateTimeBinningStrategy

# Built-in virtual columns that only exist in UNION queries, not in actual tables.
# These must be skipped when building estimation/range queries against real tables.
BUILTIN_VIRTUAL_COLUMNS: FrozenSet[str] = frozenset({'_source_database', '_source_table'})


class AdaptiveRoundingPlanner:
    """Create rounding and binning strategies based on query shape."""

    def __init__(
        self,
        *,
        config: OptimizerConfig,
        connector: Optional[BaseConnector],
        estimator: Optional[ResultSizeEstimator],
        db_type: str,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        self._config = config
        self._connector = connector
        self._estimator = estimator
        self._db_type = db_type
        self._logger = logger or logging.getLogger(__name__)
        # Set quote character based on database type
        self._quote_char = '`' if db_type == 'clickhouse' else '"'

    def _get_virtual_column_names(self, query_desc: QueryDescription) -> Set[str]:
        """
        Get the set of all virtual column names that don't exist in the actual table.
        
        This includes:
        - Built-in virtual columns (_source_database, _source_table)
        - User-defined virtual columns from query_desc.virtual_columns
        """
        virtual_names: Set[str] = set(BUILTIN_VIRTUAL_COLUMNS)
        
        if query_desc.virtual_columns:
            for vc in query_desc.virtual_columns:
                virtual_names.add(vc.name)
                self._logger.debug("Tracking user-defined virtual column: %s", vc.name)
        
        return virtual_names

    def plan_multi_dimensional(
        self,
        query_desc: QueryDescription,
        category_expected: bool,
    ) -> List[OptimizationStrategy]:
        strategies: List[OptimizationStrategy] = []

        if not self._config.enable_adaptive_rounding:
            return strategies

        if not self._connector:
            self._logger.warning("Adaptive rounding enabled but no connector available")
            return strategies

        try:
            unique_count = self._get_actual_unique_pair_count(query_desc)
            if unique_count is None and self._estimator:
                estimate = self._estimator.estimate_size(query_desc)
                unique_count = estimate.unique_pairs or estimate.total_rows

            if unique_count is None:
                return strategies

            threshold = self._config.rounding_threshold
            if category_expected:
                threshold = threshold // 2

            if unique_count > threshold:
                dimension_ranges = self._fetch_dimension_ranges(query_desc)
                timeline_dims = [d for d in query_desc.dimensions if d.date_mode == "timeline"]
                if timeline_dims:
                    strategies.append(
                        DateTimeBinningStrategy(
                            db_type=self._db_type,
                            estimator=self._estimator,
                            target_buckets=self._config.target_buckets,
                            dimension_ranges=dimension_ranges,
                        )
                    )
                else:
                    strategies.append(
                        AdaptiveRoundingStrategy(
                            db_type=self._db_type,
                            estimator=self._estimator,
                            target_buckets=self._config.target_buckets,
                            dimension_ranges=dimension_ranges,
                        )
                    )
        except Exception as exc:  # pragma: no cover - defensive path
            self._logger.warning(
                "Size estimation failed, skipping rounding/binning: %s",
                exc,
                exc_info=True,
            )

        return strategies

    def plan_single_dimension(
        self,
        query_desc: QueryDescription,
        threshold: int,
    ) -> Optional[OptimizationStrategy]:
        if not self._config.enable_adaptive_rounding:
            return None

        if not self._connector:
            self._logger.warning("Adaptive rounding (1D) requested but no connector available")
            return None

        try:
            unique_count = self._get_actual_unique_single_count(query_desc)
            if unique_count is None and self._estimator:
                estimate = self._estimator.estimate_size(query_desc)
                unique_count = estimate.unique_pairs or estimate.total_rows
                self._logger.info(
                    "📊 Estimated unique values (fallback, 1D): %s",
                    unique_count,
                )

            if unique_count is not None and unique_count > threshold:
                self._logger.info(
                    "✅ APPLYING 1D ROUNDING: %s > %s",
                    unique_count,
                    threshold,
                )
                dimension_ranges = self._fetch_dimension_ranges(query_desc)
                return AdaptiveRoundingStrategy(
                    db_type=self._db_type,
                    estimator=self._estimator,
                    target_buckets=self._config.target_buckets,
                    dimension_ranges=dimension_ranges,
                )

            self._logger.info("❌ SKIPPING 1D ROUNDING: below threshold or unknown size")
            return None
        except Exception as exc:  # pragma: no cover - defensive path
            self._logger.warning("1D rounding decision failed: %s", exc, exc_info=True)
            return None

    def plan_binning(
        self,
        query_desc: QueryDescription,
        threshold: Optional[int] = None,
    ) -> Optional[OptimizationStrategy]:
        if not self._config.enable_adaptive_rounding:
            self._logger.warning("Binning requested but adaptive rounding disabled in config")
            return None

        if not self._connector:
            self._logger.warning("Binning requested but no connector available")
            return None

        timeline_dims = [d for d in query_desc.dimensions if d.date_mode == "timeline"]
        if not timeline_dims:
            self._logger.info("No timeline dimensions found, skipping binning")
            return None

        try:
            continuous_dims = [d for d in query_desc.dimensions if d.flavour == "continuous"]
            if len(continuous_dims) >= 2:
                unique_count = self._get_actual_unique_pair_count(query_desc)
            elif len(continuous_dims) == 1:
                unique_count = self._get_actual_unique_single_count(query_desc)
            else:
                unique_count = None

            if unique_count is None and self._estimator:
                estimate = self._estimator.estimate_size(query_desc)
                unique_count = estimate.unique_pairs or estimate.total_rows

            if unique_count is None:
                self._logger.warning("unique_count is still None after estimation")
                return None

            round_threshold = threshold or self._config.rounding_threshold
            if unique_count > round_threshold:
                dimension_ranges = self._fetch_dimension_ranges(query_desc)
                return DateTimeBinningStrategy(
                    db_type=self._db_type,
                    estimator=self._estimator,
                    target_buckets=self._config.target_buckets,
                    dimension_ranges=dimension_ranges,
                )

            self._logger.info("❌ SKIPPING DATETIME BINNING: %s <= %s", unique_count, round_threshold)
            return None
        except Exception as exc:  # pragma: no cover - defensive path
            self._logger.warning("Binning decision failed: %s", exc, exc_info=True)
            return None

    def plan_for_field(
        self,
        query_desc: QueryDescription,
        field_name: str,
        threshold: int,
    ) -> Optional[OptimizationStrategy]:
        """
        Plan rounding/binning strategy for a specific field.
        
        This is called when frontend provides field-level optimization hints,
        allowing precise control over which fields get optimized.
        
        Args:
            query_desc: Query description
            field_name: Name of the field to optimize
            threshold: Rounding threshold for this field
            
        Returns:
            Optimization strategy for this field, or None
        """
        if not self._config.enable_adaptive_rounding:
            self._logger.info(f"Rounding disabled in config for field {field_name}")
            return None

        if not self._connector:
            self._logger.warning(f"No connector available for field {field_name}")
            return None

        # Find the dimension in query_desc
        target_dim = None
        for dim in query_desc.dimensions:
            if dim.field == field_name:
                target_dim = dim
                break

        if not target_dim:
            self._logger.warning(f"Field {field_name} not found in dimensions")
            return None

        if target_dim.flavour != "continuous":
            self._logger.info(f"Field {field_name} is not continuous, skipping rounding")
            return None

        self._logger.info(
            f"Planning rounding for field {field_name} (threshold: {threshold})"
        )

        try:
            # Check if this is a timeline dimension (needs binning instead of rounding)
            if target_dim.date_mode == "timeline":
                self._logger.info(f"Field {field_name} is a timeline dimension, using binning")
                # For timeline, we need to check cardinality and apply binning
                continuous_dims = [d for d in query_desc.dimensions if d.flavour == "continuous"]
                if len(continuous_dims) >= 2:
                    unique_count = self._get_actual_unique_pair_count(query_desc)
                elif len(continuous_dims) == 1:
                    unique_count = self._get_actual_unique_single_count(query_desc)
                else:
                    unique_count = None

                if unique_count is None and self._estimator:
                    estimate = self._estimator.estimate_size(query_desc)
                    unique_count = estimate.unique_pairs or estimate.total_rows

                if unique_count is not None and unique_count > threshold:
                    dimension_ranges = self._fetch_dimension_ranges(query_desc)
                    return DateTimeBinningStrategy(
                        db_type=self._db_type,
                        estimator=self._estimator,
                        target_buckets=self._config.target_buckets,
                        dimension_ranges=dimension_ranges,
                    )
                else:
                    self._logger.info(
                        f"Field {field_name}: cardinality {unique_count} <= threshold {threshold}"
                    )
                    return None

            # Regular continuous dimension - apply rounding
            # Check cardinality
            continuous_dims = [d for d in query_desc.dimensions if d.flavour == "continuous"]
            if len(continuous_dims) >= 2:
                unique_count = self._get_actual_unique_pair_count(query_desc)
            elif len(continuous_dims) == 1:
                unique_count = self._get_actual_unique_single_count(query_desc)
            else:
                unique_count = None

            if unique_count is None and self._estimator:
                estimate = self._estimator.estimate_size(query_desc)
                unique_count = estimate.unique_pairs or estimate.total_rows

            if unique_count is not None and unique_count > threshold:
                self._logger.info(
                    f"Applying rounding to field {field_name}: {unique_count} > {threshold}"
                )
                dimension_ranges = self._fetch_dimension_ranges(query_desc)
                return AdaptiveRoundingStrategy(
                    db_type=self._db_type,
                    estimator=self._estimator,
                    target_buckets=self._config.target_buckets,
                    dimension_ranges=dimension_ranges,
                )
            else:
                self._logger.info(
                    f"Skipping rounding for field {field_name}: {unique_count} <= {threshold}"
                )
                return None

        except Exception as exc:  # pragma: no cover - defensive path
            self._logger.warning(
                f"Failed to plan rounding for field {field_name}: {exc}",
                exc_info=True,
            )
            return None

    def _get_actual_unique_pair_count(self, query_desc: QueryDescription) -> Optional[int]:
        from pypika import Query, Table
        from pypika.functions import Count

        if not self._connector:
            self._logger.warning("No connector available for actual count")
            return None

        # Get all virtual column names (built-in + user-defined)
        virtual_columns = self._get_virtual_column_names(query_desc)

        # Filter out dimensions that are virtual columns - they don't exist in the real table
        continuous_dims = [
            d for d in query_desc.dimensions 
            if d.flavour == "continuous" and d.field not in virtual_columns
        ]
        
        if len(continuous_dims) < 2:
            # Check if we filtered out virtual columns - if so, log appropriately
            all_continuous = [d for d in query_desc.dimensions if d.flavour == "continuous"]
            if len(all_continuous) >= 2 and len(continuous_dims) < 2:
                self._logger.info(
                    "Skipping pair count estimation: %s of %s continuous dimensions are virtual columns",
                    len(all_continuous) - len(continuous_dims),
                    len(all_continuous),
                )
            else:
                self._logger.warning(
                    "Need at least 2 continuous dimensions for count, got %s",
                    len(continuous_dims),
                )
            return None

        self._logger.info(
            "📊 Getting actual count for %s continuous dimensions...",
            len(continuous_dims),
        )

        if self._db_type == "clickhouse" and query_desc.target_database:
            table = Table(query_desc.target_table, schema=query_desc.target_database)
        else:
            table = Table(query_desc.target_table)

        count_query = Query.from_(table)

        for dim in continuous_dims:
            field_term = getattr(table, dim.field)
            count_query = count_query.select(field_term)

        for filter_obj in query_desc.filters:
            # Skip filters on virtual columns that don't exist in the actual table
            if filter_obj.field in virtual_columns:
                self._logger.debug("Skipping filter on virtual column '%s' for estimation query", filter_obj.field)
                continue
                
            field_term = getattr(table, filter_obj.field)
            
            # Apply datetime extraction if filter has date_part and date_mode
            if filter_obj.date_part and filter_obj.date_mode:
                field_term = DateTimeService.get_datetime_part_expression(
                    field_term, 
                    filter_obj.date_part, 
                    filter_obj.date_mode, 
                    self._db_type
                )
            
            if filter_obj.operator == ">=":
                count_query = count_query.where(field_term >= filter_obj.value)
            elif filter_obj.operator == "<=":
                count_query = count_query.where(field_term <= filter_obj.value)
            elif filter_obj.operator == "=":
                count_query = count_query.where(field_term == filter_obj.value)
            elif filter_obj.operator == "!=":
                count_query = count_query.where(field_term != filter_obj.value)
            elif filter_obj.operator == ">":
                count_query = count_query.where(field_term > filter_obj.value)
            elif filter_obj.operator == "<":
                count_query = count_query.where(field_term < filter_obj.value)
            elif filter_obj.operator == "in":
                count_query = count_query.where(field_term.isin(filter_obj.value))
            elif filter_obj.operator == "not in":
                count_query = count_query.where(field_term.notin(filter_obj.value))

        for dim in continuous_dims:
            field_term = getattr(table, dim.field)
            count_query = count_query.where(field_term.isnotnull())

        for dim in continuous_dims:
            field_term = getattr(table, dim.field)
            count_query = count_query.groupby(field_term)

        subquery_sql = count_query.get_sql(quote_char=self._quote_char)
        sql = f"SELECT COUNT(*) as unique_count FROM ({subquery_sql})"
        self._logger.info("Executing actual count query to determine if rounding needed...")
        self._logger.debug("Count SQL: %s", sql)

        _, rows = self._connector.fetch_data(sql)  # type: ignore[union-attr]

        if not rows:
            self._logger.warning("Count query returned no rows")
            return None

        row = rows[0]
        if isinstance(row, dict):
            count = row.get("unique_count") or row.get("count(*)") or row.get("COUNT(*)")
        elif isinstance(row, (list, tuple)):
            count = row[0]
        else:
            count = row

        if count is None:
            self._logger.warning("Count query returned None. Row: %s", row)
            return None

        self._logger.info("✅ Actual unique pair count: %s", count)
        return int(count)

    def _get_actual_unique_single_count(self, query_desc: QueryDescription) -> Optional[int]:
        from pypika import Query, Table
        from pypika.functions import Count, Function

        if not self._connector:
            self._logger.warning("No connector available for actual single-dimension count")
            return None

        # Get all virtual column names (built-in + user-defined)
        virtual_columns = self._get_virtual_column_names(query_desc)

        # Filter out dimensions that are virtual columns - they don't exist in the real table
        continuous_dims = [
            d for d in query_desc.dimensions 
            if d.flavour == "continuous" and d.field not in virtual_columns
        ]
        
        if len(continuous_dims) != 1:
            # Check if we filtered out virtual columns
            all_continuous = [d for d in query_desc.dimensions if d.flavour == "continuous"]
            if len(all_continuous) == 1 and len(continuous_dims) == 0:
                self._logger.info(
                    "Skipping 1D count estimation: the only continuous dimension '%s' is a virtual column",
                    all_continuous[0].field,
                )
            else:
                self._logger.warning(
                    "Need exactly 1 non-virtual continuous dimension for 1D count, got %s",
                    len(continuous_dims),
                )
            return None

        if self._db_type == "clickhouse" and query_desc.target_database:
            table = Table(query_desc.target_table, schema=query_desc.target_database)
        else:
            table = Table(query_desc.target_table)

        dim = continuous_dims[0]
        field_term = getattr(table, dim.field)

        count_query = Query.from_(table)
        if self._db_type == "clickhouse":
            count_expr = Function("uniq", field_term).as_("unique_count")
        else:
            count_expr = Count(field_term).distinct().as_("unique_count")
        count_query = count_query.select(count_expr)

        for filter_obj in query_desc.filters:
            # Skip filters on virtual columns that don't exist in the actual table
            if filter_obj.field in virtual_columns:
                self._logger.debug("Skipping filter on virtual column '%s' for estimation query", filter_obj.field)
                continue
                
            field_term_f = getattr(table, filter_obj.field)
            
            # Apply datetime extraction if filter has date_part and date_mode
            if filter_obj.date_part and filter_obj.date_mode:
                field_term_f = DateTimeService.get_datetime_part_expression(
                    field_term_f, 
                    filter_obj.date_part, 
                    filter_obj.date_mode, 
                    self._db_type
                )
            
            if filter_obj.operator == ">=":
                count_query = count_query.where(field_term_f >= filter_obj.value)
            elif filter_obj.operator == "<=":
                count_query = count_query.where(field_term_f <= filter_obj.value)
            elif filter_obj.operator == "=":
                count_query = count_query.where(field_term_f == filter_obj.value)
            elif filter_obj.operator == "!=":
                count_query = count_query.where(field_term_f != filter_obj.value)
            elif filter_obj.operator == ">":
                count_query = count_query.where(field_term_f > filter_obj.value)
            elif filter_obj.operator == "<":
                count_query = count_query.where(field_term_f < filter_obj.value)
            elif filter_obj.operator == "in":
                count_query = count_query.where(field_term_f.isin(filter_obj.value))
            elif filter_obj.operator == "not in":
                count_query = count_query.where(field_term_f.notin(filter_obj.value))

        sql = count_query.get_sql(quote_char=self._quote_char)
        self._logger.info("Executing 1D unique count query to decide binning/rounding...")
        self._logger.info("1D Count SQL: %s", sql)

        _, rows = self._connector.fetch_data(sql)  # type: ignore[union-attr]

        if not rows:
            self._logger.warning("1D count query returned no usable data")
            return None

        row = rows[0]
        if isinstance(row, dict):
            # Prefer explicit aliases; fall back to the first non-None value if necessary.
            count = row.get("unique_count") or row.get("count(distinct)")
            if count is None:
                for value in row.values():
                    if value is not None:
                        count = value
                        break
        elif isinstance(row, (list, tuple)):
            count = row[0]
        else:
            count = row

        if count is None:
            self._logger.warning("Count was None after extraction")
            return None

        self._logger.info("✅ 1D unique count result: %s", count)
        return int(count)

    def _fetch_dimension_ranges(self, query_desc: QueryDescription) -> Dict[str, Tuple[float, float]]:
        from pypika import Query, Table
        from pypika.functions import Function, Max, Min

        ranges: Dict[str, Tuple[float, float]] = {}
        
        # Get all virtual column names (built-in + user-defined)
        virtual_columns = self._get_virtual_column_names(query_desc)
        
        # Filter out dimensions that are virtual columns - they don't exist in the real table
        continuous_dims = [
            d for d in query_desc.dimensions 
            if d.flavour == "continuous" and d.field not in virtual_columns
        ]

        if not continuous_dims or not self._connector:
            return ranges

        if self._db_type == "clickhouse" and query_desc.target_database:
            table = Table(query_desc.target_table, schema=query_desc.target_database)
        else:
            table = Table(query_desc.target_table)
        range_query = Query.from_(table)

        for dim in continuous_dims:
            field_term = getattr(table, dim.field)
            if dim.date_mode == "timeline":
                if self._db_type == "clickhouse":
                    ts_func = Function("toUnixTimestamp", field_term)
                elif self._db_type == "duckdb":
                    ts_func = Function("epoch", field_term)
                else:
                    ts_func = field_term
                range_query = range_query.select(
                    Min(ts_func).as_(f"min_{dim.field}"),
                    Max(ts_func).as_(f"max_{dim.field}"),
                )
            else:
                range_query = range_query.select(
                    Min(field_term).as_(f"min_{dim.field}"),
                    Max(field_term).as_(f"max_{dim.field}"),
                )

        for filter_obj in query_desc.filters:
            # Skip filters on virtual columns that don't exist in the actual table
            if filter_obj.field in virtual_columns:
                self._logger.debug("Skipping filter on virtual column '%s' for range query", filter_obj.field)
                continue
                
            field_term_f = getattr(table, filter_obj.field)
            
            # Apply datetime extraction if filter has date_part and date_mode
            if filter_obj.date_part and filter_obj.date_mode:
                field_term_f = DateTimeService.get_datetime_part_expression(
                    field_term_f, 
                    filter_obj.date_part, 
                    filter_obj.date_mode, 
                    self._db_type
                )
            
            if filter_obj.operator == ">=":
                range_query = range_query.where(field_term_f >= filter_obj.value)
            elif filter_obj.operator == "<=":
                range_query = range_query.where(field_term_f <= filter_obj.value)
            elif filter_obj.operator == "=":
                range_query = range_query.where(field_term_f == filter_obj.value)
            elif filter_obj.operator == "!=":
                range_query = range_query.where(field_term_f != filter_obj.value)
            elif filter_obj.operator == ">":
                range_query = range_query.where(field_term_f > filter_obj.value)
            elif filter_obj.operator == "<":
                range_query = range_query.where(field_term_f < filter_obj.value)
            elif filter_obj.operator == "in":
                range_query = range_query.where(field_term_f.isin(filter_obj.value))
            elif filter_obj.operator == "not in":
                range_query = range_query.where(field_term_f.notin(filter_obj.value))

        for dim in continuous_dims:
            field_term = getattr(table, dim.field)
            range_query = range_query.where(field_term.isnotnull())

        sql = range_query.get_sql(quote_char=self._quote_char)
        self._logger.debug("Fetching dimension ranges: %s", sql)

        _, rows = self._connector.fetch_data(sql)  # type: ignore[union-attr]

        if not rows:
            return ranges

        row = rows[0]
        if isinstance(row, dict):
            for dim in continuous_dims:
                min_key = f"min_{dim.field}"
                max_key = f"max_{dim.field}"
                if min_key in row and max_key in row:
                    min_val = row[min_key]
                    max_val = row[max_key]
                    if min_val is not None and max_val is not None:
                        ranges[dim.field] = (float(min_val), float(max_val))
                        self._logger.info(
                            "Range for %s: [%s, %s]",
                            dim.field,
                            min_val,
                            max_val,
                        )
        return ranges
