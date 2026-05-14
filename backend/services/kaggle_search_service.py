# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Service for searching Kaggle datasets and listing files."""

import hashlib
import logging
import threading
import time
from typing import Any, Dict, List, Optional

from backend.exceptions import DataSourceConnectionError, InvalidInputError

logger = logging.getLogger(__name__)


class KaggleSearchCache:
    """Simple TTL cache for Kaggle search results."""
    
    def __init__(self, ttl_seconds: int = 600, max_size: int = 100):
        self.ttl = ttl_seconds
        self.max_size = max_size
        self.cache: Dict[str, Dict[str, Any]] = {}  # key -> {results, timestamp}
        self.lock = threading.Lock()
    
    def get(self, key: str) -> Optional[Dict[str, Any]]:
        with self.lock:
            if key not in self.cache:
                return None
            entry = self.cache[key]
            if time.time() - entry['timestamp'] > self.ttl:
                del self.cache[key]
                return None
            return entry['results']
    
    def set(self, key: str, results: Dict[str, Any]) -> None:
        with self.lock:
            # Simple eviction: remove oldest if at capacity
            if key not in self.cache and len(self.cache) >= self.max_size:
                oldest_key = min(self.cache.keys(), key=lambda k: self.cache[k]['timestamp'])
                del self.cache[oldest_key]
            self.cache[key] = {'results': results, 'timestamp': time.time()}


# Global cache for Kaggle search results (10 minute TTL, max 100 searches)
_kaggle_search_cache = KaggleSearchCache(ttl_seconds=600, max_size=100)


def _get_kaggle_api():
    """Get KaggleApi with exit() monkey-patching to prevent sys.exit()."""
    import builtins
    original_exit = builtins.exit
    builtins.exit = lambda *args, **kwargs: None
    
    try:
        from kaggle.api.kaggle_api_extended import KaggleApi
        return KaggleApi
    finally:
        builtins.exit = original_exit


def _authenticate_kaggle_api(username: str, api_key: str):
    """Create and authenticate a Kaggle API instance."""
    import builtins
    original_exit = builtins.exit
    builtins.exit = lambda *args, **kwargs: None
    
    try:
        KaggleApi = _get_kaggle_api()
        api = KaggleApi()
        api.username = username
        api.key = api_key
        api.authenticate()
        return api
    finally:
        builtins.exit = original_exit


