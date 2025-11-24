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

        # Build list of (database, table_name) tuples for all tables in the union
        # Primary table uses target_database from query_desc
        primary_db = query_desc.target_database or ""
        
        # Parse primary table in case it's also a qualified name
        if not primary_db and '.' in virtual_table.primary_table:
            parts = virtual_table.primary_table.split('.', 1)
            if len(parts) == 2:
                primary_db, primary_table = parts
                table_refs = [(primary_db, primary_table)]
            else:
                table_refs = [(primary_db, virtual_table.primary_table)]
        else:
            table_refs = [(primary_db, virtual_table.primary_table)]
        
        # Union tables can specify their own database
        for ut in virtual_table.union_tables:
            self._logger.info(f"Processing union table: table_name='{ut.table_name}', database='{ut.database}', type={type(ut.database)}, is_none={ut.database is None}")
            # If table_name contains a dot and no explicit database is provided,
            # treat it as a fully qualified database.table reference
            if (ut.database is None or ut.database == "") and '.' in ut.table_name:
                parts = ut.table_name.split('.', 1)
                if len(parts) == 2:
                    db, table = parts
                    self._logger.info(f"Parsed qualified table name '{ut.table_name}' -> database='{db}', table='{table}'")
                    table_refs.append((db, table))
                else:
                    # Shouldn't happen, but fallback to using primary_db
                    db = primary_db
                    self._logger.info(f"Failed to parse qualified name, using primary_db='{primary_db}'")
                    table_refs.append((db, ut.table_name))
            else:
                db = ut.database if ut.database else primary_db
                self._logger.info(f"Using database '{db}' for table '{ut.table_name}' (ut.database='{ut.database}', primary_db='{primary_db}')")
                table_refs.append((db, ut.table_name))
        
        self._logger.info("Building UNION ALL query for tables: %s", 
                         [f"{db}.{tbl}" if db else tbl for db, tbl in table_refs])

        union_queries: List[str] = []
        for database, table_name in table_refs:
            if hasattr(query_desc, "model_copy"):
                single_table_desc = query_desc.model_copy(deep=True)
            else:  # pragma: no cover - fallback for Pydantic < 2.0
                single_table_desc = query_desc.copy(deep=True)
            single_table_desc.target_table = table_name
            single_table_desc.target_database = database
            single_table_desc.virtual_table = None

            # Check for source tracking dimensions
            has_source_db_dim = any(d.field == "_source_database" for d in single_table_desc.dimensions)
            has_source_table_dim = any(d.field == "_source_table" for d in single_table_desc.dimensions)
            other_dimensions = [d for d in single_table_desc.dimensions 
                              if d.field not in ("_source_database", "_source_table")]

            # Special case: only source tracking columns requested
            if (has_source_db_dim or has_source_table_dim) and not other_dimensions and not single_table_desc.measures:
                # Build table reference (database and table_name are already properly parsed)
                if database:
                    table_reference = f"{quote_char}{database}{quote_char}.{quote_char}{table_name}{quote_char}"
                else:
                    table_reference = f"{quote_char}{table_name}{quote_char}"
                
                source_cols = []
                if has_source_db_dim:
                    source_cols.append(f"'{database}' AS {quote_char}_source_database{quote_char}")
                if has_source_table_dim:
                    source_cols.append(f"'{table_name}' AS {quote_char}_source_table{quote_char}")
                
                simple_sql = f"SELECT {', '.join(source_cols)} FROM {table_reference} LIMIT 1"
                union_queries.append(f"({simple_sql})")
                continue

            single_table_desc.dimensions = other_dimensions
            # Filter out source tracking filters (handled in outer query)
            single_table_desc.filters = [f for f in single_table_desc.filters 
                                        if f.field not in ("_source_database", "_source_table")]
            single_table_desc.orderBy = []
            single_table_desc.limit = None
            single_table_desc.offset = None

            single_sql, _ = self._translate_single_table(
                single_table_desc,
                table_name,
                db_type,
                with_sampling=with_sampling,
                with_optimization=with_optimization,
                optimizer=optimizer,
            )

            # Add source tracking columns to the query
            if "FROM" in single_sql:
                select_part, from_part = single_sql.split("FROM", 1)
                select_part = select_part.rstrip()
                if select_part.endswith(','):
                    select_part = select_part[:-1]
                
                # Add both _source_database and _source_table
                modified_sql = (
                    f"{select_part}, "
                    f"'{database}' AS {quote_char}_source_database{quote_char}, "
                    f"'{table_name}' AS {quote_char}_source_table{quote_char} "
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
                # Skip source tracking columns in distinct list
                if dim.field in ("_source_database", "_source_table"):
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

        # Get filters for source tracking columns
        source_db_filters = [f for f in query_desc.filters if f.field == "_source_database"]
        source_table_filters = [f for f in query_desc.filters if f.field == "_source_table"]
        needs_outer_query = (
            bool(query_desc.orderBy)
            or query_desc.limit is not None
            or query_desc.offset is not None
            or bool(source_db_filters)
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
            
            # Handle _source_database filters
            for filt in source_db_filters:
                if filt.operator == '=':
                    where_clauses.append(f"{quote_char}_source_database{quote_char} = '{filt.value}'")
                elif filt.operator == '!=':
                    where_clauses.append(f"{quote_char}_source_database{quote_char} != '{filt.value}'")
                elif filt.operator == 'in':
                    values = "', '".join(str(v) for v in filt.value)
                    where_clauses.append(
                        f"{quote_char}_source_database{quote_char} IN ('{values}')"
                    )
                elif filt.operator == 'not in':
                    values = "', '".join(str(v) for v in filt.value)
                    where_clauses.append(
                        f"{quote_char}_source_database{quote_char} NOT IN ('{values}')"
                    )
                elif filt.operator == 'like':
                    where_clauses.append(
                        f"{quote_char}_source_database{quote_char} LIKE '{filt.value}'"
                    )
            
            # Handle _source_table filters
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
