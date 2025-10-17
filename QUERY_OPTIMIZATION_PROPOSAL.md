# Query Optimization Proposal for Large Scatter Datasets

## Executive Summary

This document proposes a comprehensive query optimization strategy to reduce dataset sizes for scatter charts and other visualizations by:

1. **Applying DISTINCT to scatter chart pairs** - Eliminate duplicate (x, y) coordinate pairs
2. **Adaptive rounding for large datasets** - Dynamically round values when DISTINCT yields >5000 points
3. **Handling multiple continuous dimension pairs** - Strategy for queries with multiple X/Y combinations
4. **Query optimization layer architecture** - Database-agnostic optimization framework

---

## Current State Analysis

### Existing Deduplication Logic

Currently implemented in `backend/services/query_service.py` (lines 286-320):

```python
# Check if continuous dimensions span both axes (scatter plot scenario)
has_continuous_on_x = any(d.axis == 'x' for d in continuous_dims)
has_continuous_on_y = any(d.axis == 'y' for d in continuous_dims)
is_scatter_plot = has_continuous_on_x and has_continuous_on_y

if not is_scatter_plot:
    # Apply DISTINCT for tick-strips
    q = q.distinct()
# else: scatter plot - keep all points, NO deduplication
```

**Problem**: Scatter plots can have thousands of duplicate points (same x,y coordinates), unnecessarily inflating dataset size.

### Example Scenario

Query: `SELECT price, quantity FROM orders`
- Raw result: 100,000 rows
- Unique pairs: 8,000 coordinates
- **Without optimization**: Transfer & render 100,000 points (many overlapping)
- **With DISTINCT**: Transfer & render 8,000 unique points
- **Reduction**: 92% smaller dataset, identical visual output

---

## Proposed Solution: Multi-Stage Optimization

### Stage 1: Always Apply DISTINCT for Scatter Charts

**Rationale**: Duplicate (x,y) pairs provide no additional visual information but significantly increase:
- Query execution time
- Network transfer size
- Browser memory usage
- Rendering performance

**Implementation**:
```python
if is_scatter_plot:
    # Apply DISTINCT to get unique coordinate pairs
    q = q.distinct()
```

**Database Support**:
- ✅ ClickHouse: `SELECT DISTINCT x, y FROM table`
- ✅ DuckDB: `SELECT DISTINCT x, y FROM table`
- ✅ PostgreSQL: `SELECT DISTINCT x, y FROM table`
- ✅ Standard SQL across all modern databases

---

### Stage 2: Adaptive Rounding for Large Result Sets

**Trigger**: When `COUNT(DISTINCT x, y) > 5000` points

**Strategy**: Apply data-aware rounding to increase duplicate count, then re-apply DISTINCT.

#### 2.1 Rounding Precision Algorithm

```python
def calculate_rounding_precision(min_val: float, max_val: float, target_buckets: int = 100) -> float:
    """
    Calculate appropriate rounding precision based on data range.
    
    Args:
        min_val: Minimum value in dataset
        max_val: Maximum value in dataset
        target_buckets: Desired number of distinct buckets (default: 100)
    
    Returns:
        Rounding precision (e.g., 0.1, 1, 10, 100, 1000)
    """
    data_range = max_val - min_val
    if data_range == 0:
        return 1
    
    # Calculate rough bucket size
    bucket_size = data_range / target_buckets
    
    # Round to nearest power of 10 (or half-power: 0.1, 0.5, 1, 5, 10, 50, 100, ...)
    magnitude = 10 ** math.floor(math.log10(bucket_size))
    
    # Choose between 1x, 2x, 5x, or 10x the magnitude
    if bucket_size < 2 * magnitude:
        return magnitude
    elif bucket_size < 5 * magnitude:
        return 2 * magnitude
    else:
        return 5 * magnitude
```

#### 2.2 Two-Pass Query Approach

**Pass 1: Estimate Result Size**
```sql
-- Fast count to check if optimization needed
SELECT 
    COUNT(*) as total_rows,
    COUNT(DISTINCT x, y) as unique_pairs,
    MIN(x) as x_min, MAX(x) as x_max,
    MIN(y) as y_min, MAX(y) as y_max
FROM table
WHERE x IS NOT NULL AND y IS NOT NULL
```

