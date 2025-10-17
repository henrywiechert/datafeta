"""Configuration for query optimizer."""

import os
from dataclasses import dataclass


@dataclass
class OptimizerConfig:
    """Configuration for query optimizer."""
    
    # Enable/disable optimization types
    enable_distinct_pairs: bool = True
    enable_adaptive_rounding: bool = False  # Phase 3: Adaptive rounding for large datasets
    enable_binning: bool = False  # Reserved for future
    
    # Thresholds
    rounding_threshold: int = 5000  # Apply rounding if more than N unique pairs
    binning_threshold: int = 10000  # Apply binning if more than N points
    
    # Rounding parameters
    target_buckets: int = 100  # Desired distinct values per dimension
    
    # Estimation settings
    use_approximate_count: bool = True
    estimation_timeout_ms: int = 500
    
    @classmethod
    def from_env(cls) -> 'OptimizerConfig':
        """Load configuration from environment variables."""
        return cls(
            enable_distinct_pairs=os.getenv('OPTIMIZER_ENABLE_DISTINCT_PAIRS', 'true').lower() == 'true',
            enable_adaptive_rounding=os.getenv('OPTIMIZER_ENABLE_ADAPTIVE_ROUNDING', 'false').lower() == 'true',
            rounding_threshold=int(os.getenv('OPTIMIZER_ROUNDING_THRESHOLD', '5000')),
            target_buckets=int(os.getenv('OPTIMIZER_TARGET_BUCKETS', '100')),
            estimation_timeout_ms=int(os.getenv('OPTIMIZER_ESTIMATION_TIMEOUT_MS', '500')),
        )
