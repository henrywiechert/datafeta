# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for DateTimeService."""

from pypika import Table

from backend.services.datetime_service import DateTimeService


class TestDateTimeService:
    def test_clickhouse_timeline_normalizes_to_utc(self):
        """ClickHouse timeline parts should apply UTC normalization before truncation."""
        t = Table("events")
        expr = DateTimeService.get_datetime_part_expression(
            t.ts, "hour", "timeline", "clickhouse"
        )
        sql = expr.get_sql(quote_char='"')

        assert "toStartOfHour" in sql
        assert "toTimeZone" in sql
        assert "UTC" in sql

    def test_clickhouse_timeline_year_month_return_datetime64(self):
        """Regression: toStartOfYear/toStartOfMonth return the ClickHouse Date type,
        which Arrow serializes as UInt16 days-since-epoch. The frontend misreads
        those small integers as epoch seconds, collapsing timeline axes to 1970.
        Both parts must therefore be wrapped to DateTime64 UTC.
        toMonday (week) has the same Date return type and needs the same wrap."""
        t = Table("events")
        for part, func in (
            ("year", "toStartOfYear"),
            ("month", "toStartOfMonth"),
            ("week", "toMonday"),
        ):
            expr = DateTimeService.get_datetime_part_expression(
                t.ts, part, "timeline", "clickhouse"
            )
            sql = expr.get_sql(quote_char="`")
            assert sql == f"toDateTime64({func}(toTimeZone(`ts`,'UTC')),0,'UTC')"

    def test_clickhouse_timeline_datetime_parts_not_double_wrapped(self):
        """Parts that already return DateTime/DateTime64 must not get the wrapper."""
        t = Table("events")
        for part in ("day", "hour", "minute", "millisecond"):
            expr = DateTimeService.get_datetime_part_expression(
                t.ts, part, "timeline", "clickhouse"
            )
            sql = expr.get_sql(quote_char="`")
            assert "toDateTime64(" not in sql, f"unexpected wrap for part '{part}': {sql}"

    def test_clickhouse_distinct_week_uses_to_iso_week(self):
        """ClickHouse week distinct should use toISOWeek (Monday-based 1–53)."""
        t = Table("events")
        expr = DateTimeService.get_datetime_part_expression(
            t.ts, "week", "distinct", "clickhouse"
        )
        sql = expr.get_sql(quote_char='"')
        assert "toISOWeek" in sql
        assert "toTimeZone" in sql
        assert "UTC" in sql

    def test_duckdb_distinct_week_uses_extract_week(self):
        """SQL week distinct should use EXTRACT(WEEK) without DOW remapping."""
        t = Table("events")
        expr = DateTimeService.get_datetime_part_expression(
            t.ts, "week", "distinct", "duckdb"
        )
        sql = expr.get_sql(quote_char='"')
        assert "EXTRACT(WEEK" in sql
        assert "DOW" not in sql
        assert "timezone" in sql
        assert "UTC" in sql

    def test_duckdb_timeline_week_uses_date_trunc(self):
        """SQL week timeline should use date_trunc('week', …)."""
        t = Table("events")
        expr = DateTimeService.get_datetime_part_expression(
            t.ts, "week", "timeline", "duckdb"
        )
        sql = expr.get_sql(quote_char='"')
        assert "date_trunc" in sql
        assert "week" in sql
        assert "timezone" in sql
        assert "UTC" in sql

    def test_duckdb_distinct_weekday_is_iso_1_7(self):
        """SQL weekday distinct should be normalized to ISO weekday (Mon=1..Sun=7)."""
        t = Table("events")
        expr = DateTimeService.get_datetime_part_expression(
            t.ts, "weekday", "distinct", "duckdb"
        )
        sql = expr.get_sql(quote_char='"')

        assert "EXTRACT(DOW" in sql
        # DuckDB UTC wrapper (best-effort)
        assert "timezone" in sql
        assert "UTC" in sql
        # ISO conversion: ((dow + 6) % 7) + 1 - PyPika renders modulo as MOD(...)
        assert "+6" in sql or "+ 6" in sql
        assert "MOD(" in sql and ",7)" in sql
        assert "+1" in sql or "+ 1" in sql

    def test_duckdb_timeline_uses_date_trunc_with_utc(self):
        """SQL timeline parts should use date_trunc on a UTC-normalized timestamp."""
        t = Table("events")
        expr = DateTimeService.get_datetime_part_expression(
            t.ts, "minute", "timeline", "duckdb"
        )
        sql = expr.get_sql(quote_char='"')

        assert "date_trunc" in sql
        assert "minute" in sql
        assert "timezone" in sql
        assert "UTC" in sql

    def test_duckdb_distinct_millisecond_uses_modulo(self):
        """SQL millisecond distinct should apply % 1000 to get 0-999 range."""
        t = Table("events")
        expr = DateTimeService.get_datetime_part_expression(
            t.ts, "millisecond", "distinct", "duckdb"
        )
        sql = expr.get_sql(quote_char='"')

        assert "EXTRACT(MILLISECOND" in sql
        # Must apply modulo 1000 since EXTRACT(MILLISECOND) returns 0-59999
        # PyPika renders modulo as MOD(...)
        assert "MOD(" in sql and ",1000)" in sql

    def test_duckdb_distinct_microsecond_uses_modulo(self):
        """SQL microsecond distinct should apply % 1000000 to get 0-999999 range."""
        t = Table("events")
        expr = DateTimeService.get_datetime_part_expression(
            t.ts, "microsecond", "distinct", "duckdb"
        )
        sql = expr.get_sql(quote_char='"')

        assert "EXTRACT(MICROSECOND" in sql
        # Must apply modulo 1000000 since EXTRACT(MICROSECOND) returns total microseconds
        # PyPika renders modulo as MOD(...)
        assert "MOD(" in sql and ",1000000)" in sql

    def test_clickhouse_distinct_millisecond_uses_modulo(self):
        """ClickHouse millisecond distinct should apply % 1000 to get 0-999 range."""
        t = Table("events")
        expr = DateTimeService.get_datetime_part_expression(
            t.ts, "millisecond", "distinct", "clickhouse"
        )
        sql = expr.get_sql(quote_char='"')

        assert "toUnixTimestamp64Milli" in sql
        # Must apply modulo 1000 - PyPika renders as MOD(...)
        assert "MOD(" in sql and ",1000)" in sql


