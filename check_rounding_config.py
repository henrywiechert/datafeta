#!/usr/bin/env python
"""
Quick diagnostic script to check if adaptive rounding is properly configured.
Run this from the data-slicer directory:
  python check_rounding_config.py
"""

import sys
sys.path.insert(0, '.')

from backend.services.optimization.config import OptimizerConfig

print("=" * 60)
print("ADAPTIVE ROUNDING CONFIGURATION CHECK")
print("=" * 60)

# Check config loaded from environment
config = OptimizerConfig.from_env()

print("\n✓ Configuration loaded from environment:")
print(f"  enable_distinct_pairs:      {config.enable_distinct_pairs}")
print(f"  enable_adaptive_rounding:   {config.enable_adaptive_rounding}")
print(f"  rounding_threshold:         {config.rounding_threshold}")
print(f"  target_buckets:             {config.target_buckets}")
print(f"  use_approximate_count:      {config.use_approximate_count}")
print(f"  estimation_timeout_ms:      {config.estimation_timeout_ms}")

# Verify critical setting
print("\n" + "=" * 60)
if config.enable_adaptive_rounding:
    print("✓ ADAPTIVE ROUNDING IS ENABLED")
    print("\nRounding will apply when:")
    print(f"  - Query is a scatter plot (2+ continuous dims on X and Y)")
    print(f"  - Unique pairs > {config.rounding_threshold}")
    print(f"  - Estimator successfully calculates cardinality")
else:
    print("✗ ADAPTIVE ROUNDING IS DISABLED")
    print("\nTo enable, set environment variable:")
    print("  export OPTIMIZER_ENABLE_ADAPTIVE_ROUNDING=true")

print("=" * 60)
print("\nTo change settings, use environment variables:")
print("  OPTIMIZER_ENABLE_ADAPTIVE_ROUNDING=true/false")
print("  OPTIMIZER_ROUNDING_THRESHOLD=5000")
print("  OPTIMIZER_TARGET_BUCKETS=100")
print("=" * 60)
