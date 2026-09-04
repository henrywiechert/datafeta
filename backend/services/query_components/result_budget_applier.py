# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Apply result budget / sampling strategies to SQL queries."""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, List

if TYPE_CHECKING:
    from backend.dialects import SqlDialect
    from backend.models.query import Dimension, QueryDescription


# Prefix for the helper rank columns added by preserve_extremes. They are
# projected away again, so the prefix only needs to not collide with real
# output column names.
RANK_COLUMN_PREFIX = "__rb_"


def _dimension_output_name(dim: "Dimension") -> str:
    if dim.date_part and dim.date_mode:
        return f"{dim.field}_{dim.date_part}_{dim.date_mode}"
    return dim.field


def _select_region(base_sql: str) -> str:
    from_match = re.search(r"\bFROM\b", base_sql, re.IGNORECASE)
    return base_sql[: from_match.start()] if from_match else base_sql


def _resolve_preserve_quote_fields(
    preserve_fields: list[str] | None,
    query_desc: "QueryDescription",
    select_region: str,
    quote_char: str,
) -> list[str]:
    """
    Map preserve_fields / dimensions to quoted column names present in SELECT.

    Datetime dimensions project aliases like dt_year_distinct, not the raw dt column.
    """
    dims = query_desc.dimensions or []
    resolved: list[str] = []
    seen: set[str] = set()

    def add_if_present(output_name: str) -> None:
        qf = f"{quote_char}{output_name}{quote_char}"
        if qf in select_region and output_name not in seen:
            seen.add(output_name)
            resolved.append(qf)

    if preserve_fields:
        for field in preserve_fields:
            matched = False
            for dim in dims:
                out = _dimension_output_name(dim)
                if field == dim.field or field == out:
                    add_if_present(out)
                    matched = True
            if not matched:
                add_if_present(field)
    else:
        for dim in dims:
            if dim.flavour != "continuous":
                continue
            if dim.date_mode == "distinct":
                continue
            add_if_present(_dimension_output_name(dim))

    return resolved


def apply_result_budget(
    sql: str,
    query_desc: QueryDescription,
    *,
    dialect: "SqlDialect",
    logger: logging.Logger | None = None,
) -> str:
    """
    Apply result budget / sampling to SQL queries.
    
    Supports strategies:
    - 'none': No sampling
    - 'random': Random sampling with ORDER BY rand() LIMIT n
    - 'stratified': Proportional sampling across categories (window functions)
    - 'preserve_extremes': Include min/max rows for stable axis scales
    
    Args:
        sql: The SQL query to apply budget to
        query_desc: Query description containing result_budget settings
        dialect: SQL dialect for database-specific syntax
        logger: Optional logger instance
        
    Returns:
        SQL with result budget applied
    """
    logger = logger or logging.getLogger(__name__)
    
    budget = getattr(query_desc, "result_budget", None)
    if not budget:
        return sql
    if not getattr(budget, "max_rows", None) or budget.strategy == "none":
        return sql

    max_rows = int(budget.max_rows)
    strategy = budget.strategy
    stratify_field = getattr(budget, "stratify_field", None)
    min_per = int(getattr(budget, "min_per_stratum", None) or 0)
    base_sql = sql.strip().rstrip(";")

    # --- Stratified sampling ---
    if strategy == "stratified" and stratify_field:
        result = _apply_stratified_sampling(
            base_sql, stratify_field, max_rows, min_per, dialect, logger
        )
        if result is not None:
            return result
        strategy = "random"

    # --- Preserve extremes ---
    if strategy == "preserve_extremes":
        result = _apply_preserve_extremes(
            base_sql, query_desc, max_rows, dialect, logger
        )
        if result is not None:
            return result
        strategy = "random"

    # --- Fallback: random global sample ---
    rand_func = dialect.random_func_name()
    return f'SELECT * FROM (\n{base_sql}\n) AS base\nORDER BY {rand_func}()\nLIMIT {max_rows}'


