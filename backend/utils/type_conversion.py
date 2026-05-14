# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""
Utility functions for type conversion in data processing.

DateTime Parts Handling:
- Distinct mode datetime parts return integers (e.g., month: 1-12) or native types
- Timeline mode datetime parts return formatted strings (e.g., "2023-03", "2023-03-15")
- Both integer and string types are natively JSON serializable and require no conversion
"""

import math
from decimal import Decimal
from typing import Any, Dict, List

MAX_JS_SAFE_INT = 9_007_199_254_740_991  # 2^53 - 1


def _unwrap_quoted_string(s: str) -> str:
    # Handle values like '"123"' or "'123'" (quotes included)
    s2 = s.strip()
    if (s2.startswith('"') and s2.endswith('"')) or (s2.startswith("'") and s2.endswith("'")):
        return s2[1:-1].strip()
    # Handle values like '\\"123\\"' or "\\'123\\'" where backslashes are literal chars
    if (s2.startswith('\\"') and s2.endswith('\\"')) or (s2.startswith("\\'") and s2.endswith("\\'")):
        return s2[2:-2].strip()
    return s2


def convert_decimal_to_float(value: Any) -> Any:
    """
    Convert Decimal types to float for JSON serialization compatibility.
    NaN and Inf float values are converted to None (JSON null) because they
    are not valid JSON and would otherwise be serialized as the bare token
    `NaN` / `Infinity`, which breaks JSON parsers.
    
    Args:
        value: Any value that might be a Decimal or non-finite float
        
    Returns:
        The value converted to float if it was a Decimal, None if NaN/Inf,
        otherwise unchanged
    """
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, Decimal):
        f = float(value)
        return None if not math.isfinite(f) else f
    # Normalize suspicious numeric strings that arrive double-quoted (common with some CH types/expressions)
    if isinstance(value, str):
        s = _unwrap_quoted_string(value)
        # Only convert if it looks fully numeric (avoid datetimes/ids with suffixes)
        # Allow ints, floats, and scientific notation.
        import re
        if re.fullmatch(r"-?\d+(\.\d+)?([eE][+-]?\d+)?", s or ""):
            # Prefer int when possible
            if re.fullmatch(r"-?\d+", s):
                try:
                    i = int(s)
                    # Avoid creating unsafe JS numbers; return string instead.
                    if abs(i) > MAX_JS_SAFE_INT:
                        return str(i)
                    return i
                except Exception:
                    return value
            try:
                f = float(s)
                return f
            except Exception:
                return value
    return value


def process_row_data(row: Dict[str, Any]) -> Dict[str, Any]:
    """
    Process a single data row to convert any Decimal values to floats.
    
    Args:
        row: A dictionary representing a single row of data
        
    Returns:
        A new dictionary with Decimal values converted to floats
    """
    return {
        key: convert_decimal_to_float(value)
        for key, value in row.items()
    }


def process_query_result_data(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Process query result data to convert any Decimal values to floats.
    
    Args:
        rows: List of dictionaries representing query result rows
        
    Returns:
        A new list with all Decimal values converted to floats
    """
    return [process_row_data(row) for row in rows]