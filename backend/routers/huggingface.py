# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""API router for HuggingFace dataset operations."""

import logging
from typing import Any, Dict

from fastapi import APIRouter, Body

from backend.services.huggingface_search_service import HuggingFaceSearchService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/search")
async def search_huggingface_datasets(
    search_request: Dict[str, Any] = Body(...)
):
    """
    Search public HuggingFace datasets.

    Request body:
        token: Optional HuggingFace access token
        search_query: Search keywords
        max_results: Maximum number of results to return (default: 100, max: 200)
    """
    token = search_request.get("token")
    search_query = search_request.get("search_query", "").strip()
    max_results = search_request.get("max_results", 100)

    service = HuggingFaceSearchService()
    return await service.search_datasets(
        token=token,
        search_query=search_query,
        max_results=max_results,
    )


@router.post("/splits")
async def list_huggingface_dataset_splits(
    split_request: Dict[str, Any] = Body(...)
):
    """
    List Parquet-backed split tables in a HuggingFace dataset.

    Request body:
        token: Optional HuggingFace access token
        dataset: Dataset reference (owner/dataset-name)
    """
    token = split_request.get("token")
    dataset = split_request.get("dataset")

    service = HuggingFaceSearchService()
    return await service.list_dataset_splits(token=token, dataset=dataset)
