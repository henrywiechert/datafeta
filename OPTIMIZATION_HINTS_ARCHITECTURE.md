# Optimization Hints Architecture - Frontend-Driven Performance Strategy

## Overview

This document describes the architectural refactoring to separate frontend concerns (chart types, visualization requirements) from backend SQL optimization. The backend will no longer derive chart types or make assumptions about visualization needs. Instead, the frontend will propagate explicit **optimization hints** that guide the backend's query optimization strategies.

## Current Architecture Problems

### Problem 1: Backend Knows About Chart Types
The current `QueryOptimizer` has methods like `_detect_chart_type()` that attempt to infer visualization types from query structure:

```python
def _detect_chart_type(self, query_desc: QueryDescription) -> str:
    # Backend tries to guess if it's a scatter, bar, line chart etc.
    # This is a FRONTEND concern, not a backend concern!
    pass
```

**Why This Is Wrong:**
- Backend has no context about actual visualization
- Same query structure could be used for different chart types
- Tight coupling between visualization and data layer
- Frontend already knows the chart type!

### Problem 2: Optimization Strategy Derived from Structure
The backend currently infers optimization strategies from query structure:

```python
if len(continuous_dims) >= 2:
    # Assumes scatter plot
    strategies.extend(self._create_multi_continuous_strategies(query_desc))
```

**Why This Is Wrong:**
- Different visualizations need different optimizations
- Frontend can't control optimization behavior
- No way to disable optimizations when inappropriate
- Backend makes assumptions about data size without frontend context

### Problem 3: No Flexible Communication Channel
Currently no way for frontend to communicate:
- "This dataset is too large, please apply rounding"
- "User zoomed in, disable rounding for precision"
- "This is a thumbnail preview, aggressive sampling OK"
- "This is final export, no optimization allowed"

## New Architecture: Optimization Hints

### Principle: Frontend Knows Best

The **frontend** knows:
- ✅ What chart type is being rendered
- ✅ What optimizations are appropriate for that chart
- ✅ User preferences (precision vs performance)
- ✅ Viewport size / data point limits
- ✅ Whether this is a preview or final result

The **backend** knows:
- ✅ How to execute SQL efficiently
- ✅ How to implement DISTINCT, rounding, sampling
- ✅ Database-specific optimization techniques
- ✅ Data statistics (cardinality, ranges)

### Solution: Optimization Hints Interface

```typescript
// Frontend → Backend
interface OptimizationHints {
  // Core optimization toggles
  enable_distinct?: boolean;        // Apply DISTINCT deduplication
  enable_rounding?: boolean;        // Apply adaptive rounding
  enable_sampling?: boolean;        // Apply data sampling
  enable_binning?: boolean;         // Apply 2D binning (future)
  
  // Thresholds and limits
  rounding_threshold?: number;      // Apply rounding if > N unique values
  max_result_size?: number;         // Target maximum result rows
  sampling_rate?: number;           // Sampling percentage (0-1)
  
  // Precision requirements
  required_precision?: {
    [field: string]: number;        // Min precision per field (e.g., 2 decimals)
  };
  
  // Performance vs accuracy preference
  optimization_level?: 'none' | 'conservative' | 'balanced' | 'aggressive';
  
  // Context information
  purpose?: 'preview' | 'visualization' | 'export' | 'analysis';
  chart_context?: {
    type?: 'scatter' | 'bar' | 'line' | 'heatmap';  // Optional, for logging/debugging
    estimated_viewport_capacity?: number;            // Visual points that fit
  };
}
```

### Backend Model

