"""Apply result budget / sampling strategies to SQL queries."""

from __future__ import annotations

import logging
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
    Apply result budget / sampling to the final UNION SQL.
    
    Supports strategies:
    - 'none': No sampling
    - 'random': Random sampling with ORDER BY rand() LIMIT n
    - 'stratified': Proportional sampling across categories
    - 'preserve_extremes': Include min/max rows for stable axis scales
    
    Args:
        sql: The SQL query to apply budget to
        query_desc: Query description containing result_budget settings
        db_type: Database type (e.g., 'clickhouse')
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

    # Only apply to "raw" queries (no measures = dimension-only scatter/tick plots)
    if query_desc.measures:
        return sql

    max_rows = int(budget.max_rows)
    strategy = budget.strategy
    base_sql = sql.strip().rstrip(";")

    if strategy == "preserve_extremes":
        # Preserve min/max rows for stable axis scales in scatter plots
        preserve_fields = budget.preserve_fields
        if not preserve_fields:
            # Auto-detect: use continuous dimensions
            preserve_fields = [
                d.field for d in query_desc.dimensions
                if d.flavour == 'continuous'
            ]

        if not preserve_fields:
            logger.info("preserve_extremes: no continuous fields found, falling back to random")
            strategy = "random"
        else:
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

    # Fallback: random global sample to max_rows
    rand_func = "rand" if db_type == "clickhouse" else "random"
    return f'SELECT * FROM (\n{base_sql}\n) AS base\nORDER BY {rand_func}()\nLIMIT {max_rows}'