**Pass 2: Apply Rounding if Needed**
```sql
-- If unique_pairs > 5000, apply rounding
SELECT DISTINCT
    ROUND(x / 100) * 100 as x,  -- rounds to nearest 100
    ROUND(y / 10) * 10 as y     -- rounds to nearest 10
FROM table
WHERE x IS NOT NULL AND y IS NOT NULL
```

#### 2.3 Database-Specific Rounding Functions

| Database | Rounding Function | Example |
|----------|------------------|---------|
| ClickHouse | `ROUND(x / precision) * precision` | `ROUND(price / 100) * 100` |
| DuckDB | `ROUND(x / precision) * precision` | `ROUND(price / 100.0) * 100.0` |
| PostgreSQL | `ROUND(x / precision) * precision` | `ROUND(price / 100) * 100` |
| MySQL | `ROUND(x / precision) * precision` | `ROUND(price / 100) * 100` |

**Note**: Standard SQL `ROUND()` function works across all major databases.

---

### Stage 3: Intelligent Binning for Very Large Datasets

**Trigger**: When even with rounding, unique pairs > 10,000

**Strategy**: Apply 2D binning (hexagonal or rectangular grid) with aggregation.

```sql
-- Example: 2D rectangular binning with count
SELECT 
    ROUND(x / 1000) * 1000 as x_bin,
    ROUND(y / 100) * 100 as y_bin,
    COUNT(*) as point_count
FROM table
WHERE x IS NOT NULL AND y IS NOT NULL
GROUP BY x_bin, y_bin
```

**Visualization**: Use bubble chart where bubble size represents `point_count`.

---

## Multiple Continuous Dimensions on Both Axes

### Scenario
```typescript
X-axis fields: [price, quantity]
Y-axis fields: [revenue, profit]
```

This creates 4 scatter plot pairs:
1. price vs revenue
2. price vs profit  
3. quantity vs revenue
4. quantity vs profit

### Strategy Options

#### Option A: Independent Optimization (Recommended)
Optimize each pair independently:
- Different data ranges require different rounding precisions
- Some pairs may need optimization, others may not
- More accurate per-chart optimization

**Implementation**: 
- Frontend generates 4 separate queries
- Each query optimized independently
- Results cached per pair

#### Option B: Combined Query with Post-Processing
Single query fetching all fields, optimize on frontend:
```sql
SELECT DISTINCT price, quantity, revenue, profit
FROM table
WHERE price IS NOT NULL AND quantity IS NOT NULL 
  AND revenue IS NOT NULL AND profit IS NOT NULL
```

**Pros**: Single database round-trip  
**Cons**: Can't apply pair-specific rounding; transfers unused combinations

#### Recommendation: **Option A** for better optimization, **Option B** for performance on small datasets (<10k rows)

---

## Query Optimization Layer Architecture

### Design Principles

1. **Database-agnostic core** - Standard SQL optimizations work everywhere
2. **Database-specific extensions** - Leverage DB-specific features (sampling, approximate counts)
3. **Composable strategies** - Chain multiple optimizations
4. **Configuration-driven** - Enable/disable optimizations per deployment
5. **Transparent to frontend** - Optimizations applied automatically by backend

### Proposed Architecture

```
┌─────────────────────────────────────────────────────┐
│                Frontend (TypeScript)                 │
│  - Sends QueryDescription                           │
│  - Receives optimized results                       │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│          Backend API (FastAPI/Python)               │
│  - Validates QueryDescription                       │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│         QueryOptimizer (New Component)               │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │  analyze_query()                           │    │
│  │  - Detect chart type (scatter, bar, etc.)  │    │
│  │  - Estimate result size                    │    │
│  │  - Select optimization strategies          │    │
│  └────────────────────────────────────────────┘    │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │  apply_optimizations()                     │    │
│  │  - DISTINCT for scatter pairs              │    │
│  │  - Adaptive rounding                       │    │
│  │  - Sampling (existing)                     │    │
│  │  - Binning/aggregation                     │    │
│  └────────────────────────────────────────────┘    │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│      QueryService (Modified)                        │
│  - translate_to_sql()                               │
│  - Applies optimizer recommendations                │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│      Database Connector (ClickHouse/DuckDB)         │
└─────────────────────────────────────────────────────┘
```

### Component Details

