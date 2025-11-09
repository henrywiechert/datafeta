"""Builder responsible for translating UNION virtual tables into SQL."""

from __future__ import annotations

import logging
from typing import Callable, Dict, List, Optional, Tuple

from backend.models.query import QueryDescription


class UnionQueryBuilder:
    """Encapsulates the UNION-specific translation previously in QueryService."""

    def __init__(
        self,
        translate_single_table: Callable[[QueryDescription, str, str, bool, bool, Optional[object]], Tuple[str, List[Dict]]],
        *,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        self._translate_single_table = translate_single_table
        self._logger = logger or logging.getLogger(__name__)

    def translate(
        self,
        query_desc: QueryDescription,
        *,
        db_type: str,
        quote_char: str,
        with_sampling: bool,
        with_optimization: bool,
        optimizer: Optional[object],
    ) -> Tuple[str, List[Dict]]:
        virtual_table = query_desc.virtual_table
        if not virtual_table or virtual_table.mode != "union":
            raise ValueError("Query description must have virtual_table in union mode")

        all_tables = [virtual_table.primary_table] + [ut.table_name for ut in virtual_table.union_tables]
        self._logger.info("Building UNION ALL query for tables: %s", all_tables)

        union_queries: List[str] = []
        for table_name in all_tables:
            if hasattr(query_desc, "model_copy"):
                single_table_desc = query_desc.model_copy(deep=True)
            else:  # pragma: no cover - fallback for Pydantic < 2.0
                single_table_desc = query_desc.copy(deep=True)
            single_table_desc.target_table = table_name
            single_table_desc.virtual_table = None

            has_source_table_dim = any(d.field == "_source_table" for d in single_table_desc.dimensions)
            other_dimensions = [d for d in single_table_desc.dimensions if d.field != "_source_table"]

            if has_source_table_dim and not other_dimensions and not single_table_desc.measures:
                target_db = query_desc.target_database or ""
                if target_db:
                    table_reference = f"{quote_char}{target_db}{quote_char}.{quote_char}{table_name}{quote_char}"
                else:
                    table_reference = f"{quote_char}{table_name}{quote_char}"
                simple_sql = (
                    f"SELECT '{table_name}' AS {quote_char}_source_table{quote_char} "
                    f"FROM {table_reference} LIMIT 1"
                )
                union_queries.append(f"({simple_sql})")
                continue

            single_table_desc.dimensions = other_dimensions
            single_table_desc.filters = [f for f in single_table_desc.filters if f.field != "_source_table"]
            single_table_desc.orderBy = []
            single_table_desc.limit = None
            single_table_desc.offset = None

            single_sql, _ = self._translate_single_table(
                single_table_desc,
                table_name,
                db_type,
                with_sampling=False,
                with_optimization=False,
                optimizer=None,
            )

            if "FROM" in single_sql:
                select_part, from_part = single_sql.split("FROM", 1)
                select_part = select_part.rstrip()
                if select_part.endswith(','):
                    select_part = select_part[:-1]
                modified_sql = (
                    f"{select_part}, '{table_name}' AS {quote_char}_source_table{quote_char} "
                    f"FROM{from_part}"
                )
                union_queries.append(f"({modified_sql})")
            else:
                union_queries.append(f"({single_sql})")

        union_sql = "\nUNION ALL\n".join(union_queries)

        needs_distinct = query_desc.fetch_filter_values is True
        distinct_columns: List[str] = []
        if needs_distinct:
            for dim in query_desc.dimensions:
                if dim.field == "_source_table":
                    continue
                if dim.date_part and dim.date_mode:
                    col_name = f"{dim.field}_{dim.date_part}_{dim.date_mode}"
                else:
                    col_name = dim.field
                distinct_columns.append(f"{quote_char}{col_name}{quote_char}")
            self._logger.info(
                "Filter value query (fetch_filter_values=True) - will apply DISTINCT on: %s",
                distinct_columns,
            )

        source_table_filters = [f for f in query_desc.filters if f.field == "_source_table"]
        needs_outer_query = (
            bool(query_desc.orderBy)
            or query_desc.limit is not None
            or query_desc.offset is not None
            or bool(source_table_filters)
            or needs_distinct
        )

        if needs_outer_query:
            if needs_distinct and distinct_columns:
                columns_list = ", ".join(distinct_columns)
                outer_sql = f"SELECT DISTINCT {columns_list} FROM (\n{union_sql}\n) AS union_result"
                self._logger.info("Applied DISTINCT to filter value query in UNION mode")
            else:
                outer_sql = f"SELECT * FROM (\n{union_sql}\n) AS union_result"

            where_clauses: List[str] = []
            for filt in source_table_filters:
                if filt.operator == '=':
                    where_clauses.append(f"{quote_char}_source_table{quote_char} = '{filt.value}'")
                elif filt.operator == '!=':
                    where_clauses.append(f"{quote_char}_source_table{quote_char} != '{filt.value}'")
                elif filt.operator == 'in':
                    values = "', '".join(str(v) for v in filt.value)
                    where_clauses.append(
                        f"{quote_char}_source_table{quote_char} IN ('{values}')"
                    )
                elif filt.operator == 'not in':
                    values = "', '".join(str(v) for v in filt.value)
                    where_clauses.append(
                        f"{quote_char}_source_table{quote_char} NOT IN ('{values}')"
                    )
                elif filt.operator == 'like':
                    where_clauses.append(
                        f"{quote_char}_source_table{quote_char} LIKE '{filt.value}'"
                    )

            if where_clauses:
                outer_sql += f"\nWHERE {' AND '.join(where_clauses)}"

            if query_desc.orderBy:
                order_fragments = []
                for order in query_desc.orderBy:
                    direction = "DESC" if order.direction == 'desc' else "ASC"
                    order_fragments.append(f"{quote_char}{order.field}{quote_char} {direction}")
                outer_sql += f"\nORDER BY {', '.join(order_fragments)}"

            if query_desc.limit is not None:
                outer_sql += f"\nLIMIT {query_desc.limit}"
                if query_desc.offset:
                    outer_sql += f" OFFSET {query_desc.offset}"

            final_sql = outer_sql
        else:
            final_sql = union_sql

        self._logger.info("Generated UNION ALL query: %s...", final_sql[:200])
        return final_sql, []
