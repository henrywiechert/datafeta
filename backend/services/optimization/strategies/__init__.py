"""Optimization strategies for query optimization."""

from .base import OptimizationStrategy, OptimizationMetadata
from .distinct_pairs import DistinctPairStrategy
from .discrete_dedup import DiscreteDeduplicationStrategy

__all__ = [
    'OptimizationStrategy', 
    'OptimizationMetadata', 
    'DistinctPairStrategy',
    'DiscreteDeduplicationStrategy',
]
