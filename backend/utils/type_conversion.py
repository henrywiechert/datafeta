"""
Utility functions for type conversion in data processing.

DateTime Parts Handling:
- Distinct mode datetime parts return integers (e.g., month: 1-12) or native types
- Timeline mode datetime parts return formatted strings (e.g., "2023-03", "2023-03-15")
- Both integer and string types are natively JSON serializable and require no conversion
"""

from decimal import Decimal
from typing import Any, Dict, List


def convert_decimal_to_float(value: Any) -> Any:
    """
    Convert Decimal types to float for JSON serialization compatibility.
    
    Args:
        value: Any value that might be a Decimal
        
    Returns:
        The value converted to float if it was a Decimal, otherwise unchanged
    """
    if isinstance(value, Decimal):
        return float(value)
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