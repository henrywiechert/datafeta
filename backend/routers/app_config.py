# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Public runtime configuration endpoint."""

from fastapi import APIRouter

from backend.config import public_app_config


router = APIRouter()


@router.get("/app-config")
def get_app_config() -> dict:
    """Return public runtime capabilities for the frontend."""
    return public_app_config()