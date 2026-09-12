# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for FieldProfileService (Quick View)."""

import pytest
from unittest.mock import Mock

from backend.exceptions import InvalidInputError
from backend.models.data_source import (
    Column,
    ConnectionDetails,
    TableJoinDefinition,
    VirtualColumnDefinition,
    VirtualTableDefinition,
)
from backend.models.query import FieldProfileRequest
from backend.services.field_profile_service import FieldProfileService


CLICKHOUSE = ConnectionDetails(type="clickhouse", host="localhost")
CSV = ConnectionDetails(type="csv", file_path="/tmp/test.csv")


def _request(**overrides) -> FieldProfileRequest:
    base = {
        "field": "price",
        "table": "products",
        "profileKind": "numeric",
    }
    base.update(overrides)
    return FieldProfileRequest(**base)


def _service(conn_details, rows=None, columns=None):
    connector = Mock()
    connector.sql_dialect = None
    connector.fetch_data.side_effect = rows if rows else [(["c"], [[0] * 12])]
    connector.list_columns.return_value = [
        Column(name=name, data_type=data_type)
        for name, data_type in (columns or {}).items()
    ]
    return FieldProfileService(connector, conn_details), connector


def _sql_calls(connector):
    return [call.args[0] for call in connector.fetch_data.call_args_list]


class TestValidation:
    def test_clickhouse_requires_database(self):
        service, _ = _service(CLICKHOUSE)
        with pytest.raises(InvalidInputError):
            service.profile(_request(database=None))


class TestDuckDbSql:
    def test_numeric_scalar_statistics(self):
        service, connector = _service(CSV, rows=[(["c"], [[100, 4, 30, 1.0, 9.0, 5.0, 2.0, 2.5, 5.0, 7.5, 90]])])
        service.profile(_request(histogramBins=0))

        sql = _sql_calls(connector)[0]
        assert 'COUNT(*) AS "_qv_rows"' in sql
        assert 'COUNT(*) FILTER (WHERE "_qv_expr" IS NULL) AS "_qv_nulls"' in sql
        assert 'MIN("_qv_expr") FILTER (WHERE isFinite("_qv_expr")) AS "_qv_min"' in sql
        assert 'MAX("_qv_expr") FILTER (WHERE isFinite("_qv_expr")) AS "_qv_max"' in sql
        assert 'AVG("_qv_expr") FILTER (WHERE isFinite("_qv_expr")) AS "_qv_mean"' in sql
        assert 'stddev_pop("_qv_expr") FILTER (WHERE isFinite("_qv_expr")) AS "_qv_stddev"' in sql
        assert 'quantile_cont("_qv_expr", 0.25) FILTER (WHERE isFinite("_qv_expr")) AS "_qv_q1"' in sql
        assert 'quantile_cont("_qv_expr", 0.5) FILTER (WHERE isFinite("_qv_expr")) AS "_qv_median"' in sql
        assert 'quantile_cont("_qv_expr", 0.75) FILTER (WHERE isFinite("_qv_expr")) AS "_qv_q3"' in sql

    def test_column_projected_through_subquery(self):
        service, connector = _service(CSV, rows=[(["c"], [[0] * 12])])
        service.profile(_request())

        sql = _sql_calls(connector)[0]
        assert 'FROM (SELECT "price" AS "_qv_expr" FROM "products") AS _qv_sub' in sql

    def test_approximate_distinct_uses_hyperloglog(self):
        service, connector = _service(CSV, rows=[(["c"], [[0] * 12])])
        service.profile(_request(approximate=True))
        assert 'approx_count_distinct("_qv_expr") AS "_qv_distinct"' in _sql_calls(connector)[0]

    def test_exact_distinct_when_requested(self):
        service, connector = _service(CSV, rows=[(["c"], [[0] * 12])])
        service.profile(_request(approximate=False))
        assert 'COUNT(DISTINCT "_qv_expr") AS "_qv_distinct"' in _sql_calls(connector)[0]

    def test_string_profile_uses_length_and_top_values(self):
        service, connector = _service(CSV, rows=[
            (["c"], [[100, 0, 3, 2, 8, 1]]),
            (["c"], [["a", 50], ["b", 30], ["c", 20]]),
        ])
        service.profile(_request(field="name", profileKind="string", topN=5))

        scalar_sql, top_sql = _sql_calls(connector)
        assert 'MIN(length(CAST("_qv_expr" AS VARCHAR))) AS "_qv_minlen"' in scalar_sql
        assert 'MAX(length(CAST("_qv_expr" AS VARCHAR))) AS "_qv_maxlen"' in scalar_sql
        assert 'FILTER (WHERE CAST("_qv_expr" AS VARCHAR) = \'\') AS "_qv_empty"' in scalar_sql
        assert 'WHERE "_qv_expr" IS NOT NULL' in top_sql
        assert 'GROUP BY "_qv_expr"' in top_sql
        # One row beyond topN, so a short result proves the list is complete.
        assert 'LIMIT 6' in top_sql

    def test_numeric_profile_skips_top_values_pass(self):
        service, connector = _service(CSV, rows=[(["c"], [[0] * 12])])
        service.profile(_request(profileKind="numeric", topN=5))
        assert len(_sql_calls(connector)) == 1

    def test_datetime_min_max_rendered_as_text(self):
        service, connector = _service(CSV, rows=[
            (["c"], [[10, 0, 7, "2024-01-01", "2024-03-01"]]),
            (["c"], [["2024-01-01", 3]]),
        ])
        service.profile(_request(field="created_at", profileKind="datetime"))

        scalar_sql = _sql_calls(connector)[0]
        assert 'CAST(MIN("_qv_expr") AS VARCHAR) AS "_qv_min"' in scalar_sql
        assert 'CAST(MAX("_qv_expr") AS VARCHAR) AS "_qv_max"' in scalar_sql


