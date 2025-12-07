# Kaggle Rate Limit Optimizations

## Problem
The Kaggle dataset search endpoint was hitting rate limits because it made individual API calls to `dataset_list_files()` for **every single dataset** in search results to count CSV files. This resulted in:
- 429 "Too Many Requests" errors
- Empty search results after the first search
- Poor user experience

## Solution Implemented

### 1. **Search Result Caching** (Primary Optimization)
- Added `KaggleSearchCache` class with TTL-based expiration
- Caches complete search results for **10 minutes**
- Cache key: `username:search_query:max_results`
- Thread-safe with locks
- LRU eviction when cache reaches 100 entries
- **Impact**: Subsequent identical searches return instantly from cache with ZERO API calls

### 2. **File Listing Limit**
- Limited file count fetching to first **50 datasets** only
- Datasets beyond 50 show `null` for `csv_file_count`
- **Impact**: Reduces API calls by up to 80% on large searches (e.g., 200 results → 50 calls max)

### 3. **Rate Limiting with Delays**
- Added 500ms delay every 10 API calls
- Prevents bursting that triggers Kaggle's rate limiter
- Uses async sleep to avoid blocking
- **Impact**: Smoother API usage, less likely to hit rate limits

### 4. **Graceful Degradation**
- If rate limit (429) is hit, stops fetching file counts for remaining datasets
- Continues to return all dataset metadata (just without file counts)
- Better error logging to distinguish rate limits from other errors

### 5. **Reduced Default Results**
- Changed default `max_results` from 200 → **100**
- Still allows up to 1000 if explicitly requested
- **Impact**: 50% fewer datasets to process by default

## Code Changes

### File: `backend/routers/data.py`

```python
# New cache class (lines 395-422)
class KaggleSearchCache:
    """Simple TTL cache for Kaggle search results."""
    def __init__(self, ttl_seconds: int = 600, max_size: int = 100):
        self.ttl = ttl_seconds
        self.max_size = max_size
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.lock = threading.Lock()
    
    def get(self, key: str) -> Optional[Dict[str, Any]]: ...
    def set(self, key: str, results: Dict[str, Any]) -> None: ...

_kaggle_search_cache = KaggleSearchCache(ttl_seconds=600, max_size=100)
```

Key modifications in `/kaggle/search` endpoint:
1. Check cache before making any API calls
2. Limit file listing to 50 datasets: `MAX_FILE_LIST_CALLS = 50`
3. Add delays: `await asyncio.sleep(0.5)` every 10 calls
4. Stop gracefully on rate limit or max calls reached
5. Cache results before returning

## Expected Impact

### Before:
- Search for "F1" with 200 results → ~200 API calls
- Second identical search → ~200 API calls again
- Hit rate limit after ~100 calls → partial results
- No file counts for remaining datasets

### After:
- Search for "F1" with 100 results (new default) → ~50 API calls max
- Second identical search within 10 min → **0 API calls** (cached)
- Delayed calls prevent rate limiting
- Graceful degradation if rate limit is hit
- Much faster response for cached queries

## Testing Recommendations

1. **Cache Verification**:
   - Search for "F1" twice in a row
   - Second search should log: `Returning cached results for search 'F1' (N datasets)`
   - Should complete in <100ms (vs 5+ seconds for fresh search)

2. **Rate Limit Handling**:
   - Search with `max_results=200`
   - Should see log: `Reached file listing limit (50 datasets). Remaining datasets will not have file counts.`
   - All 200 datasets should still be returned (just without file counts for last 150)

3. **Cache Expiration**:
   - Search, wait 11 minutes, search again
   - Should make fresh API calls (not use cache)

## Configuration

Current settings (can be adjusted if needed):
```python
TTL = 600 seconds (10 minutes)
MAX_CACHE_SIZE = 100 searches
MAX_FILE_LIST_CALLS = 50 datasets
RATE_LIMIT_DELAY = 500ms per 10 calls
DEFAULT_MAX_RESULTS = 100 datasets
```

## Future Improvements (Optional)

1. **Persistent cache** (Redis/file-based) to survive server restarts
2. **Background refresh** for popular searches before cache expires
3. **Lazy loading** of file counts (fetch on-demand when user clicks dataset)
4. **Shared cache** across users for public datasets
5. **Configurable TTL** via environment variables

## Notes

- Cache is in-memory and will be lost on server restart
- Different users searching the same query will make separate API calls (cache key includes username)
- File counts for datasets beyond position 50 will show as `null` in the UI
- The 403 error handling for private datasets remains unchanged
