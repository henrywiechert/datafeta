# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""DuckDB SQL dialect implementation."""

from typing import Any, Optional

from backend.dialects.base import SqlDialect


class DuckDbDialect(SqlDialect):
    """
    SQL dialect for DuckDB database.
    
    Used by FileConnector (CSV), KaggleConnector, and HiveParquetConnector,
    all of which use DuckDB as their query engine.
    """

    @property
    def name(self) -> str:
        return 'duckdb'

    @property
    def quote_char(self) -> str:
        return '"'

    @property
    def supports_schema_prefix(self) -> bool:
        return False

    @property
    def requires_database(self) -> bool:
        return False

    def random_func_name(self) -> str:
        return 'random'

    def to_string_expr(self, expr: str) -> str:
        return f"CAST({expr} AS VARCHAR)"

    def first_value_agg_name(self) -> str:
        return 'first'

    def count_star_expr(self) -> str:
        return 'COUNT(*)'

    def count_distinct_expr(self, field: str) -> str:
        return f"COUNT(DISTINCT {field})"

    def to_epoch_expr(self, field: str) -> str:
        return f"epoch({field})"

    def cast_null_expr(
        self,
        alias: str,
        type_hint: Optional[str] = None,
        is_measure: bool = False,
        column_type: Optional[str] = None,
    ) -> str:
        q = self.quote_char
        return f"NULL AS {q}{alias}{q}"

    def needs_nan_safe_aggregation(self) -> bool:
        return False

    def nan_safe_sum_expr(self, field: str) -> str:
        return f"COALESCE(SUM({field}), 0)"

    def nan_safe_avg_expr(self, field: str) -> str:
        return f"COALESCE(AVG({field}), 0)"
