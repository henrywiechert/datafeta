# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Service for searching HuggingFace datasets and listing Parquet-backed splits."""
from __future__ import annotations

import hashlib
import importlib
import logging
import os
import re
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

import requests

from backend.exceptions import DataSourceConnectionError, InvalidInputError

logger = logging.getLogger(__name__)

HF_DATASETS_SERVER = "https://datasets-server.huggingface.co"
DEFAULT_MAX_SPLIT_BYTES = int(os.getenv("HF_MAX_SPLIT_BYTES_MB", "500")) * 1024 * 1024


class HuggingFaceSearchCache:
    """Simple TTL cache for HuggingFace search metadata."""

    def __init__(self, ttl_seconds: int = 600, max_size: int = 100) -> None:
        self.ttl = ttl_seconds
        self.max_size = max_size
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.lock = threading.Lock()

    def get(self, key: str) -> Optional[Dict[str, Any]]:
        with self.lock:
            if key not in self.cache:
                return None
            entry = self.cache[key]
            if time.time() - entry["timestamp"] > self.ttl:
                del self.cache[key]
                return None
            return entry["results"]

    def set(self, key: str, results: Dict[str, Any]) -> None:
        with self.lock:
            if key not in self.cache and len(self.cache) >= self.max_size:
                oldest_key = min(self.cache.keys(), key=lambda k: self.cache[k]["timestamp"])
                del self.cache[oldest_key]
            self.cache[key] = {"results": results, "timestamp": time.time()}


_huggingface_search_cache = HuggingFaceSearchCache(ttl_seconds=600, max_size=100)


def _sanitize_table_name(name: str) -> str:
    table_name = name.lower()
    table_name = re.sub(r"[^\w]+", "_", table_name)
    table_name = re.sub(r"_+", "_", table_name)
    table_name = table_name.strip("_")
    if table_name and table_name[0].isdigit():
        table_name = "table_" + table_name
    return table_name or "huggingface_table"


class HuggingFaceSearchService:
    """Service for HuggingFace dataset discovery."""

    def __init__(self) -> None:
        self.cache = _huggingface_search_cache
        self.max_split_bytes = DEFAULT_MAX_SPLIT_BYTES

    async def search_datasets(
        self,
        token: Optional[str],
        search_query: str = "",
        max_results: int = 100,
    ) -> Dict[str, Any]:
        search_query = search_query.strip()
        max_results = min(max_results, 200)
        cache_key = f"hf_search:{bool(token)}:{search_query}:{max_results}"
        cache_key_hash = hashlib.md5(cache_key.encode()).hexdigest()

        cached_results = self.cache.get(cache_key_hash)
        if cached_results is not None:
            logger.info(
                "Returning cached HuggingFace results for search '%s' (%s datasets)",
                search_query,
                len(cached_results["datasets"]),
            )
            return cached_results

        try:
            huggingface_hub = importlib.import_module("huggingface_hub")
            api = huggingface_hub.HfApi(token=token)
            dataset_infos = list(api.list_datasets(search=search_query or None, limit=max_results))
            results = []

            for info in dataset_infos:
                dataset_id = getattr(info, "id", None) or getattr(info, "repo_id", None)
                if not dataset_id:
                    continue

                size_mb = 0.0
                num_rows = 0
                try:
                    size_payload = self._fetch_size_payload(token, dataset_id)
                    dataset_size = size_payload.get("size", {}).get("dataset", {})
                    size_bytes = int(dataset_size.get("num_bytes_parquet_files") or 0)
                    size_mb = round(size_bytes / (1024 * 1024), 2)
                    num_rows = int(dataset_size.get("num_rows") or 0)
                except Exception as e:
                    logger.debug("Could not fetch size metadata for %s: %s", dataset_id, e)

                results.append(
                    {
                        "ref": dataset_id,
                        "title": getattr(info, "pretty_name", None) or dataset_id,
                        "size_mb": size_mb,
                        "num_rows": num_rows,
                    }
                )

            response = {"datasets": results}
            self.cache.set(cache_key_hash, response)
            logger.info("Found %s HuggingFace datasets for search '%s'", len(results), search_query)
            return response
        except Exception as e:
            logger.exception("Failed to search HuggingFace datasets")
            raise DataSourceConnectionError(f"HuggingFace search failed: {e}")

    async def list_dataset_splits(
        self,
        token: Optional[str],
        dataset: str,
    ) -> Dict[str, Any]:
        if not dataset:
            raise InvalidInputError("HuggingFace dataset is required")
        if "/" not in dataset:
            raise InvalidInputError("Dataset must be in format 'owner/dataset-name'")

        try:
            parquet_files = self._fetch_parquet_files(token, dataset)
            size_payload = self._fetch_size_payload(token, dataset)
            if size_payload.get("partial") is True:
                return {
                    "splits": [],
                    "partial": True,
                    "warning": (
                        "This dataset is too large for HuggingFace to fully size. "
                        "It is excluded from direct connection."
                    ),
                }

            grouped: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
            for file_info in parquet_files:
                grouped.setdefault((file_info["config"], file_info["split"]), []).append(file_info)

            configs = {config for config, _split in grouped.keys()}
            use_split_only_names = configs == {"default"}
            size_by_split = {
                (item.get("config"), item.get("split")): item
                for item in size_payload.get("size", {}).get("splits", [])
            }

            splits = []
            for (config, split), files in sorted(grouped.items()):
                raw_name = split if use_split_only_names else f"{config}__{split}"
                table_name = _sanitize_table_name(raw_name)
                size_info = size_by_split.get((config, split), {})
                num_bytes = int(
                    size_info.get("num_bytes_parquet_files")
                    or sum(int(file.get("size") or 0) for file in files)
                    or 0
                )
                splits.append(
                    {
                        "table_name": table_name,
                        "config": config,
                        "split": split,
                        "size_mb": round(num_bytes / (1024 * 1024), 2),
                        "num_rows": int(size_info.get("num_rows") or 0),
                        "is_too_large": num_bytes > self.max_split_bytes,
                    }
                )

            logger.info("Found %s HuggingFace split table(s) in dataset '%s'", len(splits), dataset)
            return {"splits": splits, "partial": False}
        except (InvalidInputError, DataSourceConnectionError):
            raise
        except Exception as e:
            logger.exception("Failed to list HuggingFace dataset splits")
            raise DataSourceConnectionError(f"Failed to list HuggingFace dataset splits: {e}")

    def _headers(self, token: Optional[str]) -> Dict[str, str]:
        if not token:
            return {}
        return {"Authorization": f"Bearer {token}"}

    def _fetch_parquet_files(self, token: Optional[str], dataset: str) -> List[Dict[str, Any]]:
        try:
            response = requests.get(
                f"{HF_DATASETS_SERVER}/parquet",
                params={"dataset": dataset},
                headers=self._headers(token),
                timeout=30,
            )
            response.raise_for_status()
            return response.json().get("parquet_files", [])
        except requests.HTTPError as e:
            raise DataSourceConnectionError(f"Failed to list HuggingFace Parquet files: {e}")

    def _fetch_size_payload(self, token: Optional[str], dataset: str) -> Dict[str, Any]:
        try:
            response = requests.get(
                f"{HF_DATASETS_SERVER}/size",
                params={"dataset": dataset},
                headers=self._headers(token),
                timeout=30,
            )
            response.raise_for_status()
            return response.json()
        except requests.HTTPError as e:
            raise DataSourceConnectionError(f"Failed to size HuggingFace dataset: {e}")
