"""Builder for applying sampling, random ordering, and limit/offset behavior."""

from __future__ import annotations

import logging
from typing import Any

from pypika import Query
from pypika.terms import Function

from backend.exceptions import QueryGenerationError
from backend.models.query import QueryDescription


class SamplingAndLimitsBuilder:
    """Encapsulates the sampling and limit logic originally in QueryService."""

    def __init__(self, logger: logging.Logger | None = None) -> None:
        self._logger = logger or logging.getLogger(__name__)

    def apply(
        self,
        query: Query,
        query_desc: QueryDescription,
        db_type: str,
        primary_table: Any,
        with_sampling: bool,
    ) -> Query:
        is_raw_query = not query_desc.measures
        is_single_dimension = bool(query_desc.dimensions) and len(query_desc.dimensions) == 1

        if (
            with_sampling
            and is_raw_query
            and is_single_dimension
            and query_desc.limit is None
            and not query_desc.orderBy
            and not query_desc.filters
            and not query_desc.use_random_sample
        ):
            dimension = query_desc.dimensions[0]
            if dimension.flavour == "continuous":
                query = query.where(primary_table[dimension.field].notnull())

            if db_type == "clickhouse":
                query = query.orderby(Function("rand")).limit(5000)

        if query_desc.use_random_sample:
            random_func = "rand" if db_type == "clickhouse" else "random"
            query = query.orderby(Function(random_func))
            self._logger.info("Applied random sampling for distinct value query")

        if query_desc.limit is not None:
            if query_desc.limit < 0:
                raise QueryGenerationError("Limit cannot be negative.")
            query = query.limit(query_desc.limit)

        if query_desc.offset is not None:
            if query_desc.offset < 0:
                raise QueryGenerationError("Offset cannot be negative.")
            query = query.offset(query_desc.offset)

        return query
