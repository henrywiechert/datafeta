# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Builder for translating QueryDescription filters into PyPika criteria."""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, Any, Callable, Dict, Iterable, List, Optional

from pypika import Criterion
from pypika.functions import Cast

from backend.dialects import get_dialect
from backend.exceptions import QueryGenerationError
from backend.models.query import QueryDescription
from backend.services.query_components.field_term_resolver import FieldTermResolver
from backend.services.query_components.terms import CustomFunction

if TYPE_CHECKING:
    from backend.dialects import SqlDialect

logger = logging.getLogger(__name__)


OPERATOR_MAP: Dict[str, Callable[[Any, Any], Criterion]] = {
    "=": lambda f, v: f == v,
    "!=": lambda f, v: f != v,
    ">": lambda f, v: f > v,
    "<": lambda f, v: f < v,
    ">=": lambda f, v: f >= v,
    "<=": lambda f, v: f <= v,
    "in": lambda f, v: f.isin(v),
    "not in": lambda f, v: ~f.isin(v),
    "like": lambda f, v: f.like(v),
    "ilike": lambda f, v: f.ilike(v),
    "not like": lambda f, v: ~f.like(v),
    "not ilike": lambda f, v: ~f.ilike(v),
    "is null": lambda f, v: f.isnull(),
    "is not null": lambda f, v: f.notnull(),
}


