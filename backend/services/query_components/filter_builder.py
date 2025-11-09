"""Builder for translating QueryDescription filters into PyPika criteria."""

from __future__ import annotations

import logging
from typing import Any, Callable, Dict, Iterable, List, Optional

from pypika import Criterion
from pypika.functions import Cast

from backend.exceptions import QueryGenerationError
from backend.models.query import QueryDescription

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
    "is null": lambda f, v: f.isnull(),
    "is not null": lambda f, v: f.notnull(),
}


class FilterBuilder:
    """Encapsulates filter translation, null-guard injection, and regex sampling hooks."""

    def __init__(
        self,
        parse_field_reference: Callable[[str, Dict[str, Any], Any], Any],
        apply_cast_if_configured: Callable[[str, Any, Optional[Dict[str, Dict[str, str]]]], Any],
        get_datetime_part_expression: Callable[[Any, str, str, str], Any],
        get_field_with_cast: Callable[[Any, str, Optional[Dict[str, Dict[str, str]]]], Any],
        operator_map: Optional[Dict[str, Callable[[Any, Any], Criterion]]] = None,
    ) -> None:
        self._parse_field_reference = parse_field_reference
        self._apply_cast_if_configured = apply_cast_if_configured
        self._get_datetime_part_expression = get_datetime_part_expression
        self._get_field_with_cast = get_field_with_cast
        self._operator_map = operator_map or OPERATOR_MAP

    def build(
        self,
        query_desc: QueryDescription,
        table_map: Dict[str, Any],
        default_table: Any,
        db_type: str,
        primary_table: Any,
    ) -> List[Criterion]:
        criteria: List[Criterion] = []

        for definition in query_desc.filters:
            if definition.field == "_source_table":
                continue

            operator_func = self._operator_map.get(definition.operator)
            if not operator_func:
                raise QueryGenerationError(f"Unsupported filter operator: {definition.operator}")

            field = self._resolve_field_definition(
                definition,
                table_map=table_map,
                default_table=default_table,
                db_type=db_type,
                column_casts=query_desc.column_casts,
            )
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
                criteria.append(operator_func(field, value))

        if query_desc.dimensions:
            for dim in query_desc.dimensions:
                if dim.flavour == "continuous":
                    dim_field = self._get_field_with_cast(
                        primary_table, dim.field, query_desc.column_casts
                    )
                    criteria.append(dim_field.notnull())

        if query_desc.distinct_value_regex and query_desc.dimensions:
            criteria.append(
                self._build_distinct_regex_filter(
                    query_desc, primary_table, db_type
                )
            )

        return criteria

    def _resolve_field_definition(
        self,
        definition: Any,
        *,
        table_map: Dict[str, Any],
        default_table: Any,
        db_type: str,
        column_casts: Optional[Dict[str, Dict[str, str]]],
    ) -> Any:
        if definition.date_part and definition.date_mode:
            field_term = self._parse_field_reference(
                definition.field, table_map, default_table
            )
            field_term = self._apply_cast_if_configured(
                definition.field, field_term, column_casts
            )
            return self._get_datetime_part_expression(
                field_term, definition.date_part, definition.date_mode, db_type
            )

        field = self._parse_field_reference(
            definition.field, table_map, default_table
        )
        return self._apply_cast_if_configured(
            definition.field, field, column_casts
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
        db_type: str,
    ) -> Criterion:
        dim = query_desc.dimensions[0]

        if dim.date_part and dim.date_mode:
            field_term = self._get_field_with_cast(
                primary_table, dim.field, query_desc.column_casts
            )
            field_expr = self._get_datetime_part_expression(
                field_term, dim.date_part, dim.date_mode, db_type
            )
            cast_type = "String" if db_type == "clickhouse" else "VARCHAR"
            field_expr = Cast(field_expr, cast_type)
        else:
            field_expr = self._get_field_with_cast(
                primary_table, dim.field, query_desc.column_casts
            )

        like_pattern = f"%{query_desc.distinct_value_regex}%"
        logger.info("Applied LIKE filter for distinct values: %s", like_pattern)
        return field_expr.like(like_pattern)
