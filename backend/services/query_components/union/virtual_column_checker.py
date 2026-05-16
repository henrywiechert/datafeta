# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Check virtual column computability for specific tables."""

from __future__ import annotations

import logging
import re
from typing import Dict, List, Optional, Set


# SQL keywords to filter out when parsing expressions
SQL_KEYWORDS = {
    'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'AND', 'OR', 'NOT',
    'IS', 'NULL', 'TRUE', 'FALSE', 'IN', 'BETWEEN', 'LIKE',
    'ASC', 'DESC', 'AS', 'FROM', 'WHERE', 'GROUP', 'ORDER', 'BY',
}

# Function names to filter out when parsing expressions
FUNCTION_NAMES = {
    'ROUND', 'ABS', 'COALESCE', 'CONCAT', 'UPPER', 'LOWER',
    'LENGTH', 'SUBSTRING', 'CAST', 'SUM', 'AVG', 'COUNT', 
    'MIN', 'MAX', 'FLOOR', 'CEIL', 'SQRT', 'POW', 'MOD', 'SPLIT', 'INT',
}
BUILTIN_SOURCE_FIELDS = {'_source_database', '_source_table'}


def _strip_string_literals(expression: str) -> str:
    """Remove single-quoted SQL string literals before identifier matching."""
    return re.sub(r"'(?:''|[^'])*'", ' ', expression)


def get_virtual_column_source_fields(
    virtual_columns: Optional[List],
    logger: Optional[logging.Logger] = None,
) -> Dict[str, List[str]]:
    """
    Extract source field names for each virtual column.
    
    This is used to determine if a virtual column can be computed
    from the columns available in a specific table.
    
    Args:
        virtual_columns: List of VirtualColumnDefinition objects
        logger: Optional logger instance
        
    Returns:
        Dictionary mapping virtual column name -> list of source field names
    """
    logger = logger or logging.getLogger(__name__)
    
    if not virtual_columns:
        return {}
    
    vc_source_map: Dict[str, List[str]] = {}
    for vc in virtual_columns:
        # Extract field references from expression using regex
        # Pattern matches identifiers: word or word.word.word... (any number of dot-separated parts)
        expression = _strip_string_literals(vc.expression)
        pattern = r'\b([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\b'
        matches = re.findall(pattern, expression)
        
        source_fields = []
        for match in matches:
            if match.upper() not in SQL_KEYWORDS and match.upper() not in FUNCTION_NAMES:
                if match not in source_fields:
                    source_fields.append(match)
        
        vc_source_map[vc.name] = source_fields
        logger.debug(f"Virtual column '{vc.name}' depends on fields: {source_fields}")
    
    return vc_source_map


def can_compute_virtual_column(
    vc_name: str,
    vc_source_map: Dict[str, List[str]],
    table_columns: Set[str],
) -> bool:
    """
    Check if a virtual column can be computed from available table columns.
    
    Args:
        vc_name: Name of the virtual column
        vc_source_map: Map of virtual column name -> source fields
        table_columns: Set of columns available in the table
        
    Returns:
        True if all source fields exist in the table
    """
    if not table_columns:
        # No column info available - assume it can be computed (backward compatibility)
        return True

    source_fields = vc_source_map.get(vc_name, [])
    if not source_fields:
        # Constant/fieldless virtual columns are computable everywhere
        return True

    # Check if ALL source fields exist in the table
    return all(field in BUILTIN_SOURCE_FIELDS or field in table_columns for field in source_fields)