```python
# backend/models/query.py

from typing import Optional, Dict, Literal, Any
from pydantic import BaseModel, Field

class OptimizationHints(BaseModel):
    """
    Optimization hints provided by frontend to guide query optimization.
    
    These hints reflect the frontend's knowledge about:
    - Chart type and visualization requirements
    - User preferences for speed vs precision
    - Dataset size expectations
    - Context (preview vs final result)
    """
    
    # Core optimization toggles
    enable_distinct: Optional[bool] = None
    enable_rounding: Optional[bool] = None
    enable_sampling: Optional[bool] = None
    enable_binning: Optional[bool] = None
    
    # Thresholds and limits
    rounding_threshold: Optional[int] = Field(None, ge=0)
    max_result_size: Optional[int] = Field(None, ge=0)
    sampling_rate: Optional[float] = Field(None, ge=0.0, le=1.0)
    
    # Precision requirements
    required_precision: Optional[Dict[str, int]] = None
    
    # Performance vs accuracy preference
    optimization_level: Optional[Literal['none', 'conservative', 'balanced', 'aggressive']] = None
    
    # Context information (for logging/debugging)
    purpose: Optional[Literal['preview', 'visualization', 'export', 'analysis']] = None
    chart_context: Optional[Dict[str, Any]] = None


class QueryDescription(BaseModel):
    target_table: str
    target_database: Optional[str] = None
    
    dimensions: List[Dimension] = []
    measures: List[Measure] = []
    filters: List[Filter] = []
    orderBy: List[OrderBy] = []
    limit: Optional[int] = None
    offset: Optional[int] = None
    
    # NEW: Optimization hints from frontend
    optimization_hints: Optional[OptimizationHints] = None


class OptimizationOverride(BaseModel):
    """
    Backend-determined override that supersedes frontend hints.
    
    Used when backend detects conditions that make frontend hints
    inappropriate or unnecessary (e.g., very small tables).
    """
    
    skip_all_optimizations: bool = False
    reason: Optional[str] = None  # e.g., "table_too_small", "already_aggregated"
    table_stats: Optional[Dict[str, Any]] = None  # e.g., {"row_count": 1234, "column_count": 5}
```

## Frontend Hint Generation Logic

### Chart Type → Optimization Hints Mapping

The frontend should have a **hint generator** that maps chart requirements to optimization hints:

```typescript
// frontend/src/services/optimizationHintGenerator.ts

interface ChartOptimizationProfile {
  enable_distinct: boolean;
  enable_rounding: boolean;
  rounding_threshold: number;
  max_result_size: number;
  optimization_level: 'conservative' | 'balanced' | 'aggressive';
}

const CHART_OPTIMIZATION_PROFILES: Record<string, ChartOptimizationProfile> = {
  scatter: {
    enable_distinct: true,        // Always deduplicate (x,y) pairs
    enable_rounding: true,         // Apply if needed
    rounding_threshold: 5000,      // Round if > 5000 unique pairs
    max_result_size: 10000,        // Target max points
    optimization_level: 'balanced',
  },
  
  bar: {
    enable_distinct: true,         // Deduplicate categories
    enable_rounding: false,        // Don't round discrete categories
    rounding_threshold: 0,         // N/A
    max_result_size: 1000,         // Fewer bars typically
    optimization_level: 'conservative',
  },
  
  line: {
    enable_distinct: true,
    enable_rounding: true,
    rounding_threshold: 2000,      // Lines can show more points
    max_result_size: 5000,
    optimization_level: 'conservative',  // Preserve temporal patterns
  },
  
  heatmap: {
    enable_distinct: true,
    enable_rounding: true,         // Critical for heatmaps
    rounding_threshold: 100,       // Aggressive binning needed
    max_result_size: 2500,         // 50x50 grid typical max
    optimization_level: 'aggressive',
  },
};

export function generateOptimizationHints(
  chartType: string,
  dataSize?: number,
  userPreferences?: UserPreferences
): OptimizationHints {
  const profile = CHART_OPTIMIZATION_PROFILES[chartType] || CHART_OPTIMIZATION_PROFILES.scatter;
  
  return {
    ...profile,
    purpose: 'visualization',
    chart_context: {
      type: chartType,
      estimated_dataset_size: dataSize,
    },
  };
}
```

### Example Usage in Frontend

```typescript
// When building a query for a scatter plot
const query: QueryDescription = {
  target_table: 'orders',
  dimensions: [
    { field: 'price', flavour: 'continuous', axis: 'x' },
    { field: 'quantity', flavour: 'continuous', axis: 'y' },
  ],
  measures: [],
  filters: [...],
  
  // Add optimization hints based on chart type
  optimization_hints: generateOptimizationHints('scatter'),
};

// When user requests high-precision export
const exportQuery: QueryDescription = {
  ...query,
  optimization_hints: {
    enable_distinct: false,
    enable_rounding: false,
    optimization_level: 'none',
    purpose: 'export',
  },
};

// When showing thumbnail preview
const previewQuery: QueryDescription = {
  ...query,
  optimization_hints: {
    enable_sampling: true,
    sampling_rate: 0.1,  // 10% sample
    max_result_size: 1000,
    optimization_level: 'aggressive',
    purpose: 'preview',
  },
};
```

