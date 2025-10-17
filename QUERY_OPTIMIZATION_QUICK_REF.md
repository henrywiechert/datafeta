# Query Optimization Quick Reference

A developer's cheat sheet for understanding and implementing query optimization.

---

## When Optimization Applies

| Chart Type | Optimization | Trigger Condition |
|------------|--------------|-------------------|
| Scatter Plot (2 cont. dims) | DISTINCT | Always |
| Scatter Plot (large) | DISTINCT + Rounding | unique_pairs > 5000 |
| Tick Strip (1 cont. dim) | DISTINCT | Always (existing) |
| Bar Chart (aggregated) | None | N/A (already optimal) |
| Multiple pairs | Independent queries | Per-pair decision |

---

## SQL Examples

### Basic Scatter Plot (Small)
```sql
-- Input: 50,000 rows, 4,200 unique pairs
SELECT DISTINCT price, quantity
FROM orders
WHERE price IS NOT NULL AND quantity IS NOT NULL

-- Output: 4,200 rows (92% reduction)
```

### Large Scatter Plot (Rounding Applied)
```sql
-- Pass 1: Estimate
SELECT 
    uniq(price, quantity) as unique_pairs,
    MIN(price), MAX(price),
    MIN(quantity), MAX(quantity)
FROM orders
WHERE price IS NOT NULL AND quantity IS NOT NULL

-- Result: unique_pairs = 45,000 (exceeds threshold)

-- Pass 2: Apply rounding
SELECT DISTINCT
    ROUND(price / 100) * 100 as price,
    ROUND(quantity / 50) * 50 as quantity
FROM orders
WHERE price IS NOT NULL AND quantity IS NOT NULL

-- Output: 4,800 rows (89% reduction from 45k)
```

---

## Rounding Precision Calculation

```python
def calculate_precision(min_val: float, max_val: float) -> float:
    """Quick formula for rounding precision."""
    range = max_val - min_val
    bucket_size = range / 100  # Target 100 buckets
    magnitude = 10 ** floor(log10(bucket_size))
    
    if bucket_size < 2 * magnitude:
        return magnitude
    elif bucket_size < 5 * magnitude:
        return 2 * magnitude
    else:
        return 5 * magnitude

# Examples:
# Range $0-$1000 → precision $10
# Range 0-10000 → precision 100
# Range 0.1-1.0 → precision 0.01
```

---

## Architecture Cheat Sheet

```python
# 1. Detect optimization need
chart_type = detect_chart_type(query_desc)
if chart_type == 'scatter':
    apply_distinct = True

# 2. Estimate size
estimate = estimator.estimate_size(query_desc)
if estimate.unique_pairs > 5000:
    apply_rounding = True

# 3. Build optimization plan
strategies = []
if apply_distinct:
    strategies.append(DistinctPairStrategy())
if apply_rounding:
    strategies.append(AdaptiveRoundingStrategy(estimate))

# 4. Apply optimizations
plan = OptimizationPlan(strategies)
optimized_query = plan.apply(base_query, query_desc, table)

# 5. Execute and return with metadata
results = execute(optimized_query)
return results, plan.get_metadata_summary()
```

---

## Configuration Quick Reference

### Environment Variables
```bash
# Essential
OPTIMIZER_ENABLE_DISTINCT_PAIRS=true
OPTIMIZER_ENABLE_ADAPTIVE_ROUNDING=true

# Thresholds
OPTIMIZER_ROUNDING_THRESHOLD=5000    # Apply rounding if > N pairs
OPTIMIZER_TARGET_BUCKETS=100         # Buckets per dimension

# Performance
OPTIMIZER_ESTIMATION_TIMEOUT_MS=500  # Max time for estimation
```

### Runtime Override
```typescript
// Disable optimization for specific query
const result = await executeQuery({
  queryDescription: {...},
  optimizationOptions: {
    enableAutoOptimize: false
  }
});
```

---

## Database-Specific Features

| Feature | ClickHouse | DuckDB | PostgreSQL | MySQL | SQLite |
|---------|------------|--------|------------|-------|--------|
| DISTINCT | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROUND() | ✅ | ✅ | ✅ | ✅ | ✅ |
| Fast Count | `uniq()` | `approx_count_distinct()` | HLL ext | ❌ | ❌ |
| Sampling | `ORDER BY rand()` | `USING SAMPLE` | `TABLESAMPLE` | `ORDER BY RAND()` | `RANDOM()` |

---

## API Response Format

