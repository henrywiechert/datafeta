# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Statistical profile of a single column ("Quick View").

Profiles describe the *raw* column -- active filters are deliberately not
applied, so a profile stays valid while the user edits filters and can be cached
aggressively on the client.

At most two queries run per profile: one scalar pass for the counts and summary
statistics, and one grouped pass for the most frequent values. The top-values
pass fetches one row more than requested, which doubles as an exactness check:
if fewer rows come back than the limit, every distinct value was enumerated and
the distinct count is known exactly regardless of the approximate setting.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional, Tuple

from backend.connectors.base import BaseConnector
from backend.dialects import get_dialect
from backend.exceptions import QueryExecutionError
from backend.models.data_source import ConnectionDetails
from backend.models.query import (
    DatetimeBucket,
    DatetimeProfile,
    FieldProfileRequest,
    FieldProfileResponse,
    HistogramBin,
    NumericProfile,
    StringProfile,
    TopValue,
)
from backend.services.query_components.column_source_resolver import (
    build_column_expression,
    resolve_column_source,
)
from backend.services.query_components.finite_guard_sql import finite_predicate_sql
from backend.services.query_components.schema_type_provider import SchemaTypeProvider
from backend.services.validation_service import ValidationService

logger = logging.getLogger(__name__)

# Aliases for the scalar pass. Kept short and prefixed so they cannot collide
# with a real column name that the engine echoes back instead of the alias.
_ROW_COUNT = '_qv_rows'
_NULL_COUNT = '_qv_nulls'
_DISTINCT_COUNT = '_qv_distinct'
_MIN = '_qv_min'
_MAX = '_qv_max'
_MEAN = '_qv_mean'
_STDDEV = '_qv_stddev'
_Q1 = '_qv_q1'
_MEDIAN = '_qv_median'
_Q3 = '_qv_q3'
_FINITE_COUNT = '_qv_finite'
_MIN_LEN = '_qv_minlen'
_MAX_LEN = '_qv_maxlen'
_EMPTY_COUNT = '_qv_empty'
_TOP_VALUE = '_qv_value'
_TOP_COUNT = '_qv_count'
_BIN = '_qv_bin'
_SPAN_SECONDS = '_qv_span'
# The profiled column is projected under this alias by an inner subquery, so the
# statistics always aggregate a plain identifier. That also sidesteps ClickHouse
# VIEWs built with `SELECT a.*`, where referencing the column directly fails.
_EXPR = '_qv_expr'

# Time bucket granularity by span, coarsening so a sparkline stays readable
# (roughly 24-90 buckets) for anything from a day of logs to decades of sales.
_HOUR = 3600
_DAY = 24 * _HOUR
_BUCKET_THRESHOLDS = (
    (4 * _DAY, 'hour'),
    (120 * _DAY, 'day'),
    (2200 * _DAY, 'month'),
)
_MAX_TIME_BUCKETS = 120