## Backend Refactoring

### Backend Override for Small Tables

**Problem:** For small datasets (e.g., <5000 rows), running estimation queries like `COUNT(DISTINCT x, y)` adds unnecessary overhead. The backend should detect small tables and skip optimizations entirely.

**Solution:** Backend checks table size before applying any optimizations and can override frontend hints.

```python
# backend/services/optimization/optimizer.py

class QueryOptimizer:
    
    def __init__(self, connector, config):
        self.connector = connector
        self.config = config
        self.small_table_threshold = config.small_table_threshold or 5000
    
    def _check_table_size(self, query_desc: QueryDescription) -> Optional[OptimizationOverride]:
        """
        Quick check if table is small enough to skip all optimizations.
        
        Uses a fast COUNT(*) query (often cached by DB) to determine if
        the table is small enough that optimizations would add more overhead
        than they save.
        
        Returns OptimizationOverride if table is small, None otherwise.
        """
        try:
            # Fast row count query
            count_query = f"SELECT COUNT(*) as row_count FROM {query_desc.target_table}"
            if query_desc.target_database:
                count_query = f"SELECT COUNT(*) as row_count FROM {query_desc.target_database}.{query_desc.target_table}"
            
            result = self.connector.execute_query(count_query)
            row_count = result[0]['row_count']
            
            # Get column count (from dimensions + measures)
            column_count = len(query_desc.dimensions) + len(query_desc.measures)
            
            if row_count < self.small_table_threshold:
                logger.info(
                    f"✅ Small table detected: {row_count} rows, {column_count} cols. "
                    f"Skipping all optimizations."
                )
                return OptimizationOverride(
                    skip_all_optimizations=True,
                    reason="table_too_small",
                    table_stats={
                        "row_count": row_count,
                        "column_count": column_count,
                        "threshold": self.small_table_threshold
                    }
                )
            
            logger.info(f"Table size: {row_count} rows (>= threshold {self.small_table_threshold})")
            return None
            
        except Exception as e:
            logger.warning(f"Failed to check table size: {e}. Proceeding with optimization.")
            return None
    
    def create_plan(self, query_desc: QueryDescription) -> OptimizationPlan:
        """
        Create optimization plan.
        
        Priority order:
        1. Check for backend override (small table detection)
        2. Apply frontend hints if provided
        3. Fall back to defaults based on query structure
        """
        # First, check if table is too small for optimizations
        override = self._check_table_size(query_desc)
        if override and override.skip_all_optimizations:
            return OptimizationPlan(
                strategies=[],
                override=override,
                hints_used=None
            )
        
        # Get hints (from frontend or generate defaults)
        hints = query_desc.optimization_hints or self._apply_default_hints(query_desc)
        
        # Build strategies based on hints
        strategies = []
        
        if hints.enable_distinct:
            strategies.append(DistinctPairStrategy(self.db_type, self.estimator))
        
        if hints.enable_rounding:
            threshold = hints.rounding_threshold or self.config.rounding_threshold
            if self._should_apply_rounding(query_desc, threshold):
                strategies.append(AdaptiveRoundingStrategy(...))
        
        if hints.enable_sampling and hints.sampling_rate:
            strategies.append(SamplingStrategy(hints.sampling_rate))
        
        return OptimizationPlan(
            strategies=strategies,
            override=None,
            hints_used=hints
        )
```

**Benefits:**
- ✅ No unnecessary `COUNT(DISTINCT ...)` queries on small tables
- ✅ Backend can use cached table statistics
- ✅ `COUNT(*)` is typically very fast and often cached
- ✅ Clear feedback to frontend about why optimizations were skipped

### Remove Chart Type Detection

**Before:**
```python
def _detect_chart_type(self, query_desc: QueryDescription) -> str:
    """Infer chart type from query structure."""  # ❌ BAD
    pass
```

**After:**
```python
# DELETE THIS METHOD - Frontend tells us what to do!
```

### Use Hints in Optimization

**Before:**
```python
def create_plan(self, query_desc: QueryDescription) -> OptimizationPlan:
    if len(continuous_dims) >= 2:
        # Backend guesses it's a scatter plot  # ❌ BAD
        strategies.extend(self._create_multi_continuous_strategies(query_desc))
```

