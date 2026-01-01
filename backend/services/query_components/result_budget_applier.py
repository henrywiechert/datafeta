"""Apply result budget / sampling strategies to SQL queries."""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.models.query import QueryDescription


def apply_result_budget(
    sql: str,
    query_desc: QueryDescription,
    *,
    db_type: str,
    quote_char: str,
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
        db_type: Database type (e.g., 'clickhouse', 'duckdb')
        quote_char: Quote character for identifiers
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

    # Result budget can be applied to both raw (dimension-only) and aggregated queries.
    # While aggregated queries often reduce data via GROUP BY, fine-grained grouping
    # (e.g., millisecond timestamps + multiple dimensions) can still produce millions of rows.
    # The frontend explicitly requests a budget when it expects many results, so we honor it.
    #
    # Note: For aggregated queries, random sampling may affect totals, but this is acceptable
    # for visualization purposes where we need to limit rendering to a reasonable row count.

    max_rows = int(budget.max_rows)
    strategy = budget.strategy
    stratify_field = getattr(budget, "stratify_field", None)
    min_per = int(getattr(budget, "min_per_stratum", None) or 0)
    base_sql = sql.strip().rstrip(";")

    # --- Stratified sampling ---
    if strategy == "stratified" and stratify_field:
        result = _apply_stratified_sampling(
            base_sql, stratify_field, max_rows, min_per, db_type, quote_char, logger
        )
        if result is not None:
            return result
        # If stratified failed (field not in SELECT), fall through to random
        strategy = "random"

    # --- Preserve extremes ---
    if strategy == "preserve_extremes":
        result = _apply_preserve_extremes(
            base_sql, query_desc, max_rows, db_type, quote_char, logger
        )
        if result is not None:
            return result
        # If no fields to preserve, fall through to random
        strategy = "random"

    # --- Fallback: random global sample ---
    rand_func = "rand" if db_type == "clickhouse" else "random"
    return f'SELECT * FROM (\n{base_sql}\n) AS base\nORDER BY {rand_func}()\nLIMIT {max_rows}'


def _apply_stratified_sampling(
    base_sql: str,
    stratify_field: str,
    max_rows: int,
    min_per: int,
    db_type: str,
    quote_char: str,
    logger: logging.Logger,
) -> str | None:
    """
    Apply stratified sampling with window functions.
    
    Preserves proportions across discrete categories.
    
    Returns:
        SQL string with stratified sampling, or None if stratify field not found.
    """
    qf = f"{quote_char}{stratify_field}{quote_char}"
    
    # Defensive: only stratify if the stratify field is actually projected by the base query.
    # In UNION / multi-table scenarios a table-qualified stratify field may be absent
    # from some per-table queries, which would make the window PARTITION BY fail.
    from_match = re.search(r"\bFROM\b", base_sql, re.IGNORECASE)
    select_region = base_sql[: from_match.start()] if from_match else base_sql
    
    if qf not in select_region:
        logger.warning(
            "Result budget stratified sampling requested, but stratify field %s not present in SELECT; "
            "falling back to random sampling.",
            stratify_field,
        )
        return None

    # ClickHouse uses rand(); DuckDB uses random().
    rand_func = "rand()" if db_type == "clickhouse" else "random()"
    
    # Use integer truncation for target rows per stratum.
    if db_type == "clickhouse":
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
    query_desc: QueryDescription,
    max_rows: int,
    db_type: str,
    quote_char: str,
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
    
    if not preserve_fields:
        # Auto-detect: use continuous dimensions
        preserve_fields = [
            d.field for d in query_desc.dimensions
            if d.flavour == 'continuous'
        ]

    if not preserve_fields:
        logger.info("preserve_extremes: no continuous fields found, falling back to random")
        return None

    rand_func = "rand()" if db_type == "clickhouse" else "random()"

    # Build CTE-based query that preserves extremes
    # LIMIT 1 is critical: many rows may share the same min/max value
    extreme_selects = []
    for field in preserve_fields:
        qf = f"{quote_char}{field}{quote_char}"
        extreme_selects.append(
            f"SELECT * FROM base WHERE {qf} = (SELECT MIN({qf}) FROM base) LIMIT 1"
        )
        extreme_selects.append(
            f"SELECT * FROM base WHERE {qf} = (SELECT MAX({qf}) FROM base) LIMIT 1"
        )

    extremes_union = "\nUNION ALL\n".join(extreme_selects)
    reserved_for_extremes = len(preserve_fields) * 2
    sample_limit = max(1, max_rows - reserved_for_extremes)

    return f"""WITH base AS (
{base_sql}
),
extremes AS (
{extremes_union}
),
sample AS (
SELECT * FROM base ORDER BY {rand_func} LIMIT {sample_limit}
)
SELECT * FROM extremes
UNION ALL
SELECT * FROM sample""".strip()
