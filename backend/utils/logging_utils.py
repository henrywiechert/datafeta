"""Utilities for safe logging of potentially sensitive data."""

from typing import Any, Dict

SENSITIVE_KEYS = frozenset({
    'password',
    'api_key',
    'connection_string',
    'kaggle_api_key',
    'secret',
    'token',
})


def redact_sensitive(data: Dict[str, Any], replacement: str = '***') -> Dict[str, Any]:
    """Return a shallow copy of the dict with sensitive values masked.
    
    Keys are matched case-insensitively against SENSITIVE_KEYS.
    
    Args:
        data: Dictionary that may contain sensitive values.
        replacement: String to substitute for sensitive values.
        
    Returns:
        New dictionary with sensitive values replaced.
    """
    return {
        k: replacement if k.lower() in SENSITIVE_KEYS else v
        for k, v in data.items()
    }