**After:**
```python
def create_plan(self, query_desc: QueryDescription) -> OptimizationPlan:
    """Create optimization plan based on explicit hints from frontend."""
    strategies = []
    
    # Get hints (with sensible defaults if not provided)
    hints = query_desc.optimization_hints or OptimizationHints()
    
    # Apply strategies based on EXPLICIT hints, not assumptions
    if hints.enable_distinct:
        strategies.append(DistinctPairStrategy(self.db_type, self.estimator))
    
    if hints.enable_rounding:
        threshold = hints.rounding_threshold or self.config.rounding_threshold
        if self._should_apply_rounding(query_desc, threshold):
            strategies.append(AdaptiveRoundingStrategy(
                db_type=self.db_type,
                estimator=self.estimator,
                target_buckets=self._calculate_target_buckets(hints),
            ))
    
    if hints.enable_sampling and hints.sampling_rate:
        strategies.append(SamplingStrategy(hints.sampling_rate))
    
    return OptimizationPlan(strategies)
```

### Default Behavior (Backward Compatibility)

When `optimization_hints` is not provided, backend should apply **sensible defaults** based on query structure (current behavior):

```python
def _apply_default_hints(self, query_desc: QueryDescription) -> OptimizationHints:
    """
    Generate default optimization hints when frontend doesn't provide them.
    This ensures backward compatibility with older frontend versions.
    """
    has_measures = bool(query_desc.measures)
    continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']
    
    if has_measures:
        # Aggregated query - no deduplication needed
        return OptimizationHints(
            enable_distinct=False,
            enable_rounding=False,
            optimization_level='none',
        )
    
    if len(continuous_dims) >= 2:
        # Likely scatter plot - apply current defaults
        return OptimizationHints(
            enable_distinct=True,
            enable_rounding=True,
            rounding_threshold=5000,
            max_result_size=10000,
            optimization_level='balanced',
        )
    
    # Single dimension - simple dedup
    return OptimizationHints(
        enable_distinct=True,
        enable_rounding=False,
        optimization_level='conservative',
    )
```

## Benefits of This Architecture

### 1. Separation of Concerns
- ✅ Frontend owns visualization logic
- ✅ Backend owns SQL optimization logic
- ✅ Clear interface between the two

### 2. Flexibility
- ✅ Frontend can request different optimizations for same query
- ✅ User preferences easily propagated
- ✅ Context-aware optimization (preview vs export)

### 3. Maintainability
- ✅ Backend doesn't need to know about chart types
- ✅ New chart types don't require backend changes
- ✅ Optimization logic centralized in frontend

### 4. Testability
- ✅ Easy to test specific optimization combinations
- ✅ No implicit behavior based on query structure
- ✅ Clear expectations in tests

### 5. Performance Control
- ✅ Frontend can balance speed vs accuracy
- ✅ Adaptive based on viewport size
- ✅ Progressive refinement possible (fast preview → detailed view)

## Migration Path

### Phase 1: Add Hints Support (Non-Breaking)
1. Add `OptimizationHints` model to backend
2. Add optional `optimization_hints` field to `QueryDescription`
3. Update `QueryOptimizer` to use hints when provided
4. Maintain default behavior when hints absent (backward compatible)

### Phase 2: Frontend Implementation
5. Add `OptimizationHints` interface to frontend types
6. Create hint generation logic based on chart types
7. Update query building to include hints
8. Test with various chart types

### Phase 3: Remove Legacy Code
9. Remove `_detect_chart_type()` method
10. Remove implicit optimization logic
11. Require hints for all queries (breaking change)
12. Update all tests

### Phase 4: Advanced Features
13. Add progressive refinement (preview → detailed)
14. User preference controls
15. Viewport-aware optimization
16. Caching based on hints

## Example Scenarios

### Scenario 1: Scatter Plot with 1M Points

**Frontend:**
```typescript
{
  dimensions: [
    { field: 'price', flavour: 'continuous' },
    { field: 'quantity', flavour: 'continuous' },
  ],
  optimization_hints: {
    enable_distinct: true,
    enable_rounding: true,
    rounding_threshold: 5000,
    max_result_size: 10000,
    optimization_level: 'balanced',
    chart_context: { type: 'scatter' },
  }
}
```

**Backend:** Applies DISTINCT → checks cardinality → applies rounding if > 5000 unique pairs

**Result:** ~8000 points, good performance

### Scenario 2: User Zooms In (Higher Precision Needed)

