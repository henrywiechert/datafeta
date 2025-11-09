"""Factory for building optimization strategies based on query context."""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

from backend.connectors.base import BaseConnector
from backend.models.query import OptimizationHints, QueryDescription

from .config import OptimizerConfig
from .estimators.base import ResultSizeEstimator
from .strategies.adaptive_rounding import AdaptiveRoundingStrategy
from .strategies.base import OptimizationStrategy
from .strategies.category_dedup import CategoryDeduplicationStrategy
from .strategies.datetime_binning import DateTimeBinningStrategy
from .strategies.distinct_pairs import DistinctPairStrategy


class StrategyPlanner:
    """Create optimization strategies based on hints and query structure."""

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

    # ------------------------------------------------------------------
    # Public surface
    # ------------------------------------------------------------------
    def create_from_query_structure(self, query_desc: QueryDescription) -> List[OptimizationStrategy]:
        """Default strategy planning when no hints are provided."""
        strategies: List[OptimizationStrategy] = []

        has_measures = bool(query_desc.measures)
        continuous_dims = [d for d in query_desc.dimensions if d.flavour == "continuous"]
        discrete_dims = [d for d in query_desc.dimensions if d.flavour == "discrete"]

        if has_measures:
            # Aggregated query - GROUP BY handles deduplication.
            self._logger.info(
                "Aggregated query with %s measures - no deduplication needed",
                len(query_desc.measures),
            )
        else:
            self._logger.info(
                "Raw data query with %s continuous + %s discrete dims",
                len(continuous_dims),
                len(discrete_dims),
            )

            if len(continuous_dims) >= 2:
                strategies.extend(self._create_multi_continuous_strategies(query_desc))
            elif len(continuous_dims) >= 1 or len(discrete_dims) >= 1:
                strategies.extend(self._create_simple_dedup_strategies(query_desc))

        return strategies

    def create_from_hints(
        self,
        query_desc: QueryDescription,
        hints: OptimizationHints,
    ) -> List[OptimizationStrategy]:
        """Strategy planning when explicit hints are provided."""
        strategies: List[OptimizationStrategy] = []

        if hints.optimization_level == "none":
            self._logger.info("Optimization level set to 'none' - skipping all optimizations")
            return strategies

        if hints.enable_distinct:
            self._logger.info("Hints request DISTINCT optimization")
            if self._config.enable_distinct_pairs:
                strategies.append(DistinctPairStrategy(self._db_type, estimator=self._estimator))
            else:
                self._logger.warning("DISTINCT requested by hints but disabled in config")

        if hints.enable_rounding:
            self._logger.info("Hints request rounding optimization")
            if self._config.enable_adaptive_rounding:
                threshold = hints.rounding_threshold or self._config.rounding_threshold
                continuous_dims = [d for d in query_desc.dimensions if d.flavour == "continuous"]

                if len(continuous_dims) >= 2:
                    strategies.extend(self._create_multi_continuous_strategies(query_desc))
                elif len(continuous_dims) == 1:
                    if not self._connector:
                        self._logger.warning("Adaptive rounding (1D) requested but no connector available")
                    else:
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
                                strategies.append(
                                    AdaptiveRoundingStrategy(
                                        db_type=self._db_type,
                                        estimator=self._estimator,
                                        target_buckets=self._config.target_buckets,
                                        dimension_ranges=dimension_ranges,
                                    )
                                )
                            else:
                                self._logger.info("❌ SKIPPING 1D ROUNDING: below threshold or unknown size")
                        except Exception as exc:  # pragma: no cover - defensive path
                            self._logger.warning("1D rounding decision failed: %s", exc, exc_info=True)
            else:
                self._logger.warning("Rounding requested by hints but disabled in config")

        if hints.enable_sampling:
            self._logger.info("Sampling requested but not yet implemented")

        if hints.enable_binning:
            self._logger.info("Binning requested via hints")
            if self._config.enable_adaptive_rounding:
                timeline_dims = [d for d in query_desc.dimensions if d.date_mode == "timeline"]
                self._logger.info("Timeline dimensions found: %s", len(timeline_dims))
                if timeline_dims:
                    try:
                        continuous_dims = [d for d in query_desc.dimensions if d.flavour == "continuous"]
                        self._logger.info("Continuous dimensions count: %s", len(continuous_dims))

                        if len(continuous_dims) >= 2:
                            self._logger.info("Calling _get_actual_unique_pair_count for 2+ dimensions")
                            unique_count = self._get_actual_unique_pair_count(query_desc)
                        elif len(continuous_dims) == 1:
                            self._logger.info("Calling _get_actual_unique_single_count for 1 dimension")
                            unique_count = self._get_actual_unique_single_count(query_desc)
                            self._logger.info("_get_actual_unique_single_count returned: %s", unique_count)
                        else:
                            self._logger.info("No continuous dimensions, unique_count = None")
                            unique_count = None

                        if unique_count is None and self._estimator:
                            self._logger.info("unique_count is None, using estimator fallback")
                            estimate = self._estimator.estimate_size(query_desc)
                            unique_count = estimate.unique_pairs or estimate.total_rows
                            self._logger.info("Estimator fallback returned: %s", unique_count)

                        if unique_count is not None:
                            threshold = self._config.rounding_threshold
                            self._logger.info("Comparing %s vs threshold %s", unique_count, threshold)
                            if unique_count > threshold:
                                self._logger.info("✅ APPLYING DATETIME BINNING: %s > %s", unique_count, threshold)
                                dimension_ranges = self._fetch_dimension_ranges(query_desc)
                                strategies.append(
                                    DateTimeBinningStrategy(
                                        db_type=self._db_type,
                                        estimator=self._estimator,
                                        target_buckets=self._config.target_buckets,
                                        dimension_ranges=dimension_ranges,
                                    )
                                )
                            else:
                                self._logger.info("❌ SKIPPING DATETIME BINNING: %s <= %s", unique_count, threshold)
                        else:
                            self._logger.warning("unique_count is still None after estimation")
                    except Exception as exc:  # pragma: no cover - defensive path
                        self._logger.warning("Binning decision failed: %s", exc, exc_info=True)
                else:
                    self._logger.info("No timeline dimensions found, skipping binning")
            else:
                self._logger.warning("Binning requested by hints but adaptive rounding disabled in config")

        return strategies

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _create_simple_dedup_strategies(self, query_desc: QueryDescription) -> List[OptimizationStrategy]:
        strategies: List[OptimizationStrategy] = []

        if self._config.enable_distinct_pairs:
            strategies.append(DistinctPairStrategy(self._db_type, estimator=self._estimator))
            self._logger.debug("Added DISTINCT strategy for deduplication")

        return strategies

    def _create_multi_continuous_strategies(self, query_desc: QueryDescription) -> List[OptimizationStrategy]:
        strategies: List[OptimizationStrategy] = []

        if self._config.enable_distinct_pairs:
            timeline_dims = [d for d in query_desc.dimensions if d.date_mode == "timeline"]
            if not timeline_dims:
                strategies.append(DistinctPairStrategy(self._db_type, estimator=self._estimator))

        timeline_dims = [d for d in query_desc.dimensions if d.date_mode == "timeline"]
        has_timeline = bool(timeline_dims)

        if self._config.enable_adaptive_rounding:
            if not self._connector:
                self._logger.warning("Adaptive rounding enabled but no connector available")
            else:
                try:
                    unique_count = self._get_actual_unique_pair_count(query_desc)
                    if unique_count is None and self._estimator:
                        estimate = self._estimator.estimate_size(query_desc)
                        unique_count = estimate.unique_pairs or estimate.total_rows

                    if unique_count is not None:
                        will_use_category_dedup = CategoryDeduplicationStrategy(
                            self._db_type,
                            estimator=self._estimator,
                        ).can_apply(query_desc)
                        threshold = self._config.rounding_threshold
                        if will_use_category_dedup:
                            threshold = threshold // 2

                        if unique_count > threshold:
                            dimension_ranges = self._fetch_dimension_ranges(query_desc)

                            if has_timeline:
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

        category_strategy = CategoryDeduplicationStrategy(
            self._db_type,
            estimator=self._estimator,
        )
        if category_strategy.can_apply(query_desc):
            strategies.append(category_strategy)

        return strategies

    def _get_actual_unique_pair_count(self, query_desc: QueryDescription) -> Optional[int]:
        from pypika import Query, Table
        from pypika.functions import Count

        if not self._connector:
            self._logger.warning("No connector available for actual count")
            return None

        continuous_dims = [d for d in query_desc.dimensions if d.flavour == "continuous"]
        if len(continuous_dims) < 2:
            self._logger.warning(
                "Need at least 2 continuous dimensions for count, got %s",
                len(continuous_dims),
            )
            return None

        self._logger.info(
            "📊 Getting actual count for %s continuous dimensions...",
            len(continuous_dims),
        )

        try:
            if self._db_type == "clickhouse" and query_desc.target_database:
                table = Table(query_desc.target_table, schema=query_desc.target_database)
            else:
                table = Table(query_desc.target_table)

            count_query = Query.from_(table)

            for dim in continuous_dims:
                field_term = getattr(table, dim.field)
                count_query = count_query.select(field_term)

            for filter_obj in query_desc.filters:
                field_term = getattr(table, filter_obj.field)
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

            subquery_sql = count_query.get_sql(quote_char="`")
            sql = f"SELECT COUNT(*) as unique_count FROM ({subquery_sql})"
            self._logger.info("Executing actual count query to determine if rounding needed...")
            self._logger.debug("Count SQL: %s", sql)

            _, rows = self._connector.fetch_data(sql)  # type: ignore[union-attr]

            if rows:
                row = rows[0]
                if isinstance(row, dict):
                    count = row.get("unique_count") or row.get("count(*)") or row.get("COUNT(*)")
                elif isinstance(row, (list, tuple)):
                    count = row[0]
                else:
                    count = row

                if count is not None:
                    self._logger.info("✅ Actual unique pair count: %s", count)
                    return int(count)
                self._logger.warning("Count query returned None. Row: %s", row)
                return None

            self._logger.warning("Count query returned no rows")
            return None
        except Exception as exc:  # pragma: no cover - defensive path
            self._logger.error("Failed to get actual count: %s", exc, exc_info=True)
            return None

    def _get_actual_unique_single_count(self, query_desc: QueryDescription) -> Optional[int]:
        from pypika import Query, Table
        from pypika.functions import Count, Function

        if not self._connector:
            self._logger.warning("No connector available for actual single-dimension count")
            return None

        continuous_dims = [d for d in query_desc.dimensions if d.flavour == "continuous"]
        if len(continuous_dims) != 1:
            self._logger.warning(
                "Need exactly 1 continuous dimension for 1D count, got %s",
                len(continuous_dims),
            )
            return None

        try:
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
                field_term_f = getattr(table, filter_obj.field)
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

            sql = count_query.get_sql(quote_char="`")
            self._logger.info("Executing 1D unique count query to decide binning/rounding...")
            self._logger.info("1D Count SQL: %s", sql)

            _, rows = self._connector.fetch_data(sql)  # type: ignore[union-attr]

            self._logger.info(
                "1D count query returned %s rows",
                len(rows) if rows else 0,
            )

            if rows:
                row = rows[0]
                self._logger.info("1D count first row: %s, type: %s", row, type(row))

                if isinstance(row, dict):
                    count = (
                        row.get("unique_count")
                        or row.get("count(distinct)")
                        or row.get("COUNT(DISTINCT `unix_timestamp`)")
                    )
                    self._logger.info("Extracted count from dict: %s", count)
                elif isinstance(row, (list, tuple)):
                    count = row[0]
                    self._logger.info("Extracted count from list/tuple: %s", count)
                else:
                    count = row
                    self._logger.info("Using row directly as count: %s", count)

                if count is not None:
                    self._logger.info("✅ 1D unique count result: %s", count)
                    return int(count)

                self._logger.warning("Count was None after extraction")

            self._logger.warning("1D count query returned no usable data")
            return None
        except Exception as exc:  # pragma: no cover - defensive path
            self._logger.error("Failed to get 1D unique count: %s", exc, exc_info=True)
            return None

    def _fetch_dimension_ranges(self, query_desc: QueryDescription) -> Dict[str, Tuple[float, float]]:
        from pypika import Query, Table
        from pypika.functions import Function, Max, Min

        ranges: Dict[str, Tuple[float, float]] = {}
        continuous_dims = [d for d in query_desc.dimensions if d.flavour == "continuous"]

        if not continuous_dims or not self._connector:
            return ranges

        try:
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
                field_term_f = getattr(table, filter_obj.field)
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

            sql = range_query.get_sql(quote_char="`")
            self._logger.debug("Fetching dimension ranges: %s", sql)

            _, rows = self._connector.fetch_data(sql)  # type: ignore[union-attr]

            if rows:
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
        except Exception as exc:  # pragma: no cover - defensive path
            self._logger.warning("Failed to fetch dimension ranges: %s", exc, exc_info=True)

        return ranges
