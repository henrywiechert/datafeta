"""Lightweight in-memory cache for table row counts.

Used to avoid repeated expensive COUNT(*) queries for small table detection.
Cache entries expire after a configurable TTL; size capped to avoid unbounded growth.
Thread-safe for simple multi-request scenarios.
"""

from __future__ import annotations

import time
import threading
from typing import Optional, Dict, Tuple


class CountCacheEntry:
    __slots__ = ("count", "ts")
    def __init__(self, count: int, ts: float):
        self.count = count
        self.ts = ts


class CountCache:
    """Simple in-memory cache with TTL + max size + LRU style eviction.

    Not using functools.lru_cache because we need TTL-based expiry and manual invalidation.
    """

    def __init__(self, ttl_seconds: int = 300, max_size: int = 256):
        self._ttl = max(1, ttl_seconds)
        self._max_size = max(1, max_size)
        self._lock = threading.Lock()
        # key -> CountCacheEntry; we also maintain access order list for eviction
        self._store: Dict[str, CountCacheEntry] = {}
        self._access_order: Dict[str, float] = {}  # key -> last access time

    def get(self, key: str) -> Optional[int]:
        now = time.time()
        with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None
            # Expired?
            if now - entry.ts > self._ttl:
                # Remove expired entry
                self._store.pop(key, None)
                self._access_order.pop(key, None)
                return None
            # Update access order
            self._access_order[key] = now
            return entry.count

    def set(self, key: str, count: int) -> None:
        now = time.time()
        with self._lock:
            # Evict if needed (simple LRU based on _access_order timestamps)
            if key not in self._store and len(self._store) >= self._max_size:
                # Find oldest access
                oldest_key = min(self._access_order, key=self._access_order.get)
                self._store.pop(oldest_key, None)
                self._access_order.pop(oldest_key, None)
            self._store[key] = CountCacheEntry(count, now)
            self._access_order[key] = now

    def invalidate(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)
            self._access_order.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()
            self._access_order.clear()

    def stats(self) -> Tuple[int, int]:
        """Return (current_size, max_size)."""
        with self._lock:
            return (len(self._store), self._max_size)


# Module-level singleton (lazy init) so multiple optimizer instances share cache
_global_count_cache: Optional[CountCache] = None
_global_cache_lock = threading.Lock()


def get_global_count_cache(ttl_seconds: int, max_size: int) -> CountCache:
    global _global_count_cache
    # Recreate if config changed (TTL or size mismatch)
    with _global_cache_lock:
        if (_global_count_cache is None or
                _global_count_cache._ttl != max(1, ttl_seconds) or
                _global_count_cache._max_size != max(1, max_size)):
            _global_count_cache = CountCache(ttl_seconds=ttl_seconds, max_size=max_size)
        return _global_count_cache