#### QueryOptimizer Class

```python
class QueryOptimizer:
    """
    Analyzes queries and applies optimization strategies.
    """
    
    def __init__(self, connector: BaseConnector, config: OptimizerConfig):
        self.connector = connector
        self.config = config
        self.db_type = connector.db_type
    
    def optimize(self, query_desc: QueryDescription) -> OptimizationPlan:
        """
        Analyzes query and returns optimization plan.
        
        Returns:
            OptimizationPlan with strategies to apply
        """
        chart_type = self._detect_chart_type(query_desc)
        
        if chart_type == 'scatter':
            return self._optimize_scatter(query_desc)
        elif chart_type == 'bar':
            return self._optimize_bar(query_desc)
        else:
            return OptimizationPlan(strategies=[])
    
    def _optimize_scatter(self, query_desc: QueryDescription) -> OptimizationPlan:
        """Optimize scatter chart queries."""
        strategies = []
        
        # Always apply DISTINCT for scatter pairs
        strategies.append(DistinctPairStrategy())
        
        # Check if adaptive rounding needed
        if self.config.enable_adaptive_rounding:
            estimate = self._estimate_result_size(query_desc)
            if estimate > self.config.rounding_threshold:
                strategies.append(AdaptiveRoundingStrategy(
                    estimate=estimate,
                    db_type=self.db_type
                ))
        
        return OptimizationPlan(strategies=strategies)
    
    def _estimate_result_size(self, query_desc: QueryDescription) -> int:
        """
        Execute fast estimation query to predict result size.
        Uses COUNT(DISTINCT ...) or APPROX_COUNT_DISTINCT where available.
        """
        # Implementation varies by database
        pass
```

#### OptimizationStrategy Interface

```python
class OptimizationStrategy(ABC):
    """Base class for optimization strategies."""
    
    @abstractmethod
    def apply(self, query: Query, query_desc: QueryDescription) -> Query:
        """Apply optimization to pypika Query object."""
        pass
    
    @abstractmethod
    def estimate_reduction(self) -> float:
        """Estimate % reduction in result size (0.0-1.0)."""
        pass
```

#### DistinctPairStrategy

```python
class DistinctPairStrategy(OptimizationStrategy):
    """Apply DISTINCT to scatter chart dimension pairs."""
    
    def apply(self, query: Query, query_desc: QueryDescription) -> Query:
        continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']
        
        if len(continuous_dims) >= 2:
            # Apply DISTINCT to get unique coordinate pairs
            return query.distinct()
        
        return query
    
    def estimate_reduction(self) -> float:
        # Typically 50-95% reduction for transactional data
        return 0.7
```

#### AdaptiveRoundingStrategy

```python
class AdaptiveRoundingStrategy(OptimizationStrategy):
    """Apply intelligent rounding based on data ranges."""
    
    def __init__(self, estimate: int, db_type: str):
        self.estimate = estimate
        self.db_type = db_type
    
    def apply(self, query: Query, query_desc: QueryDescription) -> Query:
        """
        Modify SELECT clause to apply ROUND() functions.
        Requires knowing data ranges (from estimation query).
        """
        # Get dimension fields
        continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']
        
        # Calculate rounding precision for each dimension
        precisions = self._calculate_precisions(continuous_dims)
        
        # Modify SELECT clause to wrap dimensions in ROUND()
        modified_query = self._apply_rounding_to_query(query, continuous_dims, precisions)
        
        # Still apply DISTINCT after rounding
        return modified_query.distinct()
    
    def _calculate_precisions(self, dimensions: List[Dimension]) -> Dict[str, float]:
        """
        Query database for MIN/MAX of each dimension.
        Calculate appropriate rounding precision.
        """
        precisions = {}
        # Implementation: Execute range query, calculate precision
        return precisions
    
    def estimate_reduction(self) -> float:
        # Rounding typically achieves 20-50% additional reduction
        return 0.35
```

---

## Configuration

### OptimizerConfig