class TestClickHouseSql:
    def test_numeric_scalar_statistics(self):
        service, connector = _service(CLICKHOUSE, rows=[(["c"], [[0] * 12])])
        service.profile(_request(database="shop"))

        sql = _sql_calls(connector)[0]
        assert 'count() AS `_qv_rows`' in sql
        assert 'countIf(`_qv_expr` IS NULL) AS `_qv_nulls`' in sql
        assert 'uniq(`_qv_expr`) AS `_qv_distinct`' in sql
        assert 'minIf(`_qv_expr`, isFinite(`_qv_expr`)) AS `_qv_min`' in sql
        assert 'stddevPopIf(`_qv_expr`, isFinite(`_qv_expr`)) AS `_qv_stddev`' in sql
        assert 'quantileExactInclusiveIf(0.5)(`_qv_expr`, isFinite(`_qv_expr`)) AS `_qv_median`' in sql
        assert 'FROM (SELECT `price` AS `_qv_expr` FROM `shop`.`products`) AS _qv_sub' in sql

    def test_exact_distinct_uses_uniq_exact(self):
        service, connector = _service(CLICKHOUSE, rows=[(["c"], [[0] * 12])])
        service.profile(_request(database="shop", approximate=False))
        assert 'uniqExact(`_qv_expr`) AS `_qv_distinct`' in _sql_calls(connector)[0]

    def test_string_length_counts_characters(self):
        service, connector = _service(CLICKHOUSE, rows=[
            (["c"], [[0] * 6]),
            (["c"], []),
        ])
        service.profile(_request(field="name", database="shop", profileKind="string"))
        assert 'lengthUTF8(toString(`_qv_expr`))' in _sql_calls(connector)[0]