class FilterBuilder:
    """Encapsulates filter translation, null-guard injection, and regex sampling hooks."""

    def __init__(
        self,
        parse_field_reference: Callable[[str], Any],
        get_field_with_cast: Callable[[Any, str, Optional[Dict[str, Dict[str, str]]]], Any],
        operator_map: Optional[Dict[str, Callable[[Any, Any], Criterion]]] = None,
    ) -> None:
        self._parse_field_reference = parse_field_reference
        self._get_field_with_cast = get_field_with_cast
        self._operator_map = operator_map or OPERATOR_MAP

    def build(
        self,
        query_desc: QueryDescription,
        table_map: Dict[str, Any],
        default_table: Any,
        dialect: "SqlDialect | str",
        primary_table: Any,
        column_types: Optional[Dict[str, str]] = None,
    ) -> List[Criterion]:
        """Return WHERE-clause criteria (scope='row' filters, null guards, regex sampling)."""
        dialect = self._coerce_dialect(dialect)
        resolver = FieldTermResolver(
            self._parse_field_reference, dialect, query_desc.column_casts, column_types
        )
        criteria: List[Criterion] = []

        for definition in query_desc.filters:
            # HAVING (group-scoped) filters are handled separately in build_having()
            if getattr(definition, 'scope', 'row') == 'group':
                continue
            # Skip source tracking columns - they are handled in outer query for UNION mode
            if definition.field in ("_source_database", "_source_table"):
                continue

            operator_func = self._operator_map.get(definition.operator)
            if not operator_func:
                raise QueryGenerationError(f"Unsupported filter operator: {definition.operator}")

            field = self._resolve_field_definition(definition, resolver=resolver)
            value = definition.value

            if definition.operator in {"is null", "is not null"}:
                criteria.append(operator_func(field, None))
            elif definition.operator in {"in", "not in"}:
                criteria.extend(
                    self._handle_membership_filter(
                        operator=definition.operator,
                        field=field,
                        value=value,
                    )
                )
            else:
                wrapped_value = self._wrap_datetime_value_if_needed(value, dialect)
                criteria.append(operator_func(field, wrapped_value))

        # Automatic NULL filtering for continuous dimensions
        if query_desc.dimensions:
            for dim in query_desc.dimensions:
                if dim.flavour == "continuous":
                    dim_field = resolver.resolve_base(dim.field)
                    criteria.append(dim_field.notnull())

        if query_desc.distinct_value_regex and query_desc.dimensions:
            criteria.append(
                self._build_distinct_regex_filter(query_desc, primary_table, dialect, resolver)
            )

        return criteria

    def build_having(
        self,
        query_desc: QueryDescription,
        aggregation_map: Dict[str, Any],
        table_map: Dict[str, Any],
        default_table: Any,
    ) -> List[Criterion]:
        """Return HAVING-clause criteria for group-scoped (measure) filters.

        Each filter with scope='group' must reference a measure alias that exists in
        query_desc.measures.  The aggregation expression is reconstructed from the
        Measure definition so PyPika can emit a proper HAVING clause.
        """
        having_criteria: List[Criterion] = []

        # Build alias -> Measure lookup
        alias_to_measure = {m.alias: m for m in query_desc.measures}

        for definition in query_desc.filters:
            if getattr(definition, 'scope', 'row') != 'group':
                continue

            measure = alias_to_measure.get(definition.field)
            if measure is None:
                # The measure may have been removed from the view while the filter is
                # still active.  SQL permits HAVING on aggregates not in SELECT, so
                # parse the alias string (e.g. "AVG(col.name)") and reconstruct the
                # expression directly instead of raising an error.
                alias_match = re.fullmatch(
                    r'(\w+)\((.+)\)', definition.field.strip()
                )
                if alias_match is None:
                    raise QueryGenerationError(
                        f"HAVING filter references unknown measure alias '{definition.field}' "
                        f"and its format could not be parsed. "
                        f"Available aliases: {list(alias_to_measure)}"
                    )
                agg_name, raw_col = alias_match.group(1).lower(), alias_match.group(2)
                agg_factory = aggregation_map.get(agg_name)
                if agg_factory is None:
                    raise QueryGenerationError(
                        f"HAVING filter references unknown measure alias '{definition.field}' "
                        f"with unsupported aggregation '{agg_name}'. "
                        f"Available aliases: {list(alias_to_measure)}"
                    )
                field_ref = self._parse_field_reference(raw_col)
                agg_term = agg_factory(field_ref)
            else:
                agg_factory = aggregation_map.get(measure.aggregation)
                if agg_factory is None:
                    raise QueryGenerationError(
                        f"Unsupported aggregation '{measure.aggregation}' in HAVING filter."
                    )

                # Resolve the raw column; table-prefix handling mirrors the WHERE path
                field_ref = self._parse_field_reference(measure.field)
                agg_term = agg_factory(field_ref)

            operator_func = self._operator_map.get(definition.operator)
            if not operator_func:
                raise QueryGenerationError(
                    f"Unsupported operator '{definition.operator}' in HAVING filter."
                )

            if definition.operator in {"is null", "is not null"}:
                having_criteria.append(operator_func(agg_term, None))
            else:
                having_criteria.append(operator_func(agg_term, definition.value))

        return having_criteria

    def _resolve_field_definition(
        self,
        definition: Any,
        *,
        resolver: FieldTermResolver,
    ) -> Any:
        return resolver.resolve(
            definition.field, definition.date_part, definition.date_mode
        )

    def _handle_membership_filter(
        self,
        *,
        operator: str,
        field: Any,
        value: Any,
    ) -> Iterable[Criterion]:
        if not isinstance(value, list):
            raise QueryGenerationError(
                f"Value for '{operator}' operator must be a list."
            )

        non_null_values = [entry for entry in value if entry is not None]
        has_null = any(entry is None for entry in value)

        if operator == "in":
            if non_null_values and has_null:
                in_criterion = field.isin(tuple(non_null_values))
                null_criterion = field.isnull()
                return [in_criterion | null_criterion]
            if non_null_values:
                return [field.isin(tuple(non_null_values))]
            if has_null:
                return [field.isnull()]
            return []

        # operator == 'not in'
        if non_null_values and has_null:
            not_in_criterion = ~field.isin(tuple(non_null_values))
            not_null_criterion = field.notnull()
            return [not_in_criterion & not_null_criterion]
        if non_null_values:
            return [~field.isin(tuple(non_null_values))]
        if has_null:
            return [field.notnull()]
        return []

    def _build_distinct_regex_filter(
        self,
        query_desc: QueryDescription,
        primary_table: Any,
        dialect: "SqlDialect",
        resolver: FieldTermResolver,
    ) -> Criterion:
        """Build a LIKE filter for distinct value queries.
        
        Always cast to string before LIKE comparison to support both
        string and numeric columns. LIKE only works on string types in SQL.
        """
        dim = query_desc.dimensions[0]

        # Base term uses the primary table directly (distinct-value queries are
        # single-table); datetime extraction is layered on via the shared resolver.
        field_expr = self._get_field_with_cast(
            primary_table, dim.field, query_desc.column_casts
        )
        field_expr = resolver.apply_datetime(
            field_expr, dim.field, dim.date_part, dim.date_mode
        )

        # Cast to string for LIKE - use dialect-specific conversion
        if dialect.name == "clickhouse":
            string_expr = CustomFunction('toString', [field_expr])
        else:
            string_expr = Cast(field_expr, 'VARCHAR')

        like_pattern = f"%{query_desc.distinct_value_regex}%"
        logger.info("Applied LIKE filter for distinct values: %s", like_pattern)
        return string_expr.like(like_pattern)

    def _coerce_dialect(self, dialect: "SqlDialect | str") -> "SqlDialect":
        if isinstance(dialect, str):
            return get_dialect(dialect)
        return dialect

    def _wrap_datetime_value_if_needed(self, value: Any, dialect: "SqlDialect") -> Any:
        """
        Wrap datetime string values for databases that need it (e.g., ClickHouse).
        
        ClickHouse requires explicit conversion for DateTime64 comparisons.
        """
        is_datetime = isinstance(value, str) and self._is_datetime_string(value)
        wrapped = dialect.wrap_datetime_comparison(value, is_datetime)
        
        # The dialect returns raw string for ClickHouse, convert to CustomFunction
        if wrapped != value and dialect.name == "clickhouse" and is_datetime:
            logger.debug(
                "Wrapping datetime value '%s' with parseDateTime64BestEffort for ClickHouse",
                value
            )
            return CustomFunction("parseDateTime64BestEffort", [value, 3])
        
        return value
    
    def _is_datetime_string(self, value: str) -> bool:
        """
        Check if a string looks like a datetime with milliseconds.
        
        Examples:
        - '2023-10-26 13:05:54.479' -> True
        - '2023-10-26T13:05:54.479Z' -> True
        - '2023-10-26' -> False
        - 'some text' -> False
        """
        # Check for datetime pattern: contains both date-like and time-like parts
        # with optional milliseconds
        if not isinstance(value, str):
            return False
        
        # Look for datetime patterns: YYYY-MM-DD followed by time with colons
        # and optionally a decimal point for milliseconds
        has_date = "-" in value and len(value.split("-")[0]) == 4
        has_time = ":" in value
        has_milliseconds = "." in value and ":" in value.split(".")[-2]
        
        return has_date and has_time and has_milliseconds
