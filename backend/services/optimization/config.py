"""Configuration for query optimizer."""

import os
from dataclasses import dataclass


@dataclass
class OptimizerConfig:
    """Configuration for query optimizer."""
    
    # Enable/disable optimization types
    enable_distinct_pairs: bool = True
    enable_adaptive_rounding: bool = True  # Phase 3: Adaptive rounding for large datasets (default: enabled)
    enable_binning: bool = False  # Reserved for future
    
    # Thresholds
    rounding_threshold: int = 10000  # Apply rounding if more than N unique pairs
    binning_threshold: int = 10000  # Apply binning if more than N points
    
    # Rounding parameters
    target_buckets: int = 100  # Desired distinct values per dimension
    
    # Estimation settings
    use_approximate_count: bool = True
    estimation_timeout_ms: int = 500
    
    # Small table detection (NEW)
    enable_small_table_detection: bool = True  # Check table size before applying optimizations
    small_table_threshold: int = 5000  # Skip optimizations if table has fewer rows

    # Count(*) cache settings (NEW)
    enable_count_cache: bool = True  # Enable caching of COUNT(*) table size checks
    count_cache_ttl_seconds: int = 300  # Time-to-live for cached counts
    count_cache_max_size: int = 256  # Max distinct tables to keep counts for
    
    @classmethod
    def from_env(cls) -> 'OptimizerConfig':
        """Load configuration from environment variables."""
        return cls(
            enable_distinct_pairs=os.getenv('OPTIMIZER_ENABLE_DISTINCT_PAIRS', 'true').lower() == 'true',
            enable_adaptive_rounding=os.getenv('OPTIMIZER_ENABLE_ADAPTIVE_ROUNDING', 'true').lower() == 'true',
            rounding_threshold=int(os.getenv('OPTIMIZER_ROUNDING_THRESHOLD', '10000')),
            target_buckets=int(os.getenv('OPTIMIZER_TARGET_BUCKETS', '100')),
            estimation_timeout_ms=int(os.getenv('OPTIMIZER_ESTIMATION_TIMEOUT_MS', '500')),
            enable_small_table_detection=os.getenv('OPTIMIZER_ENABLE_SMALL_TABLE_DETECTION', 'true').lower() == 'true',
            small_table_threshold=int(os.getenv('OPTIMIZER_SMALL_TABLE_THRESHOLD', '5000')),
            enable_count_cache=os.getenv('OPTIMIZER_ENABLE_COUNT_CACHE', 'true').lower() == 'true',
            count_cache_ttl_seconds=int(os.getenv('OPTIMIZER_COUNT_CACHE_TTL_SECONDS', '300')),
            count_cache_max_size=int(os.getenv('OPTIMIZER_COUNT_CACHE_MAX_SIZE', '256')),
        )