**Frontend:**
```typescript
{
  dimensions: [...],  // Same query
  filters: [
    { field: 'price', operator: '>', value: 100 },
    { field: 'price', operator: '<', value: 200 },
  ],
  optimization_hints: {
    enable_distinct: true,
    enable_rounding: false,  // Disable rounding for zoomed view
    optimization_level: 'conservative',
    chart_context: { type: 'scatter', zoom_level: 2 },
  }
}
```

**Backend:** Only applies DISTINCT, no rounding

**Result:** Full precision in zoomed region

### Scenario 3: Thumbnail Preview

**Frontend:**
```typescript
{
  dimensions: [...],
  optimization_hints: {
    enable_sampling: true,
    sampling_rate: 0.05,  // 5% sample
    max_result_size: 500,
    optimization_level: 'aggressive',
    purpose: 'preview',
  }
}
```

**Backend:** Aggressive sampling, minimal processing

**Result:** Fast preview, ~500 points

### Scenario 4: Data Export (No Optimization)

**Frontend:**
```typescript
{
  dimensions: [...],
  optimization_hints: {
    enable_distinct: false,
    enable_rounding: false,
    enable_sampling: false,
    optimization_level: 'none',
    purpose: 'export',
  }
}
```

**Backend:** No optimizations applied

**Result:** Complete raw data

## API Contract

### Request
```http
POST /api/v1/data/query
Content-Type: application/json

{
  "target_table": "orders",
  "dimensions": [...],
  "measures": [...],
  "filters": [...],
  "optimization_hints": {
    "enable_distinct": true,
    "enable_rounding": true,
    "rounding_threshold": 5000,
    "optimization_level": "balanced",
    "purpose": "visualization",
    "chart_context": {
      "type": "scatter"
    }
  }
}
```

### Response (Normal Optimization)
```json
{
  "columns": [
    {"name": "price", "type": "Float64"},
    {"name": "quantity", "type": "Int32"}
  ],
  "rows": [
    {"price": 100.0, "quantity": 50},
    {"price": 150.0, "quantity": 75},
    ...
  ],
  "row_count": 4800,
  "query_sql": "SELECT DISTINCT ROUND(...) ...",
  
  "optimizations_applied": [
    {
      "strategy": "distinct_pairs",
      "reduction": "100000 → 50000 rows"
    },
    {
      "strategy": "adaptive_rounding",
      "reduction": "50000 → 4800 rows",
      "rounding_config": {
        "price": 10,
        "quantity": 1
      }
    }
  ],
  
  "optimization_hints_used": {
    "enable_distinct": true,
    "enable_rounding": true,
    "rounding_threshold": 5000,
    "optimization_level": "balanced"
  },
  
  "optimization_override": null,
  
  "result_dimensions": {
    "rows": 4800,
    "columns": 2,
    "size_display": "4,800 × 2"
  }
}
```

### Response (Small Table - Override)
```json
{
  "columns": [...],
  "rows": [...],
  "row_count": 1234,
  "query_sql": "SELECT price, quantity FROM orders",
  
  "optimizations_applied": [],
  
  "optimization_hints_used": {
    "enable_distinct": true,
    "enable_rounding": true,
    "rounding_threshold": 5000,
    "optimization_level": "balanced"
  },
  
  "optimization_override": {
    "skip_all_optimizations": true,
    "reason": "table_too_small",
    "table_stats": {
      "row_count": 1234,
      "column_count": 2,
      "threshold": 5000
    }
  },
  
  "result_dimensions": {
    "rows": 1234,
    "columns": 2,
    "size_display": "1,234 × 2"
  }
}
```

### Response Fields Explained

**New Fields:**

- `optimization_hints_used`: The actual hints used (frontend-provided or backend defaults)
- `optimization_override`: Backend override information (null if no override)
- `result_dimensions`: Result size information for UI display
  - `rows`: Number of rows returned
  - `columns`: Number of columns returned
  - `size_display`: Human-readable format (e.g., "1,234 × 5")

**Existing Fields:**

- `optimizations_applied`: List of strategies that were actually applied
- `query_sql`: The final SQL query executed
- `columns`, `rows`, `row_count`: Standard query result data

## Testing Strategy