class TestColumnResolution:
    def test_dotted_column_name_is_not_split_without_matching_table(self):
        """ClickHouse column names may contain dots; the prefix is not a table here."""
        service, connector = _service(CLICKHOUSE, rows=[(["c"], [[0] * 12])])
        service.profile(_request(field="stats.price", database="shop"))
        assert 'SELECT `stats.price` AS `_qv_expr` FROM `shop`.`products`' in _sql_calls(connector)[0]

    def test_joined_field_profiles_its_own_source_table(self):
        """A JOIN would drop unmatched values, so the owning table is read directly."""
        virtual_table = VirtualTableDefinition(
            primary_table="orders",
            joined_tables=[
                TableJoinDefinition(
                    table_name="customers",
                    join_type="INNER",
                    on_conditions=["orders.customer_id = customers.id"],
                )
            ],
        )
        service, connector = _service(CLICKHOUSE, rows=[
            (["c"], [[0] * 6]),
            (["c"], []),
        ])
        service.profile(_request(
            field="customers.city",
            table="orders",
            database="shop",
            sourceTable="customers",
            virtualTable=virtual_table,
            profileKind="string",
        ))
        sql = _sql_calls(connector)[0]
        assert 'SELECT `city` AS `_qv_expr` FROM `shop`.`customers`' in sql

    def test_virtual_column_expression_is_profiled(self):
        # Without column types a quoted identifier is indistinguishable from a
        # string literal, so the schema must reach the virtual column builder.
        service, connector = _service(
            CSV,
            rows=[(["c"], [[0] * 12])],
            columns={"price": "DOUBLE", "quantity": "BIGINT"},
        )
        service.profile(_request(
            field="total",
            profileKind="numeric",
            virtualColumns=[VirtualColumnDefinition(
                name="total",
                expression='"price" * "quantity"',
                output_type="DOUBLE",
            )],
        ))
        sql = _sql_calls(connector)[0]
        assert '"price"' in sql and '"quantity"' in sql
        assert 'AS "_qv_expr"' in sql

    def test_datetime_part_extraction_applied(self):
        service, connector = _service(CSV, rows=[
            (["c"], [[0] * 6]),
            (["c"], []),
        ])
        service.profile(_request(
            field="created_at",
            profileKind="string",
            dateTimePart="year",
            dateTimeMode="distinct",
        ))
        assert '"created_at"' in _sql_calls(connector)[0]


class TestResponseMapping:
    def test_non_finite_rows_reported(self):
        # 100 rows, 4 null, 90 finite -> 6 NaN/Inf rows excluded from the stats.
        service, _ = _service(CSV, rows=[
            (["c"], [[100, 4, 30, 1.0, 9.0, 5.0, 2.0, 2.5, 5.0, 7.5, 90]]),
        ])
        result = service.profile(_request(histogramBins=0))

        assert result.row_count == 100
        assert result.null_count == 4
        assert result.numeric.non_finite_count == 6
        assert result.numeric.median == 5.0
        assert result.numeric.q1 == 2.5
        assert result.numeric.q3 == 7.5

    def test_short_top_values_list_yields_exact_distinct_count(self):
        service, _ = _service(CSV, rows=[
            (["c"], [[100, 0, 97, 1, 4, 0]]),
            (["c"], [["a", 60], ["b", 40]]),
        ])
        result = service.profile(_request(field="name", profileKind="string", topN=5))

        # The grouped pass enumerated every value, so the HLL estimate is discarded.
        assert result.distinct_count == 2
        assert result.approximate is False

    def test_full_top_values_list_keeps_approximate_estimate(self):
        service, _ = _service(CSV, rows=[
            (["c"], [[100, 0, 97, 1, 4, 0]]),
            (["c"], [["a", 30], ["b", 25], ["c", 20]]),
        ])
        result = service.profile(_request(field="name", profileKind="string", topN=2))

        assert result.distinct_count == 97
        assert result.approximate is True
        assert len(result.string.top_values) == 2

    def test_values_read_by_alias_from_dict_rows(self):
        service, _ = _service(CSV, rows=[
            (["c"], [{"_qv_rows": 10, "_qv_nulls": 2, "_qv_distinct": 5,
                      "_qv_min": 1.0, "_qv_max": 9.0, "_qv_mean": 5.0,
                      "_qv_stddev": 2.0, "_qv_q1": 3.0, "_qv_median": 5.0,
                      "_qv_q3": 7.0, "_qv_finite": 8}]),
        ])
        result = service.profile(_request(histogramBins=0))

        assert result.row_count == 10
        assert result.null_count == 2
        assert result.distinct_count == 5
        assert result.numeric.min == 1.0
        assert result.numeric.non_finite_count == 0

    def test_empty_result_does_not_raise(self):
        service, _ = _service(CSV, rows=[(["c"], [])])
        result = service.profile(_request())

        assert result.row_count == 0
        assert result.numeric.min is None

