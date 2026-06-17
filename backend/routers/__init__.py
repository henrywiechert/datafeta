# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""API routers for the data analytics platform."""

from . import connection, metadata, query, relationships, kaggle, huggingface, snapshot

__all__ = ["connection", "metadata", "query", "relationships", "kaggle", "huggingface", "snapshot"]