class KaggleSearchService:
    """Service for searching Kaggle datasets and listing files."""
    
    def __init__(self):
        self.cache = _kaggle_search_cache
    
    async def search_datasets(
        self,
        username: str,
        api_key: str,
        search_query: str = '',
        max_results: int = 100
    ) -> Dict[str, Any]:
        """
        Search public Kaggle datasets.
        
        Args:
            username: Kaggle username
            api_key: Kaggle API key
            search_query: Search keywords or dataset reference (owner/dataset-name)
            max_results: Maximum number of results to return (default: 100, max: 1000)
        
        Returns:
            Dict with 'datasets' key containing list of matching datasets
        
        Optimizations to reduce API calls and avoid rate limits:
        - Results are cached for 10 minutes (per user + query combination)
        - File counts are only fetched for the first 50 datasets
        - Small delays added between file listing calls (500ms per 10 calls)
        - Stops fetching file counts if rate limit is hit
        """
        import asyncio
        
        if not username or not api_key:
            raise InvalidInputError("Kaggle username and API key are required")
        
        search_query = search_query.strip()
        max_results = min(max_results, 1000)  # Cap at 1000
        
        # Create cache key based on username and search query
        cache_key = f"kaggle_search:{username}:{search_query}:{max_results}"
        cache_key_hash = hashlib.md5(cache_key.encode()).hexdigest()
        
        # Check cache first
        cached_results = self.cache.get(cache_key_hash)
        if cached_results is not None:
            logger.info(f"Returning cached results for search '{search_query}' ({len(cached_results['datasets'])} datasets)")
            return cached_results
        
        try:
            api = _authenticate_kaggle_api(username, api_key)
            
            all_datasets = []
            
            # Check if search_query looks like a dataset reference (contains '/')
            if search_query and '/' in search_query:
                # Try direct dataset lookup first
                try:
                    logger.info(f"Attempting direct lookup for dataset: {search_query}")
                    dataset_metadata = api.dataset_metadata(search_query, path=None)
                    # If successful, create a dataset-like object
                    direct_match = type('obj', (object,), {
                        'ref': search_query,
                        'title': dataset_metadata.get('title', search_query),
                        'isPrivate': False,
                        'size': dataset_metadata.get('totalBytes', 0),
                    })()
                    all_datasets.append(direct_match)
                    logger.info(f"Direct lookup successful for {search_query}")
                except Exception as direct_error:
                    logger.debug(f"Direct lookup failed for {search_query}: {direct_error}")
                    # Fall through to regular search
            
            # Fetch datasets with pagination
            page = 1
            
            while len(all_datasets) < max_results:
                try:
                    datasets = api.dataset_list(
                        search=search_query if search_query else None,
                        page=page,
                        sort_by='hottest' if search_query else 'published'
                    )
                    
                    if not datasets:
                        break  # No more results
                    
                    all_datasets.extend(datasets)
                    
                    # Kaggle API returns fixed-size pages (typically 20 results)
                    if len(datasets) < 20:
                        break
                    
                    page += 1
                    
                except Exception as page_error:
                    logger.warning(f"Error fetching page {page}: {page_error}")
                    break
            
            # Trim to max_results
            all_datasets = all_datasets[:max_results]
            
            results = []
            seen_refs = set()
            rate_limit_hit = False
            file_list_call_count = 0
            MAX_FILE_LIST_CALLS = 50
            
            for dataset in all_datasets:
                # Skip duplicates
                if dataset.ref in seen_refs:
                    continue
                seen_refs.add(dataset.ref)
                
                # Skip private datasets
                if hasattr(dataset, 'isPrivate') and dataset.isPrivate:
                    continue
                
                # Get file count for CSV files
                csv_file_count = None
                if not rate_limit_hit and file_list_call_count < MAX_FILE_LIST_CALLS:
                    try:
                        if file_list_call_count > 0 and file_list_call_count % 10 == 0:
                            await asyncio.sleep(0.5)
                        
                        files = api.dataset_list_files(dataset.ref).files
                        csv_file_count = sum(1 for f in files if f.name.lower().endswith('.csv'))
                        file_list_call_count += 1
                    except Exception as file_error:
                        error_msg = str(file_error)
                        if '403' in error_msg or 'Forbidden' in error_msg:
                            logger.debug(f"Skipping dataset {dataset.ref} - 403 Forbidden when listing files")
                            continue
                        elif '429' in error_msg or 'Too Many Requests' in error_msg:
                            logger.warning(f"Rate limit hit while listing files for {dataset.ref}.")
                            rate_limit_hit = True
                            csv_file_count = None
                        else:
                            logger.debug(f"Error listing files for {dataset.ref}: {error_msg}")
                            csv_file_count = None
                elif file_list_call_count >= MAX_FILE_LIST_CALLS and not rate_limit_hit:
                    logger.info(f"Reached file listing limit ({MAX_FILE_LIST_CALLS} datasets).")
                    rate_limit_hit = True
                
                # Convert size to MB
                size_mb = 0
                if hasattr(dataset, 'size'):
                    size_mb = round(dataset.size / (1024 * 1024), 2) if dataset.size else 0
                elif hasattr(dataset, 'totalBytes'):
                    size_mb = round(dataset.totalBytes / (1024 * 1024), 2) if dataset.totalBytes else 0
                
                # Get last updated date
                last_updated = None
                if hasattr(dataset, 'lastUpdated') and dataset.lastUpdated:
                    last_updated = str(dataset.lastUpdated)
                elif hasattr(dataset, 'last_updated') and dataset.last_updated:
                    last_updated = str(dataset.last_updated)
                
                results.append({
                    'ref': dataset.ref,
                    'title': dataset.title or dataset.ref,
                    'size_mb': size_mb,
                    'csv_file_count': csv_file_count,
                    'last_updated': last_updated
                })
            
            logger.info(f"Found {len(results)} datasets for search '{search_query}'")
            
            # Cache the results
            response = {'datasets': results}
            self.cache.set(cache_key_hash, response)
            
            return response
            
        except Exception as e:
            logger.exception("Failed to search Kaggle datasets")
            raise DataSourceConnectionError(f"Kaggle search failed: {e}")
    
    async def list_dataset_files(
        self,
        username: str,
        api_key: str,
        dataset: str
    ) -> Dict[str, Any]:
        """
        List CSV files in a specific Kaggle dataset.
        
        Args:
            username: Kaggle username
            api_key: Kaggle API key
            dataset: Dataset reference (owner/dataset-name)
        
        Returns:
            Dict with 'files' key containing list of CSV files with sizes
        """
        if not username or not api_key or not dataset:
            raise InvalidInputError("Kaggle username, API key, and dataset are required")
        
        if '/' not in dataset:
            raise InvalidInputError("Dataset must be in format 'owner/dataset-name'")
        
        try:
            api = _authenticate_kaggle_api(username, api_key)
            
            # List files in the dataset
            try:
                files_list = api.dataset_list_files(dataset).files
            except Exception as list_error:
                error_msg = str(list_error)
                if '403' in error_msg or 'Forbidden' in error_msg:
                    raise DataSourceConnectionError(
                        f"Cannot access dataset '{dataset}': 403 Forbidden. "
                        f"You may need to accept the dataset's terms first. "
                        f"Visit https://www.kaggle.com/datasets/{dataset} and click 'Download' or view the data to accept terms."
                    )
                raise
            
            # Filter for CSV files and format response
            csv_files = []
            for file in files_list:
                if file.name.lower().endswith('.csv'):
                    size_mb = 0
                    size_bytes = None
                    
                    for attr in ['size', 'totalBytes', 'total_bytes']:
                        if hasattr(file, attr):
                            val = getattr(file, attr)
                            if val and val > 0:
                                size_bytes = val
                                break
                    
                    if size_bytes:
                        size_mb = round(size_bytes / (1024 * 1024), 2)
                    
                    csv_files.append({
                        'name': file.name,
                        'size_mb': size_mb
                    })
            
            logger.info(f"Found {len(csv_files)} CSV files in dataset '{dataset}'")
            return {'files': csv_files}
            
        except DataSourceConnectionError:
            raise
        except Exception as e:
            logger.exception(f"Failed to list files in dataset '{dataset}'")
            raise DataSourceConnectionError(f"Failed to list dataset files: {e}")