class TestDateTimeStringSourceParsing:
    """A column physically stored as text but overridden to DateTime must be parsed
    before datetime functions are applied (otherwise the DB raises an illegal-type
    error). Real datetime columns must be left unchanged."""

    def test_clickhouse_string_source_is_parsed_before_timeline(self):
        t = Table("planks")
        expr = DateTimeService.get_datetime_part_expression(
            t.datetime, "year", "timeline", "clickhouse", source_type="String"
        )
        sql = expr.get_sql(quote_char="`")

        assert "parseDateTime64BestEffort(`datetime`, 3)" in sql
        assert "toStartOfYear" in sql
        assert "toTimeZone" in sql

    def test_clickhouse_nullable_string_source_is_parsed(self):
        t = Table("planks")
        expr = DateTimeService.get_datetime_part_expression(
            t.datetime, "month", "distinct", "clickhouse",
            source_type="Nullable(String)",
        )
        sql = expr.get_sql(quote_char="`")

        assert "parseDateTime64BestEffort" in sql
        assert "toMonth" in sql

    def test_clickhouse_lowcardinality_string_source_is_parsed(self):
        t = Table("planks")
        expr = DateTimeService.get_datetime_part_expression(
            t.datetime, "day", "distinct", "clickhouse",
            source_type="LowCardinality(String)",
        )
        sql = expr.get_sql(quote_char="`")

        assert "parseDateTime64BestEffort" in sql

    def test_clickhouse_real_datetime_source_is_not_parsed(self):
        t = Table("events")
        expr = DateTimeService.get_datetime_part_expression(
            t.ts, "year", "timeline", "clickhouse", source_type="DateTime64(3)"
        )
        sql = expr.get_sql(quote_char="`")

        assert "parseDateTime64BestEffort" not in sql
        assert "toDateTime64(toStartOfYear(toTimeZone(`ts`,'UTC')),0,'UTC')" == sql

    def test_clickhouse_no_source_type_is_unchanged(self):
        """Default (no source_type) preserves prior behavior."""
        t = Table("events")
        expr = DateTimeService.get_datetime_part_expression(
            t.ts, "year", "timeline", "clickhouse"
        )
        sql = expr.get_sql(quote_char="`")

        assert "parseDateTime64BestEffort" not in sql

    def test_duckdb_string_source_is_cast_to_timestamp(self):
        t = Table("planks")
        expr = DateTimeService.get_datetime_part_expression(
            t.datetime, "year", "timeline", "duckdb", source_type="VARCHAR"
        )
        sql = expr.get_sql(quote_char='"')

        assert 'CAST("datetime" AS TIMESTAMP)' in sql
        assert "date_trunc" in sql

    def test_duckdb_string_source_uses_flexible_timestamp_parse(self):
        """A text column overridden to DateTime is parsed with TRY_CAST first
        (ISO8601) and a try_strptime fallback for non-standard layouts such as
        dashes in the time component (e.g. '2026-01-26T07-00-44'), so those
        values no longer abort the query."""
        t = Table("coredumps")
        expr = DateTimeService.get_datetime_part_expression(
            t.timestamp, "year", "distinct", "duckdb", source_type="VARCHAR"
        )
        sql = expr.get_sql(quote_char='"')

        assert 'TRY_CAST("timestamp" AS TIMESTAMP)' in sql
        assert "try_strptime" in sql
        # The filename-safe dash-in-time layout is one of the accepted formats.
        assert "%Y-%m-%dT%H-%M-%S" in sql

    def test_full_datetime_no_part_returns_parsed_timestamp(self):
        """Full DateTime (date_mode set, no date_part) returns the parsed timestamp
        itself — no EXTRACT/date_trunc — so a string datetime column still reaches
        the client as a real timestamp rather than the raw source string."""
        t = Table("coredumps")
        expr = DateTimeService.get_datetime_part_expression(
            t.timestamp, None, "timeline", "duckdb", source_type="VARCHAR"
        )
        sql = expr.get_sql(quote_char='"')

        assert "EXTRACT" not in sql
        assert "date_trunc" not in sql
        assert "try_strptime" in sql  # flexible string->timestamp parse applied

    def test_full_datetime_native_timestamp_is_passthrough(self):
        """Full DateTime on an already-timestamp column is a plain passthrough."""
        t = Table("events")
        expr = DateTimeService.get_datetime_part_expression(
            t.ts, None, "timeline", "duckdb", source_type="TIMESTAMP"
        )
        sql = expr.get_sql(quote_char='"')

        assert sql == '"ts"'

    def test_duckdb_real_timestamp_source_is_not_cast(self):
        t = Table("events")
        expr = DateTimeService.get_datetime_part_expression(
            t.ts, "year", "timeline", "duckdb", source_type="TIMESTAMP"
        )
        sql = expr.get_sql(quote_char='"')

        assert "CAST(" not in sql

    def test_resolve_source_type_handles_qualified_names(self):
        column_types = {"datetime": "String"}
        assert (
            DateTimeService.resolve_source_type("planks.datetime", column_types)
            == "String"
        )
        assert DateTimeService.resolve_source_type("datetime", column_types) == "String"
        assert DateTimeService.resolve_source_type("missing", column_types) is None
        assert DateTimeService.resolve_source_type("datetime", None) is None