def _apply_stratified_sampling(
    base_sql: str,
    stratify_field: str,
    max_rows: int,
    min_per: int,
    dialect: "SqlDialect",
    logger: logging.Logger,
) -> str | None:
    """
    Apply stratified sampling with window functions.
    
    Preserves proportions across discrete categories.
    
    Returns:
        SQL string with stratified sampling, or None if stratify field not found.
    """
    quote_char = dialect.quote_char
    qf = f"{quote_char}{stratify_field}{quote_char}"
    
    select_region = _select_region(base_sql)
    
    if qf not in select_region:
        logger.warning(
            "Result budget stratified sampling requested, but stratify field %s not present in SELECT; "
            "falling back to random sampling.",
            stratify_field,
        )
        return None

    rand_func = f"{dialect.random_func_name()}()"

    # Floor at one row per stratum. The proportional target truncates to 0 for
    # any category holding less than 1/max_rows of the rows, which removes the
    # category from the chart entirely (a whole tick strip disappears) -- far
    # more misleading than the handful of extra rows this costs.
    floor_per = max(min_per, 1)

    # Integer truncation: ClickHouse uses intDiv, others use cast
    if dialect.name == "clickhouse":
        target_expr = f"greatest({floor_per}, intDiv({max_rows} * cat_cnt, total_cnt))"
    else:
        target_expr = f"greatest({floor_per}, cast({max_rows} * cat_cnt / total_cnt as integer))"

    return f"""
SELECT * FROM (
  SELECT
    base.*,
    row_number() OVER (PARTITION BY {qf} ORDER BY {rand_func}) AS rn,
    count(*) OVER (PARTITION BY {qf}) AS cat_cnt,
    count(*) OVER () AS total_cnt
  FROM (
    {base_sql}
  ) AS base
) AS sampled
WHERE rn <= {target_expr}
""".strip()


def _apply_preserve_extremes(
    base_sql: str,
    query_desc: "QueryDescription",
    max_rows: int,
    dialect: "SqlDialect",
    logger: logging.Logger,
) -> str | None:
    """
    Apply preserve_extremes sampling strategy.

    Preserves min/max rows for stable axis scales in scatter plots.

    The base query is evaluated exactly once: rows are ranked by every preserve
    column (ascending and descending) and by a random ordering in a single
    window pass, then the extremes and the random sample are selected from that
    one ranked set. A CTE/subquery is inlined at each reference rather than
    materialised, so ranking in one pass avoids re-running the (potentially
    join-heavy) base query per branch, and selecting from a single ranked set
    means an extreme row can never also come back as part of the sample.

    Returns:
        SQL string with extremes preserved, or None if no continuous fields found.
    """
    budget = query_desc.result_budget
    preserve_fields = getattr(budget, "preserve_fields", None)

    quote_char = dialect.quote_char
    select_region = _select_region(base_sql)
    quoted_columns = _resolve_preserve_quote_fields(
        preserve_fields, query_desc, select_region, quote_char
    )

    if not quoted_columns:
        logger.info(
            "preserve_extremes: no preserve columns found in SELECT; falling back to random"
        )
        return None

    rand_func = f"{dialect.random_func_name()}()"

    rank_exprs: List[str] = []
    rank_names: List[str] = []
    keep_predicates: List[str] = []

    def add_rank(name: str, order_sql: str, predicate_tmpl: str) -> None:
        quoted_name = f"{quote_char}{name}{quote_char}"
        rank_names.append(name)
        rank_exprs.append(f"row_number() OVER (ORDER BY {order_sql}) AS {quoted_name}")
        keep_predicates.append(predicate_tmpl.format(col=quoted_name))

    for idx, qf in enumerate(quoted_columns):
        add_rank(f"{RANK_COLUMN_PREFIX}min_{idx}", f"{qf} ASC", "{col} = 1")
        add_rank(f"{RANK_COLUMN_PREFIX}max_{idx}", f"{qf} DESC", "{col} = 1")

    # Extremes are kept on top of the sample, so reserve their slots to stay
    # within max_rows.
    sample_limit = max(1, max_rows - len(quoted_columns) * 2)
    add_rank(f"{RANK_COLUMN_PREFIX}sample", rand_func, "{col} <= " + str(sample_limit))

    ranked_select = ",\n    ".join(rank_exprs)
    keep_clause = "\n   OR ".join(keep_predicates)

    return f"""SELECT {dialect.star_except(rank_names)} FROM (
  SELECT
    *,
    {ranked_select}
  FROM (
{base_sql}
  ) AS base
) AS ranked
WHERE {keep_clause}
ORDER BY {quoted_columns[0]} ASC""".strip()
