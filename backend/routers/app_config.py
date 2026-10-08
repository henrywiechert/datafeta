# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Public runtime configuration endpoint."""

from fastapi import APIRouter

from backend.config import public_app_config
from backend.connectors.file_handlers import file_format_catalog


router = APIRouter()


@router.get("/app-config")
def get_app_config() -> dict:
    """Return public runtime capabilities for the frontend.

    ``fileFormats`` lists the registered upload formats, so file pickers,
    labels and option panels follow the backend's handler registry.
    """
    return {**public_app_config(), "fileFormats": file_format_catalog()}