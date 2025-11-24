"""Builder responsible for assembling the SELECT clause for QueryService."""

from __future__ import annotations

import logging
from typing import Any, Callable, Dict, Optional, Set

from pypika.terms import Function

from backend.exceptions import QueryGenerationError
from backend.models.query import QueryDescription
from backend.services.query_components.contexts import SelectClauseResult
from backend.services.query_components.terms import CastField

logger = logging.getLogger(__name__)


class SelectClauseBuilder:
    """Encapsulates logic for constructing SELECT fields and alias metadata."""

    def __init__(
        self,
        parse_field_reference: Callable[[str, Dict[str, Any], Any], Any],
        apply_cast_if_configured: Callable[[str, Any, Optional[Dict[str, Dict[str, str]]]], Any],
        get_datetime_part_expression: Callable[[Any, str, str, str], Any],
        vc_builder: Optional[Any] = None,  # VirtualColumnExpressionBuilder
    ) -> None:
        self._parse_field_reference = parse_field_reference
        self._apply_cast_if_configured = apply_cast_if_configured
        self._get_datetime_part_expression = get_datetime_part_expression
        self._vc_builder = vc_builder

    def build(
        self,
        query_desc: QueryDescription,
        table_map: Dict[str, Any],
        default_table: Any,
        db_type: str,
        rounding_config: Dict[str, Any],
        binning_config: Dict[str, Any],
        use_category_dedup: bool,
        aggregation_map: Dict[str, Callable[[Any], Any]],
    ) -> SelectClauseResult:
        select_fields: list[Any] = []
        all_aliases: Set[str] = set()
        groupby_field_info_for_dedup: list[tuple[str, Optional[Any]]] = []

        if query_desc.dimensions:
            for dim in query_desc.dimensions:
                # Handle source tracking columns as literals for single-table queries
                # (UnionQueryBuilder handles these differently for union mode)
                if dim.field == "_source_database":
                    # Add as literal value
                    from pypika.terms import ValueWrapper
                    database_value = query_desc.target_database or ''
                    field_term = ValueWrapper(database_value).as_(dim.field)
                    select_fields.append(field_term)
                    all_aliases.add(dim.field)
                    continue
                
                if dim.field == "_source_table":
                    # Add as literal value
                    from pypika.terms import ValueWrapper
                    table_value = query_desc.target_table
                    field_term = ValueWrapper(table_value).as_(dim.field)
                    select_fields.append(field_term)
                    all_aliases.add(dim.field)
                    continue

                field_term = self._parse_field_reference(dim.field, table_map, default_table)
                field_term = self._apply_cast_if_configured(dim.field, field_term, query_desc.column_casts)

                # Check if this is a virtual column that needs aliasing
                is_virtual_column = self._vc_builder and self._vc_builder.is_virtual_column(dim.field)

                # Skip optimization binning if user has explicitly selected a datetime part
                # User's explicit selection takes precedence over automatic optimization
                has_explicit_datetime_part = dim.date_part and dim.date_mode
                
                if (
                    binning_config
                    and dim.field in binning_config
                    and getattr(dim, "date_mode", None) == "timeline"
                    and not has_explicit_datetime_part  # Skip if user selected a specific part
                ):
                    unit = binning_config[dim.field]
                    binned_expr = Function("date_trunc", unit, field_term)
                    if use_category_dedup:
                        groupby_field_info_for_dedup.append((dim.field, f"binned_{unit}"))
                    field_term = binned_expr.as_(dim.field)
                    all_aliases.add(dim.field)
                    logger.debug("Applied datetime binning to %s with unit %s", dim.field, unit)
                elif binning_config and dim.field in binning_config and has_explicit_datetime_part:
                    logger.debug(
                        "Skipping optimization binning for %s - user selected explicit datetime part: %s (%s)",
                        dim.field, dim.date_part, dim.date_mode
                    )

                elif rounding_config and dim.field in rounding_config and dim.flavour == "continuous":
                    from backend.services.optimization.strategies.adaptive_rounding import RoundingHelper

                    precision = rounding_config[dim.field]
                    rounded_expr = RoundingHelper.create_round_expression(field_term, precision, db_type)
                    if use_category_dedup:
                        groupby_field_info_for_dedup.append((dim.field, precision))
                    field_term = rounded_expr.as_(dim.field)
                    all_aliases.add(dim.field)
                    logger.debug("Applied rounding to %s with precision %s", dim.field, precision)

                elif use_category_dedup:
                    if dim.flavour == "continuous":
                        groupby_field_info_for_dedup.append((dim.field, None))
                        logger.debug(
                            "Added continuous dimension %s to GROUP BY for category dedup", dim.field
                        )
                    elif dim.flavour == "discrete":
                        has_filter = any(f.field == dim.field for f in query_desc.filters)
                        if has_filter:
                            groupby_field_info_for_dedup.append((dim.field, None))
                            logger.debug(
                                "Added filtered discrete dimension %s to GROUP BY (not using any())",
                                dim.field,
                            )
                        else:
                            agg_func_name = "any" if db_type == "clickhouse" else "first"
                            field_term = Function(agg_func_name, field_term).as_(dim.field)
                            all_aliases.add(dim.field)
                            logger.debug(
                                "Wrapped discrete dimension %s in %s() for category dedup",
                                dim.field,
                                agg_func_name,
                            )

                if dim.date_part and dim.date_mode:
                    field_term = self._get_datetime_part_expression(
                        field_term, dim.date_part, dim.date_mode, db_type
                    )
                    alias = f"{dim.field}_{dim.date_part}_{dim.date_mode}"
                    field_term = field_term.as_(alias)
                    all_aliases.add(alias)
                elif isinstance(field_term, CastField):
                    field_term = field_term.as_(dim.field)
                    all_aliases.add(dim.field)
                    logger.debug("Aliased casted dimension %s back to its original name", dim.field)
                elif is_virtual_column:
                    # Virtual columns always need to be aliased to their name
                    field_term = field_term.as_(dim.field)
                    all_aliases.add(dim.field)
                    logger.debug("Aliased virtual column %s to its name", dim.field)

                select_fields.append(field_term)

        if query_desc.measures:
            for measure in query_desc.measures:
                agg_func_builder = aggregation_map.get(measure.aggregation)
                if not agg_func_builder:
                    raise QueryGenerationError(
                        f"Unsupported aggregation function: {measure.aggregation}"
                    )

                field_term = self._parse_field_reference(measure.field, table_map, default_table)
                field_term = self._apply_cast_if_configured(
                    measure.field, field_term, query_desc.column_casts
                )

                # For ClickHouse COUNT() with dotted field names, use single quotes
                # Other aggregations (SUM, AVG, etc.) use normal backtick quoting
                if db_type == "clickhouse" and measure.aggregation == "count" and '.' in measure.field:
                    from backend.services.query_components.terms import LiteralColumnName
                    field_term = LiteralColumnName(measure.field)

                agg_term = agg_func_builder(field_term)

                if db_type != "clickhouse" and measure.aggregation in ["avg", "sum"]:
                    from pypika.functions import Coalesce

                    agg_term = Coalesce(agg_term, 0)

                select_fields.append(agg_term.as_(measure.alias))
                all_aliases.add(measure.alias)

        if getattr(query_desc, "label_fields", None):
            existing_dimension_fields = {d.field for d in query_desc.dimensions} if query_desc.dimensions else set()
            existing_measure_fields = {m.field for m in query_desc.measures} if query_desc.measures else set()
            for lbl in query_desc.label_fields:
                if lbl in existing_dimension_fields or lbl in existing_measure_fields:
                    continue
                try:
                    raw_term = self._parse_field_reference(lbl, table_map, default_table)
                    raw_term = self._apply_cast_if_configured(lbl, raw_term, query_desc.column_casts)
                    select_fields.append(raw_term.as_(lbl))
                    all_aliases.add(lbl)
                except Exception as exc:  # pragma: no cover - defensive logging
                    logger.warning("Failed to include label field '%s' in SELECT: %s", lbl, exc)

        if not select_fields:
            raise QueryGenerationError("Query must have at least one dimension or measure.")

        return SelectClauseResult(
            fields=select_fields,
            aliases=all_aliases,
            groupby_field_info_for_dedup=groupby_field_info_for_dedup,
        )