```typescript
interface QueryResult {
  columns: Column[];
  rows: Row[];
  row_count: number;
  query_sql: string;
  
  // New fields
  optimizations_applied?: Array<{
    strategy: string;           // e.g., "distinct_pairs"
    reduction: number;          // e.g., 0.7 (70% reduction)
    parameters: Record<string, any>;
  }>;
  original_estimate?: number;   // e.g., 45000
  reduction_factor?: number;    // e.g., 0.89 (89% reduction)
}
```

---

## Common Patterns

### Pattern 1: Simple Scatter Plot
```typescript
// Frontend
const query = {
  dimensions: [
    { field: 'price', axis: 'x', flavour: 'continuous' },
    { field: 'quantity', axis: 'y', flavour: 'continuous' }
  ],
  measures: []
};

// Backend automatically applies DISTINCT
// SQL: SELECT DISTINCT price, quantity FROM table
```

### Pattern 2: Multiple Dimension Pairs (Independent)
```typescript
// Frontend generates separate queries
const pairs = [
  { x: 'price', y: 'quantity' },
  { x: 'price', y: 'revenue' }
];

const results = await Promise.all(
  pairs.map(pair => executeQuery({
    dimensions: [
      { field: pair.x, axis: 'x', flavour: 'continuous' },
      { field: pair.y, axis: 'y', flavour: 'continuous' }
    ]
  }))
);

// Each query optimized independently
```

### Pattern 3: Multiple Dimension Pairs (Combined)
```typescript
// Single query for small datasets
const query = {
  dimensions: [
    { field: 'price', axis: 'x', flavour: 'continuous' },
    { field: 'discount', axis: 'x', flavour: 'continuous' },
    { field: 'quantity', axis: 'y', flavour: 'continuous' },
    { field: 'revenue', axis: 'y', flavour: 'continuous' }
  ]
};

// Backend: SELECT DISTINCT price, discount, quantity, revenue
// Frontend extracts pairs: (price×quantity), (price×revenue), etc.
```

---

## Debugging Checklist

### Optimization Not Applied?

1. **Check chart type detection**
   ```python
   logger.info(f"Chart type: {chart_type}")
   # Should be 'scatter' for optimization
   ```

2. **Verify axis information**
   ```python
   has_x = any(d.axis == 'x' for d in continuous_dims)
   has_y = any(d.axis == 'y' for d in continuous_dims)
   # Both should be True for scatter
   ```

3. **Check configuration**
   ```python
   assert config.enable_distinct_pairs == True
   assert config.enable_adaptive_rounding == True
   ```

4. **Review estimation results**
   ```python
   logger.info(f"Estimate: {estimate.unique_pairs} pairs")
   # If None, estimation failed
   ```

### Performance Issues?

1. **Estimation timeout**
   - Increase `OPTIMIZER_ESTIMATION_TIMEOUT_MS`
   - Or use approximate count functions

2. **Rounding too aggressive**
   - Increase `OPTIMIZER_TARGET_BUCKETS`
   - Reduces bucket size, more precision

3. **Still too many rows**
   - Lower `OPTIMIZER_ROUNDING_THRESHOLD`
   - Apply rounding earlier

---

## Testing Snippets

### Unit Test: DISTINCT Strategy
```python
def test_distinct_strategy():
    strategy = DistinctPairStrategy()
    
    query_desc = QueryDescription(
        dimensions=[
            Dimension(field='x', flavour='continuous', axis='x'),
            Dimension(field='y', flavour='continuous', axis='y')
        ]
    )
    
    assert strategy.can_apply(query_desc) == True
    
    query = Query.from_(Table('test')).select('x', 'y')
    optimized = strategy.apply(query, query_desc, Table('test'))
    
    assert 'DISTINCT' in optimized.get_sql().upper()
```

### Integration Test: End-to-End
```python
def test_scatter_optimization_e2e(db_connector):
    # Setup: 50k rows, 5k unique pairs
    insert_test_data(50000, unique_pairs=5000)
    
    query_desc = QueryDescription(...)
    result = execute_optimized_query(query_desc)
    
    # Verify reduction
    assert result.row_count < 6000
    assert result.row_count > 4000
    
    # Verify metadata
    assert 'distinct_pairs' in [opt['strategy'] for opt in result.optimizations_applied]
```

---

## Performance Benchmarks

### Target Metrics

| Metric | Baseline | With DISTINCT | With Rounding | Target |
|--------|----------|---------------|---------------|--------|
| Query Time | 3.5s | 3.2s | 3.5s | <4s |
| Transfer Time | 6.0s | 0.8s | 0.3s | <1s |
| Total Time | 9.5s | 4.0s | 3.8s | <5s |
| Rows Returned | 100k | 12k | 4.8k | <10k |

### When to Optimize

```python
# Decision matrix
if chart_type == 'scatter':
    if estimated_rows > 1000:
        apply_distinct()
    
    if unique_pairs > 5000:
        apply_rounding()
    
    if unique_pairs > 10000:
        consider_binning()  # Future
```

