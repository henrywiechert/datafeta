# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Parser for field references with support for table prefixes and nested columns."""

import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class FieldReferenceParser:
    """
    Parses field references that may include table prefixes (e.g., 'customers.name').
    
    Handles complex scenarios:
    - Multi-table queries with explicit table prefixes
    - Single-table queries with nested/dotted column names (e.g., ClickHouse nested structures)
    - Virtual columns that need to be resolved differently
    
    The parser distinguishes between:
    a) Real table prefix for multi-table queries: 'orders.amount' where 'orders' is a joined table
    b) Column name with periods in a single-table query: 'tableName.measurement.field' is the full column name
    """
    
    def __init__(
        self,
        table_map: Dict[str, Any],
        default_table: Any,
        vc_builder: Optional[Any] = None
    ):
        """
        Initialize the field reference parser.
        
        Args:
            table_map: Dictionary mapping table names to PyPika Table objects
            default_table: Default table to use if no prefix specified
            vc_builder: Optional VirtualColumnExpressionBuilder for resolving virtual columns
        """
        self.table_map = table_map
        self.default_table = default_table
        self.vc_builder = vc_builder
        
        # Cache default table name for comparison
        self.default_table_name = self._find_default_table_name()
        self.is_multi_table = len(table_map) > 1
    
    def _find_default_table_name(self) -> Optional[str]:
        """Find the name associated with the default table object."""
        for tname, tobj in self.table_map.items():
            if tobj == self.default_table:
                return tname
        return None
    
    def parse(self, field_name: str) -> Any:
        """
        Parse a field reference and return the appropriate PyPika Field object.
        
        Strategy:
        - Check if it's a virtual column first
        - In multi-table queries: Parse as table.column if the prefix matches a known table
        - In single-table queries: Treat the entire field name as a column name (don't split)
          Exception: If the prefix matches a table OTHER than the default table, still split
        
        Args:
            field_name: Field name, optionally with table prefix
            
        Returns:
            PyPika Field object or virtual column expression
        """
        # Check if this is a virtual column first
        if self.vc_builder and self.vc_builder.is_virtual_column(field_name):
            vc_term = self.vc_builder.get_virtual_column_term(field_name)
            if vc_term:
                logger.debug(f"Resolved '{field_name}' as virtual column")
                return vc_term
        
        # Handle dotted field names (potential table prefix or nested column name)
        if '.' in field_name:
            parts = field_name.split('.', 1)
            if len(parts) == 2:
                potential_table_name, remaining = parts
                
                # Check if this looks like a table prefix
                is_table_prefix = potential_table_name in self.table_map
                
                if is_table_prefix:
                    # Only split if:
                    # 1. It's a multi-table query, OR
                    # 2. The potential table name is different from the default table
                    #    (this would be unusual but possible in edge cases)
                    if self.is_multi_table or potential_table_name != self.default_table_name:
                        # Treat as table.column reference
                        logger.debug(
                            f"Splitting field '{field_name}' into table '{potential_table_name}' "
                            f"and column '{remaining}'"
                        )
                        return self.table_map[potential_table_name][remaining]
                    else:
                        # Single-table query and the prefix matches our only table
                        # This means the column name itself includes the table prefix
                        # Don't split - use the full name as column
                        logger.debug(
                            f"Single-table query: treating '{field_name}' as full column name (not splitting)"
                        )
                        return self.default_table[field_name]
                else:
                    # Not a known table prefix - use full name as column
                    logger.debug(
                        f"'{potential_table_name}' not in table_map, "
                        f"using full field name '{field_name}' as column"
                    )
                    return self.default_table[field_name]
        
        # No periods - simple column name
        return self.default_table[field_name]