### Backend Tests
```python
def test_optimization_with_explicit_hints():
    """Test that backend respects explicit hints."""
    query_desc = QueryDescription(
        target_table='orders',
        dimensions=[...],
        optimization_hints=OptimizationHints(
            enable_distinct=True,
            enable_rounding=True,
            rounding_threshold=1000,
        )
    )
    
    plan = optimizer.create_plan(query_desc)
    
    # Verify strategies match hints
    assert any(isinstance(s, DistinctPairStrategy) for s in plan.strategies)
    assert any(isinstance(s, AdaptiveRoundingStrategy) for s in plan.strategies)

def test_optimization_level_none_disables_all():
    """Test that optimization_level='none' disables optimizations."""
    query_desc = QueryDescription(
        target_table='orders',
        dimensions=[...],
        optimization_hints=OptimizationHints(
            optimization_level='none',
        )
    )
    
    plan = optimizer.create_plan(query_desc)
    
    assert len(plan.strategies) == 0
```

### Frontend Tests
```typescript
test('scatter plot generates correct hints', () => {
  const hints = generateOptimizationHints('scatter');
  
  expect(hints.enable_distinct).toBe(true);
  expect(hints.enable_rounding).toBe(true);
  expect(hints.rounding_threshold).toBeGreaterThan(0);
});

test('export disables all optimizations', () => {
  const hints = generateOptimizationHints('scatter', undefined, { purpose: 'export' });
  
  expect(hints.optimization_level).toBe('none');
  expect(hints.enable_rounding).toBe(false);
});
```

## Future Enhancements

1. **Adaptive Hints**: Frontend adjusts hints based on query response time
2. **Progressive Loading**: Start with aggressive optimization, refine on user interaction
3. **User Preferences**: Remember user's speed vs precision preference
4. **Smart Defaults**: Learn optimal hints from historical query patterns
5. **Hint Negotiation**: Backend can suggest better hints based on data characteristics

## Frontend Debug Panel Integration

### Overview

To provide transparency and control, the frontend should display optimization information in a debug/info panel. This helps users understand:
- What optimizations were requested
- What optimizations were actually applied
- Why optimizations were skipped (if any)
- Query result dimensions

### Debug Panel Design