```python
@dataclass
class OptimizerConfig:
    """Configuration for query optimizer."""
    
    # Enable/disable optimization types
    enable_distinct_pairs: bool = True
    enable_adaptive_rounding: bool = True
    enable_binning: bool = False  # For future use
    
    # Thresholds
    rounding_threshold: int = 5000  # Apply rounding if more than N unique pairs
    binning_threshold: int = 10000  # Apply binning if more than N points
    
    # Rounding parameters
    target_buckets: int = 100  # Desired number of distinct values per dimension
    
    # Estimation settings
    use_approximate_count: bool = True  # Use APPROX_COUNT_DISTINCT if available
    estimation_timeout_ms: int = 500  # Max time for estimation query
    
    # Database-specific settings
    db_type: str = 'clickhouse'
```

### Environment Variables

```bash
# .env
OPTIMIZER_ENABLE_DISTINCT_PAIRS=true
OPTIMIZER_ENABLE_ADAPTIVE_ROUNDING=true
OPTIMIZER_ROUNDING_THRESHOLD=5000
OPTIMIZER_TARGET_BUCKETS=100
```

---

## Implementation Phases

### Phase 1: Foundation (1-2 days)
- [ ] Create `QueryOptimizer` class structure
- [ ] Implement `DistinctPairStrategy` 
- [ ] Add scatter chart DISTINCT support
- [ ] Update tests

### Phase 2: Adaptive Rounding (2-3 days)
- [ ] Implement range estimation queries
- [ ] Add rounding precision calculation
- [ ] Implement `AdaptiveRoundingStrategy`
- [ ] Add database-specific rounding syntax
- [ ] Update frontend to show "Data rounded for performance" hint

### Phase 3: Configuration & Monitoring (1-2 days)
- [ ] Add `OptimizerConfig` with environment variables
- [ ] Implement optimization metrics logging
- [ ] Add performance benchmarks
- [ ] Document optimization behavior

### Phase 4: Advanced Optimizations (Future)
- [ ] 2D binning/hexagonal binning for massive datasets
- [ ] Approximate algorithms (HyperLogLog for cardinality)
- [ ] Client-side sampling as fallback
- [ ] Query result caching

---

## Expected Performance Improvements

### Benchmark Scenario: E-commerce Orders Dataset
- **Dataset**: 1M orders with price, quantity, revenue columns
- **Query**: Scatter plot of price vs quantity

| Optimization | Result Size | Transfer Time | Render Time | Total Reduction |
|--------------|-------------|---------------|-------------|-----------------|
| None | 1,000,000 rows | 8.5s | 3.2s | 0% |
| DISTINCT only | 12,000 rows | 0.9s | 0.3s | **90% faster** |
| DISTINCT + Rounding | 4,800 rows | 0.4s | 0.1s | **96% faster** |

---

## Security & Safety Considerations

### Preventing Optimization Abuse

1. **Estimation Query Timeout**: Cap estimation queries at 500ms
2. **Max Rounding Threshold**: Don't apply rounding if it would reduce precision below acceptable level
3. **User Notification**: Show UI hint when data is rounded ("~5000 points shown")
4. **Disable on Demand**: Allow users to opt-out of optimizations for exact results

### Data Accuracy

- **Rounding preserves patterns**: Visual patterns remain visible even with precision loss
- **Exact counts available**: Users can switch to aggregated mode for exact statistics
- **Documented behavior**: Clear documentation on when/how rounding is applied

---

## API Changes

### Backend Changes

#### New Endpoint (Optional): Estimation API
```http
POST /api/v1/data/estimate
Content-Type: application/json

{
  "query_description": { ... }
}

Response:
{
  "estimated_rows": 45000,
  "unique_pairs": 8200,
  "x_range": [0.5, 999.8],
  "y_range": [10, 5000],
  "recommended_optimizations": ["distinct", "rounding"]
}
```

#### Modified Query Endpoint
```http
POST /api/v1/data/query
Content-Type: application/json

{
  "query_description": { ... },
  "optimization_options": {
    "enable_auto_optimize": true,  // Default: true
    "max_result_size": 10000
  }
}

Response:
{
  "columns": [...],
  "rows": [...],
  "row_count": 4800,
  "query_sql": "SELECT DISTINCT ROUND(price/100)*100, ROUND(qty/10)*10 ...",
  "optimizations_applied": ["distinct", "rounding"],
  "original_estimate": 45000,
  "reduction_factor": 0.89
}
```

---

## Frontend Changes

### Performance Hints UI

Add notification when optimizations are applied:

```tsx
<Alert severity="info">
  <AlertTitle>Performance Optimization Applied</AlertTitle>
  Showing ~5,000 unique coordinate pairs (rounded from 45,000 points). 
  Visual patterns preserved. 
  <Link>Learn more</Link> or <Link>Show exact values</Link>
</Alert>
```

### Configuration in Settings Panel

```tsx
<FormControlLabel
  control={<Checkbox checked={enableAutoOptimize} />}
  label="Enable automatic query optimization for large datasets"
/>

<TextField
  label="Max points before optimization"
  type="number"
  value={optimizationThreshold}
  helperText="Apply rounding when scatter plots exceed this many unique points"
/>
```

---

## Testing Strategy

### Unit Tests

```python
def test_distinct_pair_optimization():
    """Test DISTINCT is applied to scatter queries."""
    optimizer = QueryOptimizer(connector, config)
    query_desc = create_scatter_query_desc()
    
    plan = optimizer.optimize(query_desc)
    
    assert any(isinstance(s, DistinctPairStrategy) for s in plan.strategies)

def test_rounding_precision_calculation():
    """Test rounding precision for various data ranges."""
    # Range 0-100 should round to 1
    assert calculate_rounding_precision(0, 100) == 1
    
    # Range 0-10000 should round to 100
    assert calculate_rounding_precision(0, 10000) == 100
    
    # Range 0.1-1.0 should round to 0.01
    assert calculate_rounding_precision(0.1, 1.0) == 0.01
```

### Integration Tests

```python
def test_scatter_optimization_end_to_end(db_connector):
    """Test full optimization flow with real database."""
    # Insert test data (50,000 rows with 5,000 unique pairs)
    insert_test_data(db_connector, rows=50000, unique_pairs=5000)
    
    query_desc = QueryDescription(
        dimensions=[
            Dimension(field='x', flavour='continuous', axis='x'),
            Dimension(field='y', flavour='continuous', axis='y')
        ],
        target_table='test_data'
    )
    
    result = execute_optimized_query(query_desc)
    
    # Should return ~5000 unique pairs, not 50000 rows
    assert result.row_count <= 5500
    assert 'DISTINCT' in result.query_sql
```

### Performance Tests

```python
@pytest.mark.benchmark
def test_optimization_performance_improvement(benchmark):
    """Benchmark query performance with/without optimization."""
    
    # Without optimization
    baseline = benchmark(execute_query, unoptimized_query)
    
    # With optimization
    optimized = benchmark(execute_query, optimized_query)
    
    # Should be at least 5x faster
    assert optimized.mean_time < baseline.mean_time / 5
```

---

## Open Questions

1. **Should rounding be applied client-side or server-side?**
   - **Recommendation**: Server-side for data reduction benefits
   - Client-side as fallback for databases without ROUND support

2. **How to handle timezone conversions with datetime rounding?**
   - Always round in UTC before timezone conversion
   - Document timezone handling in user guide

3. **Should we cache optimization results?**
   - **Recommendation**: Yes, cache estimation queries (5min TTL)
   - Cache actual results for repeated identical queries

4. **How to handle multiple scatter plots in dashboard context?**
   - Each chart optimized independently
   - Consider shared optimization metadata for common fields

5. **User control over optimization aggressiveness?**
   - Add slider: "Precision vs Performance" in settings
   - Maps to different rounding thresholds (1000, 5000, 10000)

---

## Conclusion

This optimization strategy provides:

✅ **90%+ reduction in scatter plot dataset sizes** through DISTINCT  
✅ **Additional 40-60% reduction** with adaptive rounding  
✅ **Database-agnostic architecture** that works across ClickHouse, DuckDB, PostgreSQL  
✅ **Transparent to users** while providing opt-out mechanisms  
✅ **Extensible framework** for future optimization strategies  

The proposed `QueryOptimizer` layer provides a clean, maintainable architecture that can evolve with new optimization techniques while keeping the core query generation logic simple.

### Next Steps

1. Review and discuss this proposal with the team
2. Prioritize implementation phases
3. Create detailed task breakdown for Phase 1
4. Begin implementation with DISTINCT optimization
5. Monitor performance improvements and iterate

---

**Document Version**: 1.0  
**Last Updated**: 2025-10-17  
**Author**: Data Slicer Team  
**Status**: Proposal - Awaiting Review
