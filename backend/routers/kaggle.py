# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""API router for Kaggle dataset operations."""

import logging
from typing import Any, Dict

from fastapi import APIRouter, Body

from backend.exceptions import InvalidInputError
from backend.services.kaggle_search_service import KaggleSearchService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/search")
async def search_kaggle_datasets(
    search_request: Dict[str, Any] = Body(...)
):
    """
    Search public Kaggle datasets.
    
    Request body:
        username: Kaggle username
        api_key: Kaggle API key
        search_query: Search keywords or dataset reference (owner/dataset-name)
        max_results: Maximum number of results to return (default: 100, max: 1000)
    
    Returns list of matching datasets with metadata.
    
    Optimizations to reduce API calls and avoid rate limits:
    - Results are cached for 10 minutes (per user + query combination)
    - File counts are only fetched for the first 50 datasets
    - Small delays added between file listing calls (500ms per 10 calls)
    - Stops fetching file counts if rate limit is hit
    
    Note: If search_query looks like a dataset reference (contains '/'),
    it will attempt direct lookup. Otherwise, uses Kaggle API keyword search.
    """
    username = search_request.get('username')
    api_key = search_request.get('api_key')
    search_query = search_request.get('search_query', '').strip()
    max_results = search_request.get('max_results', 100)
    
    service = KaggleSearchService()
    return await service.search_datasets(
        username=username,
        api_key=api_key,
        search_query=search_query,
        max_results=max_results
    )


@router.post("/files")
async def list_kaggle_dataset_files(
    file_request: Dict[str, Any] = Body(...)
):
    """
    List CSV files in a specific Kaggle dataset.
    
    Request body:
        username: Kaggle username
        api_key: Kaggle API key
        dataset: Dataset reference (owner/dataset-name)
    
    Returns list of CSV files with sizes.
    """
    username = file_request.get('username')
    api_key = file_request.get('api_key')
    dataset = file_request.get('dataset')
    
    service = KaggleSearchService()
    return await service.list_dataset_files(
        username=username,
        api_key=api_key,
        dataset=dataset
    )

