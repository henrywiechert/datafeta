"""Shared context dataclasses for QueryService builders."""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from pypika import Query


@dataclass
class TableContext:
    """Holds table references derived from the query description."""

    query: Query
    table_map: Dict[str, Any]
    default_table: Any
    primary_table: Any


@dataclass
class OptimizationContext:
    """Metadata derived from optimizer configuration and strategy hooks."""

    plan: Optional[Any]
    rounding_config: Dict[str, Any]
    binning_config: Dict[str, Any]
    use_category_dedup: bool


@dataclass
class SelectClauseResult:
    """Structured return for SELECT clause assembly."""

    fields: List[Any]
    aliases: set[str]
    groupby_field_info_for_dedup: List[Tuple[str, Optional[Any]]]