---

## Frontend UI Snippets

### Optimization Hint (React)
```tsx
{result.optimizations_applied && (
  <Alert severity="info">
    <AlertTitle>Optimized for Performance</AlertTitle>
    Showing {result.row_count.toLocaleString()} unique points
    {result.original_estimate && (
      <> ({Math.round(result.reduction_factor * 100)}% reduction)</>
    )}
    {result.optimizations_applied.map(opt => (
      <Chip key={opt.strategy} label={opt.strategy} size="small" />
    ))}
  </Alert>
)}
```

### Settings Panel (React)
```tsx
<FormControlLabel
  control={
    <Switch
      checked={enableOptimization}
      onChange={(e) => setEnableOptimization(e.target.checked)}
    />
  }
  label="Enable automatic query optimization"
/>

<TextField
  label="Max points before optimization"
  type="number"
  value={roundingThreshold}
  onChange={(e) => setRoundingThreshold(Number(e.target.value))}
  helperText="Apply rounding when unique pairs exceed this value"
/>
```

---

## Troubleshooting

### Problem: Estimation query is slow

**Solution**: Use approximate count functions
```python
# ClickHouse
SELECT uniq(x, y) FROM table  # Fast, ±2% error

# DuckDB
SELECT approx_count_distinct(x || y) FROM table

# Fallback (exact but slow)
SELECT COUNT(DISTINCT x, y) FROM table
```

### Problem: Rounding too aggressive

**Solution**: Increase target buckets
```bash
# Increase from 100 to 200 buckets
OPTIMIZER_TARGET_BUCKETS=200
```

### Problem: Optimization not helping

**Solution**: Check data characteristics
```sql
-- Analyze data distribution
SELECT 
    COUNT(*) as total_rows,
    COUNT(DISTINCT x, y) as unique_pairs,
    COUNT(DISTINCT x) as unique_x,
    COUNT(DISTINCT y) as unique_y
FROM table

-- High ratio of unique to total = optimization won't help much
-- Low ratio = optimization very beneficial
```

---

## Code Organization

```
backend/services/optimization/
├── __init__.py
├── optimizer.py              # QueryOptimizer class
├── config.py                 # OptimizerConfig
├── strategies/
│   ├── __init__.py
│   ├── base.py              # OptimizationStrategy ABC
│   ├── distinct_pairs.py    # DistinctPairStrategy
│   ├── adaptive_rounding.py # AdaptiveRoundingStrategy
│   └── sampling.py          # SamplingStrategy (future)
└── estimators/
    ├── __init__.py
    ├── base.py              # ResultSizeEstimator ABC
    ├── clickhouse.py        # ClickHouseEstimator
    └── duckdb.py            # DuckDBEstimator
```

---

## Useful SQL Functions

### ClickHouse
```sql
-- Approximate distinct count (fast)
SELECT uniq(x, y) FROM table

-- Random sampling
SELECT * FROM table ORDER BY rand() LIMIT 5000
```

### DuckDB
```sql
-- Approximate distinct count
SELECT approx_count_distinct(x || '-' || y) FROM table

-- Sampling
SELECT * FROM table USING SAMPLE 5000 ROWS
```

### PostgreSQL
```sql
-- Exact distinct count (slower)
SELECT COUNT(DISTINCT (x, y)) FROM table

-- Sampling
SELECT * FROM table TABLESAMPLE BERNOULLI(10)  -- 10%
```

---

## Key Formulas

### Data Reduction Factor
```
reduction_factor = 1 - (optimized_rows / original_rows)

Example: 100,000 → 4,800 rows
reduction_factor = 1 - (4800 / 100000) = 0.952 = 95.2%
```

### Rounding Precision
```
precision = 10^floor(log10(range / target_buckets))

Example: Range $0-$1000, target 100 buckets
bucket_size = 1000 / 100 = 10
precision = 10^floor(log10(10)) = 10^1 = 10
```

### Expected Query Time
```
total_time = query_time + transfer_time + render_time

query_time ≈ constant (with/without optimization)
transfer_time ∝ data_size
render_time ∝ data_size

reduction in transfer+render ≈ reduction in data size
```

---

## Related Files

- [query_service.py](backend/services/query_service.py) - Main query translation
- [base.py](backend/connectors/base.py) - Database connectors
- [query.py](backend/models/query.py) - QueryDescription models
- [queryBuilder.ts](frontend/src/queryBuilder/queryBuilder.ts) - Frontend query builder

---

**Last Updated**: 2025-10-17  
**For**: Quick reference during development  
**Related**: QUERY_OPTIMIZATION_SUMMARY.md for full context
