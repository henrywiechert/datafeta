# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Apply result budget / sampling strategies to SQL queries."""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.dialects import SqlDialect
    from backend.models.query import Dimension, QueryDescription


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
    
    # Integer truncation: ClickHouse uses intDiv, others use cast
    if dialect.name == "clickhouse":
        target_expr = f"greatest({min_per}, intDiv({max_rows} * cat_cnt, total_cnt))"
    else:
        target_expr = f"greatest({min_per}, cast({max_rows} * cat_cnt / total_cnt as integer))"

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

    extreme_ctes = []
    extreme_names = []

    for idx, qf in enumerate(quoted_columns):
        min_name = f"min_{idx}"
        max_name = f"max_{idx}"
        extreme_names.extend([min_name, max_name])
        extreme_ctes.append(f"{min_name} AS (SELECT * FROM base ORDER BY {qf} ASC LIMIT 1)")
        extreme_ctes.append(f"{max_name} AS (SELECT * FROM base ORDER BY {qf} DESC LIMIT 1)")

    reserved_for_extremes = len(quoted_columns) * 2
    sample_limit = max(1, max_rows - reserved_for_extremes)

    final_selects = [f"SELECT * FROM {name}" for name in extreme_names]
    final_selects.append("SELECT * FROM sample")

    extreme_ctes_str = ",\n".join(extreme_ctes)
    final_union = "\nUNION ALL\n".join(final_selects)

    return f"""WITH base AS (
{base_sql}
),
{extreme_ctes_str},
sample AS (
SELECT * FROM base ORDER BY {rand_func} LIMIT {sample_limit}
)
{final_union}""".strip()