class TestHistogram:
    def _numeric_rows(self, low, high, bin_rows):
        return [
            (["c"], [[100, 0, 30, low, high, 5.0, 2.0, 2.5, 5.0, 7.5, 100]]),
            (["c"], bin_rows),
        ]

    def test_equal_width_bins_cover_the_full_range(self):
        service, connector = _service(
            CSV, rows=self._numeric_rows(0.0, 10.0, [[0, 40], [1, 35], [3, 25]])
        )
        result = service.profile(_request(histogramBins=4))

        bins = result.numeric.histogram
        assert [b.lower for b in bins] == [0.0, 2.5, 5.0, 7.5]
        assert [b.upper for b in bins] == [2.5, 5.0, 7.5, 10.0]
        # Bin 2 got no rows back and must still be present, so the chart has no gap.
        assert [b.count for b in bins] == [40, 35, 0, 25]

        hist_sql = _sql_calls(connector)[1]
        assert 'least(floor(("_qv_expr" - 0.0) / 2.5), 3)' in hist_sql
        assert 'WHERE "_qv_expr" IS NOT NULL AND isFinite("_qv_expr")' in hist_sql

    def test_constant_column_yields_single_bin_without_extra_query(self):
        service, connector = _service(CSV, rows=[
            (["c"], [[10, 0, 1, 5.0, 5.0, 5.0, 0.0, 5.0, 5.0, 5.0, 10]]),
        ])
        result = service.profile(_request(histogramBins=8))

        assert len(_sql_calls(connector)) == 1
        assert result.numeric.histogram == [
            type(result.numeric.histogram[0])(lower=5.0, upper=5.0, count=10)
        ]

    def test_histogram_disabled_skips_the_pass(self):
        service, connector = _service(CSV, rows=[
            (["c"], [[100, 0, 30, 0.0, 10.0, 5.0, 2.0, 2.5, 5.0, 7.5, 100]]),
        ])
        result = service.profile(_request(histogramBins=0))

        assert len(_sql_calls(connector)) == 1
        assert result.numeric.histogram == []

    def test_all_null_column_skips_the_pass(self):
        service, connector = _service(CSV, rows=[
            (["c"], [[50, 50, 0, None, None, None, None, None, None, None, 0]]),
        ])
        result = service.profile(_request())

        assert len(_sql_calls(connector)) == 1
        assert result.numeric.histogram == []


class TestDatetimeBuckets:
    def _datetime_rows(self, span_seconds, buckets):
        return [
            (["c"], [[100, 0, 40, "2024-01-01", "2024-03-01", span_seconds]]),
            (["c"], []),
            (["c"], buckets),
        ]

    @pytest.mark.parametrize("span_days,expected", [
        (1, "hour"),
        (30, "day"),
        (400, "month"),
        (4000, "year"),
    ])
    def test_granularity_coarsens_with_span(self, span_days, expected):
        service, connector = _service(
            CSV, rows=self._datetime_rows(span_days * 86400, [["2024-01-01", 5]])
        )
        result = service.profile(_request(field="created_at", profileKind="datetime"))

        assert result.datetime.bucket == expected
        assert f"date_trunc('{expected}', \"_qv_expr\")" in _sql_calls(connector)[2]

    def test_buckets_returned_in_order(self):
        service, _ = _service(CSV, rows=self._datetime_rows(
            60 * 86400, [["2024-01-01", 10], ["2024-01-02", 25], ["2024-01-03", 7]]
        ))
        result = service.profile(_request(field="created_at", profileKind="datetime"))

        assert [b.start for b in result.datetime.buckets] == ["2024-01-01", "2024-01-02", "2024-01-03"]
        assert [b.count for b in result.datetime.buckets] == [10, 25, 7]

    def test_missing_span_skips_the_bucket_pass(self):
        service, connector = _service(CSV, rows=[
            (["c"], [[0, 0, 0, None, None, None]]),
            (["c"], []),
        ])
        result = service.profile(_request(field="created_at", profileKind="datetime"))

        assert len(_sql_calls(connector)) == 2
        assert result.datetime.buckets == []