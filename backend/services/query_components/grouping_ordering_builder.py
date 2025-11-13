"""Builder for applying GROUP BY and ORDER BY logic to PyPika queries."""

from __future__ import annotations

import logging
from typing import Any, Iterable, List, Optional, Sequence

from pypika import Order, Query

from backend.models.query import OrderBy, QueryDescription
from backend.services.query_components.terms import QuotedField


class GroupingOrderingBuilder:
    """Encapsulate grouping and ordering behavior used by QueryService."""

    def __init__(
        self,
        *,
        logger: logging.Logger | None = None,
        get_datetime_part_expression: Optional[callable] = None,
    ) -> None:
        self._logger = logger or logging.getLogger(__name__)
        self._get_datetime_part_expression = get_datetime_part_expression

    # --- GROUPING -----------------------------------------------------

    def apply_grouping(
        self,
        query: Query,
        *,
        query_desc: QueryDescription,
        db_type: str,
        primary_table: Any,
        use_category_dedup: bool,
        groupby_field_info_for_dedup: List[tuple[str, Optional[Any]]],
        with_optimization: bool,
        optimizer: Optional[Any],
        vc_builder: Optional[Any] = None,
    ) -> Query:
        if not query_desc.dimensions:
            return query

        if use_category_dedup and groupby_field_info_for_dedup:
            self._logger.info(
                "Building GROUP BY with %s fields (using aliases)",
                len(groupby_field_info_for_dedup),
            )
            for field_name, precision in groupby_field_info_for_dedup:
                # Check if this is a virtual column
                if vc_builder and vc_builder.is_virtual_column(field_name):
                    field_term = vc_builder.get_virtual_column_term(field_name)
                    self._logger.debug("Using virtual column expression for GROUP BY: %s", field_name)
                else:
                    field_term = primary_table[field_name]
                query = query.groupby(field_term)
                if precision is not None:
                    self._logger.debug("  GROUP BY %s (precision=%s)", field_name, precision)
                else:
                    self._logger.debug("  GROUP BY %s (no rounding)", field_name)
            self._logger.info(
                "Applied GROUP BY on %s continuous dimensions for category dedup",
                len(groupby_field_info_for_dedup),
            )
            return query

        if query_desc.measures:
            groupby_fields = []
            for dim in query_desc.dimensions:
                # Check if this is a virtual column
                if vc_builder and vc_builder.is_virtual_column(dim.field):
                    field_term = vc_builder.get_virtual_column_term(dim.field)
                    self._logger.debug("Using virtual column expression for GROUP BY: %s", dim.field)
                else:
                    field_term = primary_table[dim.field]
                
                if dim.date_part and dim.date_mode and self._get_datetime_part_expression:
                    field_term = self._get_datetime_part_expression(
                        field_term, dim.date_part, dim.date_mode, db_type
                    )
                groupby_fields.append(field_term)
            return query.groupby(*groupby_fields)

        if with_optimization and optimizer:
            return query

        continuous_dims = [d for d in query_desc.dimensions if d.flavour == "continuous"]
        discrete_dims = [d for d in query_desc.dimensions if d.flavour == "discrete"]

        has_continuous_on_x = any(d.axis == "x" for d in continuous_dims)
        has_continuous_on_y = any(d.axis == "y" for d in continuous_dims)
        is_scatter_plot = has_continuous_on_x and has_continuous_on_y

        if not is_scatter_plot:
            if discrete_dims and continuous_dims:
                groupby_fields = []
                for dim in query_desc.dimensions:
                    # Check if this is a virtual column
                    if vc_builder and vc_builder.is_virtual_column(dim.field):
                        field_term = vc_builder.get_virtual_column_term(dim.field)
                        self._logger.debug("Using virtual column expression for GROUP BY: %s", dim.field)
                    else:
                        field_term = primary_table[dim.field]
                    
                    if dim.date_part and dim.date_mode and self._get_datetime_part_expression:
                        field_term = self._get_datetime_part_expression(
                            field_term, dim.date_part, dim.date_mode, db_type
                        )
                    groupby_fields.append(field_term)
                return query.groupby(*groupby_fields)
            return query.distinct()

        return query

    # --- ORDERING -----------------------------------------------------

    def apply_ordering(
        self,
        query: Query,
        *,
        order_by: Sequence[OrderBy],
        all_aliases: Iterable[str],
        primary_table: Any,
        vc_builder: Optional[Any] = None,
    ) -> Query:
        if not order_by:
            return query

        alias_set = set(all_aliases)
        for order in order_by:
            if order.field in alias_set:
                field_term = QuotedField(order.field)
            elif vc_builder and vc_builder.is_virtual_column(order.field):
                # Use the virtual column expression for ORDER BY
                field_term = vc_builder.get_virtual_column_term(order.field)
                self._logger.debug(f"Using virtual column expression for ORDER BY: {order.field}")
            else:
                field_term = primary_table[order.field]

            pypika_order = Order.desc if order.direction == "desc" else Order.asc
            query = query.orderby(field_term, order=pypika_order)

        return query
