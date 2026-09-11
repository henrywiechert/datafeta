# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""
Abstract base class for SQL dialects.

SqlDialect encapsulates database-specific SQL generation details, enabling
query services to work with different database backends without scattered
conditional logic.
"""

from abc import ABC, abstractmethod
from typing import Any, List, Mapping, Optional

from backend.dialects.aggregations import AggregateSpec


class SqlDialect(ABC):
    """
    Abstract SQL dialect providing database-specific SQL generation details.
    
    Each concrete implementation (ClickHouseDialect, DuckDbDialect) provides
    the specific SQL syntax and functions for its target database.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """
        Canonical dialect name: 'clickhouse', 'duckdb', etc.
        
        Used for logging and cases where dialect-specific branches are still
        necessary (e.g., complex CDF query generation).
        """

    @property
    @abstractmethod
    def quote_char(self) -> str:
        """
        Identifier quote character.
        
        Returns '`' for ClickHouse, '"' for DuckDB/standard SQL.
        """

    @property
    @abstractmethod
    def supports_schema_prefix(self) -> bool:
        """
        Whether dialect uses database.table syntax for table references.
        
        ClickHouse requires schema prefix; DuckDB does not.
        """

    @property
    def requires_database(self) -> bool:
        """
        Whether queries require an explicit database parameter.
        
        Override to return True for databases like ClickHouse where
        database must be specified.
        """
        return False

    @abstractmethod
    def random_func_name(self) -> str:
        """
        Random function name for ORDER BY randomization.
        
        Returns 'rand' for ClickHouse, 'random' for DuckDB.
        """

    @abstractmethod
    def to_string_expr(self, expr: str) -> str:
        """
        Wrap expression in string conversion.
        
        Returns "toString({expr})" for ClickHouse, "CAST({expr} AS VARCHAR)" for DuckDB.
        """

    @abstractmethod
    def first_value_agg_name(self) -> str:
        """
        Non-deterministic single-value aggregation function name.
        
        Returns 'any' for ClickHouse, 'first' for DuckDB.
        """

    @abstractmethod
    def aggregate_specs(self) -> Mapping[str, AggregateSpec]:
        """
        Aggregation name -> how this dialect renders it.

        Keys are ``Measure.aggregation`` values, plus ``COUNT_STAR`` for the
        ``COUNT(*)`` form.  A name missing from the table is unsupported on this
        engine; query generation rejects it rather than guessing a substitute.

        The specs are consumed by
        ``backend.services.query_components.aggregation_builder``, which is the
        single place that turns them into SELECT and HAVING expressions.
        """

    def aggregate_spec(self, name: str) -> Optional[AggregateSpec]:
        """Spec for `name`, or None when this dialect does not support it."""
        return self.aggregate_specs().get(name)

    @abstractmethod
    def lag_expression(self, field_sql: str, over_content_sql: str) -> str:
        """
        Previous-row value window expression.

        Must return NULL for the first row of each partition (not a default
        value), so downstream difference calculations yield NULL there.

        Args:
            field_sql: Already-quoted field/expression to lag.
            over_content_sql: Content of the OVER clause, e.g.
                'PARTITION BY "cat" ORDER BY "day"' (no surrounding parens).
        """

    @abstractmethod
    def to_epoch_expr(self, field: str) -> str:
        """
        Convert timestamp field to unix epoch seconds.
        
        Returns "toUnixTimestamp({field})" for ClickHouse, "epoch({field})" for DuckDB.
        """

    @abstractmethod
    def cast_null_expr(
        self,
        alias: str,
        type_hint: Optional[str] = None,
        is_measure: bool = False,
        column_type: Optional[str] = None,
    ) -> str:
        """
        NULL literal with explicit type cast for Arrow compatibility.
        
        ClickHouse requires explicit typing to avoid 'Nothing' type errors.
        DuckDB can use plain NULL.
        
        Args:
            alias: Column alias for the NULL expression
            type_hint: Optional output type hint (e.g., 'number', 'string')
            is_measure: Whether this NULL is for a measure column
            column_type: Optional actual DB column type
            
        Returns:
            SQL expression like "CAST(NULL AS Nullable(Float64)) AS `alias`"
        """

    def wrap_datetime_comparison(self, value: Any, is_datetime_string: bool) -> Any:
        """
        Wrap datetime string values for comparison if needed.
        
        ClickHouse requires explicit conversion for DateTime64 comparisons.
        Default implementation returns value unchanged.
        
        Args:
            value: The value to potentially wrap
            is_datetime_string: Whether value is detected as a datetime string
            
        Returns:
            Wrapped value or original value
        """
        return value

    def star_except_keyword(self) -> str:
        """
        Keyword introducing a star-exclusion list.

        Returns 'EXCEPT' for ClickHouse, 'EXCLUDE' for DuckDB (where EXCEPT is
        the set operator).
        """
        return 'EXCEPT'

    def star_except(self, columns: List[str]) -> str:
        """
        Build a `*` projection that drops the given columns.

        Used to project everything a subquery produces while hiding helper
        columns (window-function ranks, row counters) added by a wrapper.

        Args:
            columns: Unquoted column names to exclude

        Returns:
            '*' if columns is empty, otherwise '* EXCEPT ("a", "b")'
        """
        if not columns:
            return '*'
        quoted = ', '.join(
            f"{self.quote_char}{c}{self.quote_char}" for c in columns
        )
        return f"* {self.star_except_keyword()} ({quoted})"

    def table_ref(self, table_name: str, database: Optional[str] = None) -> str:
        """
        Build a table reference with optional schema prefix.
        
        Args:
            table_name: Name of the table
            database: Optional database/schema name
            
        Returns:
            "database.table" if schema prefix supported and database provided,
            otherwise just "table"
        """
        if self.supports_schema_prefix and database:
            return f"{self.quote_char}{database}{self.quote_char}.{self.quote_char}{table_name}{self.quote_char}"
        return f"{self.quote_char}{table_name}{self.quote_char}"