```typescript
// frontend/src/components/DebugPanel.tsx

interface DebugPanelProps {
  queryResult: QueryResult | null;
  queryDescription: QueryDescription | null;
}

export function DebugPanel({ queryResult, queryDescription }: DebugPanelProps) {
  if (!queryResult) return null;
  
  return (
    <div className="debug-panel">
      {/* Result Dimensions - Always Visible */}
      <div className="result-dimensions">
        <h4>Result Size</h4>
        <div className="dimension-badge">
          {queryResult.result_dimensions?.size_display || 
           `${queryResult.row_count} × ${queryResult.columns.length}`}
        </div>
      </div>
      
      {/* Optimization Info - Collapsible */}
      <details className="optimization-details">
        <summary>
          Optimization Info
          {queryResult.optimization_override?.skip_all_optimizations && (
            <span className="badge badge-info">Skipped</span>
          )}
          {queryResult.optimizations_applied?.length > 0 && (
            <span className="badge badge-success">
              {queryResult.optimizations_applied.length} applied
            </span>
          )}
        </summary>
        
        <div className="optimization-content">
          {/* Override Information */}
          {queryResult.optimization_override?.skip_all_optimizations && (
            <div className="override-info">
              <h5>⚡ Optimizations Skipped</h5>
              <p>
                <strong>Reason:</strong> {formatOverrideReason(queryResult.optimization_override.reason)}
              </p>
              {queryResult.optimization_override.table_stats && (
                <div className="stats">
                  <div>Table rows: {queryResult.optimization_override.table_stats.row_count.toLocaleString()}</div>
                  <div>Threshold: {queryResult.optimization_override.table_stats.threshold.toLocaleString()}</div>
                  <div className="hint">Small tables don't need optimization</div>
                </div>
              )}
            </div>
          )}
          
          {/* Hints Requested */}
          {queryDescription?.optimization_hints && (
            <div className="hints-requested">
              <h5>📤 Hints Requested</h5>
              <div className="hints-grid">
                {formatHints(queryDescription.optimization_hints)}
              </div>
            </div>
          )}
          
          {/* Hints Actually Used */}
          {queryResult.optimization_hints_used && (
            <div className="hints-used">
              <h5>✅ Hints Used</h5>
              <div className="hints-grid">
                {formatHints(queryResult.optimization_hints_used)}
              </div>
            </div>
          )}
          
          {/* Optimizations Applied */}
          {queryResult.optimizations_applied && queryResult.optimizations_applied.length > 0 && (
            <div className="optimizations-applied">
              <h5>🔧 Optimizations Applied</h5>
              {queryResult.optimizations_applied.map((opt, idx) => (
                <div key={idx} className="optimization-item">
                  <div className="strategy-name">{formatStrategyName(opt.strategy)}</div>
                  {opt.reduction && (
                    <div className="reduction">{opt.reduction}</div>
                  )}
                  {opt.rounding_config && (
                    <div className="rounding-config">
                      <strong>Rounding:</strong>
                      {Object.entries(opt.rounding_config).map(([field, precision]) => (
                        <span key={field} className="rounding-item">
                          {field}: {precision}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          
          {/* SQL Query */}
          {queryResult.query_sql && (
            <div className="sql-query">
              <h5>📝 Generated SQL</h5>
              <pre>{queryResult.query_sql}</pre>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

// Helper functions
function formatOverrideReason(reason?: string): string {
  const reasonMap = {
    'table_too_small': 'Table is too small to benefit from optimization',
    'already_aggregated': 'Query already uses aggregation',
    'user_disabled': 'User disabled optimizations',
  };
  return reasonMap[reason] || reason || 'Unknown';
}

function formatStrategyName(strategy: string): string {
  const nameMap = {
    'distinct_pairs': 'DISTINCT Deduplication',
    'adaptive_rounding': 'Adaptive Rounding',
    'category_dedup': 'Category Deduplication',
    'sampling': 'Data Sampling',
  };
  return nameMap[strategy] || strategy;
}

function formatHints(hints: OptimizationHints): JSX.Element[] {
  const items: JSX.Element[] = [];
  
  if (hints.enable_distinct !== undefined) {
    items.push(
      <div key="distinct" className="hint-item">
        <span className="hint-label">DISTINCT:</span>
        <span className={`hint-value ${hints.enable_distinct ? 'enabled' : 'disabled'}`}>
          {hints.enable_distinct ? '✓ Enabled' : '✗ Disabled'}
        </span>
      </div>
    );
  }
  
  if (hints.enable_rounding !== undefined) {
    items.push(
      <div key="rounding" className="hint-item">
        <span className="hint-label">Rounding:</span>
        <span className={`hint-value ${hints.enable_rounding ? 'enabled' : 'disabled'}`}>
          {hints.enable_rounding ? '✓ Enabled' : '✗ Disabled'}
        </span>
      </div>
    );
  }
  
  if (hints.rounding_threshold !== undefined) {
    items.push(
      <div key="threshold" className="hint-item">
        <span className="hint-label">Rounding Threshold:</span>
        <span className="hint-value">{hints.rounding_threshold.toLocaleString()}</span>
      </div>
    );
  }
  
  if (hints.optimization_level) {
    items.push(
      <div key="level" className="hint-item">
        <span className="hint-label">Level:</span>
        <span className={`hint-value level-${hints.optimization_level}`}>
          {hints.optimization_level}
        </span>
      </div>
    );
  }
  
  if (hints.purpose) {
    items.push(
      <div key="purpose" className="hint-item">
        <span className="hint-label">Purpose:</span>
        <span className="hint-value">{hints.purpose}</span>
      </div>
    );
  }
  
  if (hints.chart_context?.type) {
    items.push(
      <div key="chart-type" className="hint-item">
        <span className="hint-label">Chart Type:</span>
        <span className="hint-value">{hints.chart_context.type}</span>
      </div>
    );
  }
  
  return items;
}
```

### Debug Panel Styles

