"""Utility functions for applying CAST transformations to field references."""

from __future__ import annotations

from typing import Any, Dict, Optional

from backend.services.query_components.terms import CastField


def get_field_with_cast(
    table: Any,
    field_name: str,
    column_casts: Optional[Dict[str, Dict[str, str]]] = None,
) -> Any:
    """
    Get a field reference, applying CAST if configured for this column.
    
    Args:
        table: PyPika Table object
        field_name: Name of the field
        column_casts: Dictionary mapping column names to {cast_type, replacement_pattern}
                     Example: {'Revenue': {'cast_type': 'DOUBLE', 'replacement_pattern': ','}}
    
    Returns:
        PyPika Field object or CastField object
    """
    field = table[field_name]
    return apply_cast_if_configured(field_name, field, column_casts)


def apply_cast_if_configured(
    field_identifier: str,
    field_term: Any,
    column_casts: Optional[Dict[str, Dict[str, str]]],
) -> Any:
    """
    Apply CastField wrapper when a cast configuration exists for the field.
    
    Args:
        field_identifier: The field name/identifier to look up in column_casts
        field_term: PyPika term representing the field
        column_casts: Dictionary mapping column names to cast configurations
        
    Returns:
        Original field_term or CastField-wrapped term
    """
    if not column_casts:
        return field_term

    cast_config = column_casts.get(field_identifier)
    if not cast_config:
        return field_term

    cast_type = cast_config.get('cast_type')
    if not cast_type:
        return field_term

    replacement_pattern = cast_config.get('replacement_pattern')
    return CastField(field_term, cast_type, replacement_pattern)