class FieldProfileService:
    """Builds and runs the Quick View profile queries for one column."""

    def __init__(self, connector: BaseConnector, conn_details: ConnectionDetails):
        self.connector = connector
        self.conn_details = conn_details
        self._type_provider = SchemaTypeProvider(connector)
        connector_dialect = getattr(connector, "sql_dialect", None) if connector else None
        if connector_dialect and isinstance(getattr(connector_dialect, "quote_char", None), str):
            self._dialect = connector_dialect
        else:
            self._dialect = get_dialect(conn_details.type)

    def profile(self, request: FieldProfileRequest) -> FieldProfileResponse:
        ValidationService.require_database_for_clickhouse(
            request.database, self.conn_details, "profiling a field"
        )

        started = time.perf_counter()

        expr_sql, from_sql = self._resolve_expression(request)
        scalar_sql = self._build_scalar_sql(request, expr_sql, from_sql)
        scalar_row = self._fetch_one(scalar_sql)

        top_values: List[TopValue] = []
        exhaustive_top = False
        if request.topN > 0 and request.profileKind != 'numeric':
            top_sql = self._build_top_values_sql(request, expr_sql, from_sql)
            rows = self._fetch_all(top_sql)
            # One extra row was requested; its absence proves the list is complete.
            exhaustive_top = len(rows) <= request.topN
            top_values = [
                TopValue(value=self._get(r, _TOP_VALUE, 0), count=self._as_int(self._get(r, _TOP_COUNT, 1)))
                for r in rows[:request.topN]
            ]

        row_count = self._as_int(self._get(scalar_row, _ROW_COUNT, 0))
        null_count = self._as_int(self._get(scalar_row, _NULL_COUNT, 1))
        distinct_count = self._as_optional_int(self._get(scalar_row, _DISTINCT_COUNT, 2))

        approximate = request.approximate
        if exhaustive_top:
            # The grouped pass enumerated every distinct non-null value, so the
            # estimate can be replaced by the real count.
            distinct_count = len(top_values)
            approximate = False

        response = FieldProfileResponse(
            field=request.field,
            profile_kind=request.profileKind,
            approximate=approximate,
            row_count=row_count,
            null_count=null_count,
            distinct_count=distinct_count,
            duration_ms=int((time.perf_counter() - started) * 1000),
            query_sql=scalar_sql,
        )

        if request.profileKind == 'numeric':
            response.numeric = self._build_numeric_profile(scalar_row, row_count, null_count)
            response.numeric.histogram = self._load_histogram(
                request,
                expr_sql,
                from_sql,
                response.numeric,
                finite_count=self._as_int(self._get(scalar_row, _FINITE_COUNT, 10)),
            )
        elif request.profileKind == 'datetime':
            response.datetime = self._load_datetime_profile(request, scalar_row, expr_sql, from_sql)
            response.string = StringProfile(top_values=top_values)
        else:
            response.string = StringProfile(
                min_length=self._as_optional_int(self._get(scalar_row, _MIN_LEN, 3)),
                max_length=self._as_optional_int(self._get(scalar_row, _MAX_LEN, 4)),
                empty_count=self._as_int(self._get(scalar_row, _EMPTY_COUNT, 5)),
                top_values=top_values,
            )

        return response

    # --- Query construction --- #

    def _resolve_expression(self, request: FieldProfileRequest) -> Tuple[str, str]:
        """Return (aggregated column alias, FROM clause projecting it)."""
        resolved = resolve_column_source(
            field=request.field,
            table=request.table,
            database=request.database,
            dialect=self._dialect,
            db_type=self.conn_details.type,
            type_provider=self._type_provider,
            virtual_columns=request.virtualColumns,
            virtual_table=request.virtualTable,
            source_table=request.sourceTable,
            log_context="Field profile",
        )
        term = build_column_expression(
            resolved,
            dialect=self._dialect,
            database=request.database,
            type_provider=self._type_provider,
            datetime_part=request.dateTimePart,
            datetime_mode=request.dateTimeMode,
        )
        column_sql = term.get_sql(quote_char=self._dialect.quote_char)
        table_ref = self._dialect.table_ref(resolved.resolved_table_name, request.database)
        from_sql = (
            f"FROM (SELECT {self._alias(column_sql, _EXPR)} FROM {table_ref}) AS _qv_sub"
        )
        return self._quote(_EXPR), from_sql

    def _build_scalar_sql(
        self, request: FieldProfileRequest, expr_sql: str, from_sql: str
    ) -> str:
        d = self._dialect
        parts = [
            self._alias(d.count_star_sql(), _ROW_COUNT),
            self._alias(d.count_if_sql(f"{expr_sql} IS NULL"), _NULL_COUNT),
            self._alias(d.distinct_count_sql(expr_sql, approximate=request.approximate), _DISTINCT_COUNT),
        ]

        if request.profileKind == 'numeric':
            parts.extend([
                self._alias(d.aggregate_sql('min', expr_sql, finite_guard=True), _MIN),
                self._alias(d.aggregate_sql('max', expr_sql, finite_guard=True), _MAX),
                self._alias(d.aggregate_sql('avg', expr_sql, finite_guard=True), _MEAN),
                self._alias(d.aggregate_sql('stddev', expr_sql, finite_guard=True), _STDDEV),
                self._alias(d.quantile_sql(expr_sql, 0.25, finite_guard=True), _Q1),
                self._alias(d.quantile_sql(expr_sql, 0.5, finite_guard=True), _MEDIAN),
                self._alias(d.quantile_sql(expr_sql, 0.75, finite_guard=True), _Q3),
                self._alias(d.aggregate_sql('count', expr_sql, finite_guard=True), _FINITE_COUNT),
            ])
        elif request.profileKind == 'datetime':
            # Rendered as text so the wire format is unambiguous regardless of
            # how the engine types Date vs DateTime.
            parts.extend([
                self._alias(d.to_string_expr(d.aggregate_sql('min', expr_sql)), _MIN),
                self._alias(d.to_string_expr(d.aggregate_sql('max', expr_sql)), _MAX),
                self._alias(
                    f"{d.to_epoch_expr(d.aggregate_sql('max', expr_sql))} - "
                    f"{d.to_epoch_expr(d.aggregate_sql('min', expr_sql))}",
                    _SPAN_SECONDS,
                ),
            ])
        else:
            length_sql = d.string_length_sql(d.to_string_expr(expr_sql))
            parts.extend([
                self._alias(d.aggregate_sql('min', length_sql), _MIN_LEN),
                self._alias(d.aggregate_sql('max', length_sql), _MAX_LEN),
                self._alias(d.count_if_sql(f"{d.to_string_expr(expr_sql)} = ''"), _EMPTY_COUNT),
            ])

        return f"SELECT {', '.join(parts)} {from_sql}"

    def _build_top_values_sql(
        self, request: FieldProfileRequest, expr_sql: str, from_sql: str
    ) -> str:
        d = self._dialect
        value_sql = expr_sql if request.profileKind != 'datetime' else d.to_string_expr(expr_sql)
        return (
            f"SELECT {self._alias(value_sql, _TOP_VALUE)}, "
            f"{self._alias(d.count_star_sql(), _TOP_COUNT)} "
            f"{from_sql} WHERE {expr_sql} IS NOT NULL "
            f"GROUP BY {value_sql} "
            f"ORDER BY {self._quote(_TOP_COUNT)} DESC, {self._quote(_TOP_VALUE)} ASC "
            f"LIMIT {request.topN + 1}"
        )

    def _build_numeric_profile(
        self, row: Any, row_count: int, null_count: int
    ) -> NumericProfile:
        finite_count = self._as_int(self._get(row, _FINITE_COUNT, 10))
        return NumericProfile(
            min=self._as_optional_float(self._get(row, _MIN, 3)),
            max=self._as_optional_float(self._get(row, _MAX, 4)),
            mean=self._as_optional_float(self._get(row, _MEAN, 5)),
            stddev=self._as_optional_float(self._get(row, _STDDEV, 6)),
            q1=self._as_optional_float(self._get(row, _Q1, 7)),
            median=self._as_optional_float(self._get(row, _MEDIAN, 8)),
            q3=self._as_optional_float(self._get(row, _Q3, 9)),
            non_finite_count=max(0, row_count - null_count - finite_count),
        )

    def _load_histogram(
        self,
        request: FieldProfileRequest,
        expr_sql: str,
        from_sql: str,
        numeric: NumericProfile,
        *,
        finite_count: int,
    ) -> List[HistogramBin]:
        """Equal-width bin counts over the finite values, min..max."""
        bins = request.histogramBins
        low, high = numeric.min, numeric.max
        if bins <= 0 or low is None or high is None:
            return []

        if high == low:
            # A constant column has no range to divide into bins.
            return [HistogramBin(lower=low, upper=high, count=finite_count)]

        width = (high - low) / bins
        bin_expr = (
            f"least(floor(({expr_sql} - {low}) / {width}), {bins - 1})"
        )
        sql = (
            f"SELECT {self._alias(bin_expr, _BIN)}, "
            f"{self._alias(self._dialect.count_star_sql(), _TOP_COUNT)} "
            f"{from_sql} "
            f"WHERE {expr_sql} IS NOT NULL AND {finite_predicate_sql(expr_sql)} "
            f"GROUP BY {bin_expr} ORDER BY {self._quote(_BIN)}"
        )

        counts: Dict[int, int] = {}
        for row in self._fetch_all(sql):
            index = self._as_optional_int(self._get(row, _BIN, 0))
            if index is not None and 0 <= index < bins:
                counts[index] = self._as_int(self._get(row, _TOP_COUNT, 1))

        return [
            HistogramBin(
                lower=low + i * width,
                upper=low + (i + 1) * width,
                count=counts.get(i, 0),
            )
            for i in range(bins)
        ]

    def _load_datetime_profile(
        self,
        request: FieldProfileRequest,
        scalar_row: Any,
        expr_sql: str,
        from_sql: str,
    ) -> DatetimeProfile:
        profile = DatetimeProfile(
            min=self._as_optional_str(self._get(scalar_row, _MIN, 3)),
            max=self._as_optional_str(self._get(scalar_row, _MAX, 4)),
        )
        span_seconds = self._as_optional_float(self._get(scalar_row, _SPAN_SECONDS, 5))
        if request.histogramBins <= 0 or span_seconds is None:
            return profile

        profile.bucket = self._choose_bucket(span_seconds)
        bucket_expr = self._dialect.date_trunc_sql(profile.bucket, expr_sql)
        sql = (
            f"SELECT {self._alias(self._dialect.to_string_expr(bucket_expr), _TOP_VALUE)}, "
            f"{self._alias(self._dialect.count_star_sql(), _TOP_COUNT)} "
            f"{from_sql} "
            f"WHERE {expr_sql} IS NOT NULL "
            f"GROUP BY {bucket_expr} ORDER BY {bucket_expr} "
            f"LIMIT {_MAX_TIME_BUCKETS}"
        )
        profile.buckets = [
            DatetimeBucket(
                start=str(self._get(row, _TOP_VALUE, 0)),
                count=self._as_int(self._get(row, _TOP_COUNT, 1)),
            )
            for row in self._fetch_all(sql)
        ]
        return profile

    @staticmethod
    def _choose_bucket(span_seconds: float) -> str:
        for threshold, unit in _BUCKET_THRESHOLDS:
            if span_seconds <= threshold:
                return unit
        return 'year'

    def _alias(self, expr_sql: str, alias: str) -> str:
        return f"{expr_sql} AS {self._quote(alias)}"

    def _quote(self, identifier: str) -> str:
        q = self._dialect.quote_char
        return f"{q}{identifier}{q}"

    # --- Execution and row access --- #

    def _fetch_all(self, sql: str) -> List[Any]:
        logger.info("Executing field profile query: %s", sql)
        try:
            _columns, rows = self.connector.fetch_data(sql)
            return list(rows or [])
        except QueryExecutionError:
            logger.exception("Field profile query failed: %s", sql)
            raise
        except Exception as e:
            logger.exception("Field profile query failed: %s", sql)
            raise QueryExecutionError(f"Failed to profile field: {e}")

    def _fetch_one(self, sql: str) -> Any:
        rows = self._fetch_all(sql)
        return rows[0] if rows else {}

    @staticmethod
    def _get(row: Any, alias: str, position: int) -> Any:
        """Read one value by alias, falling back to position.

        ClickHouse sometimes echoes the aggregate expression as the column name
        instead of the alias, so positional access is the reliable fallback.
        """
        if isinstance(row, dict):
            if alias in row:
                return row[alias]
            values = list(row.values())
            return values[position] if position < len(values) else None
        if isinstance(row, (list, tuple)):
            return row[position] if position < len(row) else None
        return None

    @staticmethod
    def _as_int(value: Any) -> int:
        try:
            return int(value) if value is not None else 0
        except (TypeError, ValueError):
            return 0

    @staticmethod
    def _as_optional_int(value: Any) -> Optional[int]:
        try:
            return int(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _as_optional_float(value: Any) -> Optional[float]:
        if value is None:
            return None
        try:
            result = float(value)
        except (TypeError, ValueError):
            return None
        # NaN/Inf are not valid JSON; the guards should exclude them already.
        return result if result == result and abs(result) != float('inf') else None

    @staticmethod
    def _as_optional_str(value: Any) -> Optional[str]:
        return None if value is None else str(value)
