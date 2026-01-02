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


