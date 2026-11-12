# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
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


def _is_sensitive(key: str) -> bool:
    lowered = key.lower()
    return lowered in SENSITIVE_KEYS or any(lowered.endswith(f"_{k}") for k in SENSITIVE_KEYS)


def redact_sensitive(data: Dict[str, Any], replacement: str = '***') -> Dict[str, Any]:
    """Return a shallow copy of the dict with sensitive values masked.
    
    Keys are matched case-insensitively against SENSITIVE_KEYS, also as a
    ``_``-separated suffix (``hf_token``, ``influx_password``).
    
    Args:
        data: Dictionary that may contain sensitive values.
        replacement: String to substitute for sensitive values.
        
    Returns:
        New dictionary with sensitive values replaced.
    """
    return {
        k: replacement if _is_sensitive(k) else v
        for k, v in data.items()
    }
