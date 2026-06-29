# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Builder for applying GROUP BY and ORDER BY logic to PyPika queries."""

from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, List, Optional, Sequence

from pypika import Order, Query

from backend.models.query import OrderBy, QueryDescription
from backend.services.query_components.field_reference_parser import FieldReferenceParser
from backend.services.query_components.field_term_resolver import FieldTermResolver
from backend.services.query_components.terms import QuotedField


class GroupingOrderingBuilder:
    """Encapsulate grouping and ordering behavior used by QueryService."""

    def __init__(
        self,
        *,
        logger: logging.Logger | None = None,
    ) -> None:
        self._logger = logger or logging.getLogger(__name__)

    # --- GROUPING -----------------------------------------------------

    def apply_grouping(
        self,
        query: Query,
        *,
        query_desc: QueryDescription,
        db_type: str,
        primary_table: Any,
        table_map: Dict[str, Any],
        default_table: Any,
        use_category_dedup: bool,
        groupby_field_info_for_dedup: List[tuple[str, Optional[Any]]],
        with_optimization: bool,
        optimizer: Optional[Any],
        vc_builder: Optional[Any] = None,
        column_types: Optional[Dict[str, str]] = None,
    ) -> Query:
        # Force raw rows: do not apply GROUP BY or DISTINCT.
        # Used for local caching slices where duplicates matter for downstream aggregation.
        if getattr(query_desc, "force_raw_rows", False):
            return query

        if not query_desc.dimensions:
            return query
        
        # Create field reference parser for proper table.column resolution
        field_parser = FieldReferenceParser(
            table_map=table_map,
            default_table=default_table,
            vc_builder=vc_builder
        )
        resolver = FieldTermResolver(
            field_parser.parse, db_type, query_desc.column_casts, column_types
        )

        if use_category_dedup and groupby_field_info_for_dedup:
            self._logger.info(
                "Building GROUP BY with %s fields (using aliases)",
                len(groupby_field_info_for_dedup),
            )
            for field_name, precision in groupby_field_info_for_dedup:
                # Use field parser to handle table prefixes properly
                field_term = field_parser.parse(field_name)
                self._logger.debug("GROUP BY field: %s", field_name)
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
                # Resolve via the shared resolver so cast + datetime extraction match
                # the SELECT clause (table prefixes handled by the field parser).
                field_term = resolver.resolve(dim.field, dim.date_part, dim.date_mode)
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
                    # Resolve via the shared resolver so cast + datetime extraction
                    # match the SELECT clause.
                    field_term = resolver.resolve(dim.field, dim.date_part, dim.date_mode)
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
        table_map: Dict[str, Any],
        default_table: Any,
        vc_builder: Optional[Any] = None,
    ) -> Query:
        if not order_by:
            return query
        
        # Create field reference parser for proper table.column resolution
        field_parser = FieldReferenceParser(
            table_map=table_map,
            default_table=default_table,
            vc_builder=vc_builder
        )

        alias_set = set(all_aliases)
        for order in order_by:
            if order.field in alias_set:
                field_term = QuotedField(order.field)
            else:
                # Use field parser to handle table prefixes and virtual columns
                field_term = field_parser.parse(order.field)
                self._logger.debug(f"ORDER BY field: {order.field}")

            pypika_order = Order.desc if order.direction == "desc" else Order.asc
            query = query.orderby(field_term, order=pypika_order)

        return query
