# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Base classes for optimization strategies."""

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from pypika import Query
from backend.models.query import QueryDescription


class OptimizationMetadata:
    """Metadata about applied optimization."""
    
    def __init__(
        self,
        strategy_name: str,
        estimated_reduction: float,
        parameters: Optional[Dict[str, Any]] = None
    ):
        self.strategy_name = strategy_name
        self.estimated_reduction = estimated_reduction
        self.parameters = parameters or {}
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'strategy': self.strategy_name,
            'reduction': self.estimated_reduction,
            'parameters': self.parameters
        }


class EstimationResult:
    """Result from a size estimation query."""
    
    def __init__(
        self,
        total_rows: int,
        unique_pairs: Optional[int] = None,
        dimension_ranges: Optional[Dict[str, tuple]] = None
    ):
        self.total_rows = total_rows
        self.unique_pairs = unique_pairs
        self.dimension_ranges = dimension_ranges or {}
    
    def get_range(self, field: str) -> Optional[tuple]:
        """Get (min, max) range for a field."""
        return self.dimension_ranges.get(field)


class OptimizationStrategy(ABC):
    """Base class for all optimization strategies."""
    
    def __init__(self, db_type: str = 'clickhouse'):
        self.db_type = db_type
    
    @abstractmethod
    def can_apply(self, query_desc: QueryDescription) -> bool:
        """
        Check if this strategy can be applied to the query.
        
        Args:
            query_desc: The query description to check
            
        Returns:
            True if strategy is applicable
        """
        pass
    
    @abstractmethod
    def apply(self, query: Query, query_desc: QueryDescription, table: Any) -> Query:
        """
        Apply the optimization to the query.
        
        Args:
            query: The pypika Query object to modify
            query_desc: The original query description
            table: The pypika Table object
            
        Returns:
            Modified Query object
        """
        pass
    
    @abstractmethod
    def get_metadata(self) -> OptimizationMetadata:
        """
        Get metadata about this optimization.
        
        Returns:
            OptimizationMetadata describing the optimization
        """
        pass
    
    @property
    def priority(self) -> int:
        """
        Priority for applying strategies (lower = earlier).
        Default: 50 (medium priority)
        """
        return 50
