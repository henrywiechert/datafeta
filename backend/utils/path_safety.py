# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Filesystem path validation helpers for connectors that accept local paths."""

from __future__ import annotations

import os
from typing import List, Optional


def is_path_within_directory(path: str, directory: str) -> bool:
    """Return True if *path* resolves inside *directory* (symlink-safe)."""
    try:
        directory_real = os.path.realpath(directory)
        path_real = os.path.realpath(path)
        return os.path.commonpath([directory_real]) == os.path.commonpath([directory_real, path_real])
    except Exception:
        return False


def parse_allowed_roots(raw: Optional[str]) -> List[str]:
    """Parse a comma-separated allowlist of directory roots."""
    if not raw:
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


def is_path_within_any_root(path: str, roots: List[str]) -> bool:
    """Return True if *path* is under any of the given root directories."""
    if not roots:
        return True
    return any(is_path_within_directory(path, root) for root in roots)