```css
/* frontend/src/components/DebugPanel.css */

.debug-panel {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  padding: 12px;
  margin-top: 16px;
  font-size: 13px;
}

.result-dimensions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #dee2e6;
}

.result-dimensions h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #495057;
}

.dimension-badge {
  background: #007bff;
  color: white;
  padding: 4px 12px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 14px;
}

.optimization-details summary {
  cursor: pointer;
  font-weight: 600;
  padding: 8px;
  background: white;
  border-radius: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.optimization-details summary:hover {
  background: #e9ecef;
}

.badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  margin-left: 8px;
}

.badge-info {
  background: #17a2b8;
  color: white;
}

.badge-success {
  background: #28a745;
  color: white;
}

.optimization-content {
  padding: 12px 8px 8px;
}

.optimization-content > div {
  margin-bottom: 16px;
  padding: 12px;
  background: white;
  border-radius: 4px;
  border-left: 3px solid #007bff;
}

.optimization-content h5 {
  margin: 0 0 8px 0;
  font-size: 13px;
  font-weight: 600;
  color: #495057;
}

.override-info {
  border-left-color: #ffc107 !important;
}

.hints-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 8px;
}

.hint-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  background: #f8f9fa;
  border-radius: 3px;
}

.hint-label {
  font-weight: 600;
  color: #6c757d;
  margin-right: 8px;
}

.hint-value {
  color: #212529;
}

.hint-value.enabled {
  color: #28a745;
}

.hint-value.disabled {
  color: #dc3545;
}

.hint-value.level-aggressive {
  color: #dc3545;
  font-weight: 600;
}

.hint-value.level-balanced {
  color: #007bff;
}

.hint-value.level-conservative {
  color: #28a745;
}

.optimization-item {
  padding: 8px;
  background: #f8f9fa;
  border-radius: 3px;
  margin-bottom: 8px;
}

.strategy-name {
  font-weight: 600;
  color: #007bff;
  margin-bottom: 4px;
}

.reduction {
  color: #28a745;
  font-size: 12px;
  margin-bottom: 4px;
}

.rounding-config {
  font-size: 12px;
  color: #6c757d;
}

.rounding-item {
  display: inline-block;
  background: white;
  padding: 2px 6px;
  border-radius: 3px;
  margin: 0 4px 4px 0;
}

.sql-query pre {
  background: #2d2d2d;
  color: #f8f9fa;
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 12px;
  line-height: 1.4;
}

.stats {
  font-size: 12px;
  color: #6c757d;
}

.stats > div {
  margin-bottom: 4px;
}

.stats .hint {
  margin-top: 8px;
  padding: 6px;
  background: #fff3cd;
  color: #856404;
  border-radius: 3px;
  font-style: italic;
}
```

### Integration Example

```typescript
// In your main chart/query component
function ChartWithQuery() {
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryDescription, setQueryDescription] = useState<QueryDescription | null>(null);
  
  const executeQuery = async (chartType: string) => {
    // Generate hints based on chart type
    const hints = generateOptimizationHints(chartType);
    
    const query: QueryDescription = {
      target_table: 'orders',
      dimensions: [...],
      measures: [...],
      optimization_hints: hints,
    };
    
    setQueryDescription(query);
    
    const result = await apiService.executeQuery(query);
    setQueryResult(result);
  };
  
  return (
    <div>
      <Chart data={queryResult?.rows} />
      
      {/* Debug Panel - Always visible or toggle-able */}
      <DebugPanel 
        queryResult={queryResult} 
        queryDescription={queryDescription} 
      />
    </div>
  );
}
```

### Display Result Dimensions Prominently

In addition to the debug panel, result dimensions should be shown prominently:

```typescript
// Quick result info badge (always visible)
function ResultInfoBadge({ queryResult }: { queryResult: QueryResult }) {
  if (!queryResult) return null;
  
  return (
    <div className="result-info-badge">
      <span className="icon">📊</span>
      <span className="dimensions">
        {queryResult.result_dimensions?.size_display || 
         `${queryResult.row_count.toLocaleString()} × ${queryResult.columns.length}`}
      </span>
      {queryResult.optimization_override?.skip_all_optimizations && (
        <span className="optimization-status skipped" title="Optimizations skipped - table too small">
          ⚡
        </span>
      )}
      {queryResult.optimizations_applied && queryResult.optimizations_applied.length > 0 && (
        <span className="optimization-status applied" title={`${queryResult.optimizations_applied.length} optimizations applied`}>
          🔧
        </span>
      )}
    </div>
  );
}
```

### Benefits

1. **Transparency**: Users see exactly what optimizations were applied
2. **Learning**: Users understand when and why optimizations are used
3. **Debugging**: Developers can verify optimization behavior
4. **Control**: Foundation for future user controls (enable/disable hints)
5. **Performance Insight**: See result dimensions and optimization impact

## Conclusion

This architecture provides a **clean separation** between visualization concerns (frontend) and data optimization (backend), while maintaining **flexibility** and **performance**. The frontend explicitly controls optimization behavior through hints, making the system more **predictable** and **maintainable**.

The backend becomes a **pure optimization engine** that executes hints without making assumptions about how data will be visualized. This is the correct architectural pattern for a flexible data visualization system.
