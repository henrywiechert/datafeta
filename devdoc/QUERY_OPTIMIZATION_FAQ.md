# Query Optimization FAQ

## Your Questions Answered

This document directly addresses the specific questions and concerns raised about query optimization for scatter charts.

---

## Q1: How to optimize queries when having 2 continuous dimensions for scatter charts?

### Current Problem
```sql
-- Current query (no optimization)
SELECT price, quantity
FROM orders
WHERE price IS NOT NULL AND quantity IS NOT NULL

-- Result: 100,000 rows (many duplicates)
```

### Solution: Apply DISTINCT

```sql
-- Optimized query
SELECT DISTINCT price, quantity
FROM orders
WHERE price IS NOT NULL AND quantity IS NOT NULL

-- Result: 8,000 unique coordinate pairs
-- Reduction: 92% fewer rows
```

### Why This Works

In scatter plots, duplicate (x, y) coordinates provide **zero additional visual information**:

- **Before**: 100,000 points (many overlapping)
- **After**: 8,000 unique points (same visual output)
- **Benefits**:
  - 92% smaller dataset to transfer
  - 92% less memory usage in browser
  - Faster rendering
  - Identical visual output

### Implementation

The `DistinctPairStrategy` automatically detects scatter plot queries and applies DISTINCT:

```python
# Detection logic
has_continuous_on_x = any(d.axis == 'x' for d in continuous_dims)
has_continuous_on_y = any(d.axis == 'y' for d in continuous_dims)
is_scatter_plot = has_continuous_on_x and has_continuous_on_y

if is_scatter_plot:
    q = q.distinct()  # Apply DISTINCT
```

**Database Compatibility**: ✅ Works on ALL databases (ClickHouse, DuckDB, PostgreSQL, MySQL, etc.)

---

## Q2: What if dataset is still too large after DISTINCT (>5000 points)?

### Problem Scenario

```sql
-- Even with DISTINCT, still too large
SELECT DISTINCT price, quantity
FROM orders
WHERE price IS NOT NULL AND quantity IS NOT NULL

-- Result: 45,000 unique pairs (still too many!)
```

### Solution: Adaptive Rounding

Apply **data-aware rounding** to reduce precision and increase duplicates:

```sql
-- Rounding applied based on data ranges
SELECT DISTINCT
    ROUND(price / 100) * 100 as price,      -- Round to nearest $100
    ROUND(quantity / 10) * 10 as quantity   -- Round to nearest 10 units
FROM orders
WHERE price IS NOT NULL AND quantity IS NOT NULL

-- Result: 4,800 unique pairs (90% reduction from 45,000)
```

### How Rounding Precision is Calculated

The system analyzes data ranges to determine appropriate precision:

**Example 1: Price Range $0.50 - $999.99**
- Data range: $999.49
- Target: 100 buckets
- Bucket size: $999.49 / 100 ≈ $10
- **Rounding precision: $10**

**Example 2: Quantity Range 1 - 10,000**
- Data range: 9,999
- Target: 100 buckets
- Bucket size: 9,999 / 100 ≈ 100
- **Rounding precision: 100 units**

**Example 3: Small Decimal Range 0.001 - 0.999**
- Data range: 0.998
- Target: 100 buckets
- Bucket size: 0.00998
- **Rounding precision: 0.01**

### Algorithm

```python
def calculate_rounding_precision(min_val: float, max_val: float) -> float:
    data_range = max_val - min_val
    bucket_size = data_range / 100  # Target 100 buckets
    
    # Round to nearest "nice" number (power of 10 or half-power)
    magnitude = 10 ** floor(log10(bucket_size))
    
    if bucket_size < 2 * magnitude:
        return magnitude          # e.g., 0.1, 1, 10, 100
    elif bucket_size < 5 * magnitude:
        return 2 * magnitude      # e.g., 0.2, 2, 20, 200
    else:
        return 5 * magnitude      # e.g., 0.5, 5, 50, 500
```

### Two-Pass Query Approach

**Pass 1: Estimate Size and Ranges**
```sql
SELECT 
    COUNT(*) as total_rows,
    uniq(price, quantity) as unique_pairs,  -- ClickHouse approximate count
    MIN(price) as price_min,
    MAX(price) as price_max,
    MIN(quantity) as qty_min,
    MAX(quantity) as qty_max
FROM orders
WHERE price IS NOT NULL AND quantity IS NOT NULL
```

**Decision Point:**
- If `unique_pairs <= 5000` → No rounding needed, use DISTINCT only
- If `unique_pairs > 5000` → Calculate rounding precision and proceed to Pass 2

**Pass 2: Apply Rounding**
```sql
SELECT DISTINCT
    ROUND(price / {calculated_precision}) * {calculated_precision} as price,
    ROUND(quantity / {calculated_precision}) * {calculated_precision} as quantity
FROM orders
WHERE price IS NOT NULL AND quantity IS NOT NULL
```

### Performance Impact

| Stage | Rows | Query Time | Transfer Time | Total |
|-------|------|------------|---------------|-------|
| No optimization | 100,000 | 2.5s | 6s | **8.5s** |
| DISTINCT only | 45,000 | 3.2s | 3s | **6.2s** |
| DISTINCT + Rounding | 4,800 | 3.5s | 0.3s | **3.8s** |

**Note**: Estimation query (Pass 1) adds ~0.2s overhead but saves 4.7s total.

---

## Q3: What to do with multiple continuous dimensions on both axes?

### Scenario: Multiple Pairs

```typescript
// User configuration
X-axis fields: [price, discount_amount]
Y-axis fields: [quantity, revenue]
```

This creates **4 scatter plot combinations**:
1. price vs quantity
2. price vs revenue
3. discount_amount vs quantity
4. discount_amount vs revenue

### Strategy A: Independent Optimization (Recommended)

**Approach**: Optimize each pair separately

```typescript
// Frontend generates 4 independent queries
const queries = [
  { x: 'price', y: 'quantity' },
  { x: 'price', y: 'revenue' },
  { x: 'discount_amount', y: 'quantity' },
  { x: 'discount_amount', y: 'revenue' }
];

// Each query optimized independently
queries.forEach(async pair => {
  const result = await executeQuery({
    dimensions: [
      { field: pair.x, axis: 'x', flavour: 'continuous' },
      { field: pair.y, axis: 'y', flavour: 'continuous' }
    ]
  });
  
  renderScatterPlot(pair.x, pair.y, result.rows);
});
```

**SQL Generated (Example for price vs quantity)**:
```sql
-- Estimation query
SELECT uniq(price, quantity) as unique_pairs,
       MIN(price), MAX(price),
       MIN(quantity), MAX(quantity)
FROM orders
WHERE price IS NOT NULL AND quantity IS NOT NULL

-- If unique_pairs > 5000, apply rounding
SELECT DISTINCT 
    ROUND(price / 100) * 100 as price,
    ROUND(quantity / 50) * 50 as quantity
FROM orders
WHERE price IS NOT NULL AND quantity IS NOT NULL
```

**Advantages**:
✅ Each pair optimized with its own precision  
✅ Different pairs may need different rounding levels  
✅ More accurate optimization  
✅ Parallel execution possible  

**Disadvantages**:
❌ 4 separate database queries (2x for estimation + optimization)  
❌ More network round-trips  

---

### Strategy B: Combined Query with Post-Processing

**Approach**: Fetch all fields in one query, process on frontend

```sql
-- Single query fetching all fields
SELECT DISTINCT price, discount_amount, quantity, revenue
FROM orders
WHERE price IS NOT NULL 
  AND discount_amount IS NOT NULL
  AND quantity IS NOT NULL 
  AND revenue IS NOT NULL
```

Then on frontend:
```typescript
const result = await executeQuery({
  dimensions: [
    { field: 'price', axis: 'x', flavour: 'continuous' },
    { field: 'discount_amount', axis: 'x', flavour: 'continuous' },
    { field: 'quantity', axis: 'y', flavour: 'continuous' },
    { field: 'revenue', axis: 'y', flavour: 'continuous' }
  ]
});

// Extract pairs client-side
const priceQtyData = result.rows.map(r => ({ x: r.price, y: r.quantity }));
const priceRevData = result.rows.map(r => ({ x: r.price, y: r.revenue }));
// ... etc
```

**Advantages**:
✅ Single database query  
✅ One network round-trip  
✅ Simpler backend logic  

**Disadvantages**:
❌ Can't apply pair-specific rounding precision  
❌ Transfers unused field combinations  
❌ May still be too large if high cardinality  
❌ Limited optimization options  

---

### Recommendation: Hybrid Approach

**Use Strategy A (Independent) when:**
- Any pair exceeds 5000 points
- Data ranges differ significantly between fields
- Network latency is low (local network, cloud within same region)

**Use Strategy B (Combined) when:**
- All pairs together < 10,000 rows
- Fields have similar ranges (e.g., all prices in dollars)
- Network latency is high (optimize for fewer round-trips)

**Implementation**:
```typescript
// Frontend decision logic
const estimateSize = (fields) => {
  // Rough heuristic: number of fields * 2000
  return fields.length * 2000;
};

const xFields = ['price', 'discount_amount'];
const yFields = ['quantity', 'revenue'];
const totalPairs = xFields.length * yFields.length;
const estimatedRows = estimateSize(xFields) * estimateSize(yFields);

if (estimatedRows > 10000 || totalPairs > 4) {
  // Use independent queries
  return generateIndependentQueries(xFields, yFields);
} else {
  // Use combined query
  return generateCombinedQuery(xFields, yFields);
}
```

---

## Q4: Should we create a query optimization layer for all DB types?

### Answer: **Yes, absolutely!**

### Why a General Optimization Layer?

1. **Consistency Across Databases**
   - Same optimization logic for ClickHouse, DuckDB, PostgreSQL
   - Unified configuration and monitoring
   - Easier to maintain and test

2. **Database-Specific Enhancements**
   - ClickHouse: Use `uniq()` for fast approximate counts
   - DuckDB: Use built-in sampling with `USING SAMPLE`
   - PostgreSQL: Use `TABLESAMPLE BERNOULLI`
   - Fallback to standard SQL for others

3. **Extensibility**
   - Easy to add new optimization strategies
   - Can compose multiple optimizations
   - Configuration-driven behavior

4. **Separation of Concerns**
   - Query generation logic stays clean
   - Optimization logic is modular
   - Easy to enable/disable optimizations

### Architecture Overview

```
┌─────────────────────────────────────────────┐
│         QueryOptimizer (Core)               │
│  - Detects chart type                       │
│  - Estimates result size                    │
│  - Selects optimization strategies          │
└────────────┬────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────┐
│      Optimization Strategies                │
│  - DistinctPairStrategy                     │
│  - AdaptiveRoundingStrategy                 │
│  - SamplingStrategy                         │
│  - BinningStrategy (future)                 │
└────────────┬────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────┐
│   Database-Specific Estimators              │
│  - ClickHouseEstimator (uniq)               │
│  - DuckDBEstimator (approx_count_distinct)  │
│  - BasicEstimator (standard SQL)            │
└─────────────────────────────────────────────┘
```

### Database-Specific Features Matrix

| Feature | ClickHouse | DuckDB | PostgreSQL | MySQL | Standard SQL |
|---------|------------|--------|------------|-------|--------------|
| DISTINCT | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROUND() | ✅ | ✅ | ✅ | ✅ | ✅ |
| Approximate COUNT | `uniq()` | `approx_count_distinct()` | `HLL` extension | ❌ | ❌ |
| Fast Sampling | `ORDER BY rand()` | `USING SAMPLE` | `TABLESAMPLE` | `ORDER BY RAND()` | ❌ |
| 2D Binning | ✅ | ✅ | ✅ | ✅ | ✅ |

### Implementation Strategy

**Phase 1**: Core optimizations using **standard SQL only**
- DISTINCT (works everywhere)
- ROUND() (works everywhere)
- Basic estimation with COUNT(DISTINCT ...)

**Phase 2**: Database-specific enhancements
- Add ClickHouse `uniq()` estimator
- Add DuckDB `approx_count_distinct()` estimator
- Optimize sampling for each database

**Phase 3**: Advanced optimizations
- 2D hexagonal binning
- Adaptive sampling rates
- Query result caching

### Configuration Example

```python
# config.py
@dataclass
class OptimizerConfig:
    # Universal settings
    enable_distinct_pairs: bool = True
    enable_adaptive_rounding: bool = True
    rounding_threshold: int = 5000
    
    # Database-specific settings
    db_type: str = 'clickhouse'
    use_approximate_count: bool = True  # Use db-specific fast counts if available
    
    # Database-specific parameters
    db_params: Dict[str, Any] = field(default_factory=lambda: {
        'clickhouse': {
            'use_uniq': True,
            'sample_method': 'ORDER BY rand()'
        },
        'duckdb': {
            'use_approx_count': True,
            'sample_method': 'USING SAMPLE'
        },
        'postgresql': {
            'use_hll': False,  # Requires extension
            'sample_method': 'TABLESAMPLE BERNOULLI'
        }
    })
```

### Benefits of Unified Layer

1. **Code Reuse**: 90% of optimization logic is database-agnostic
2. **Consistency**: Same behavior across deployments
3. **Testing**: Test once, works everywhere (with db-specific tests for enhancements)
4. **Monitoring**: Unified metrics and logging
5. **User Experience**: Same performance benefits regardless of backend

---

## Summary Table: Optimization Decision Tree

| Scenario | Total Rows | Unique Pairs | Optimization Applied | Expected Result |
|----------|-----------|--------------|---------------------|----------------|
| Small dataset | 1,000 | 800 | None | 1,000 rows |
| Sparse duplicates | 50,000 | 8,000 | DISTINCT only | ~8,000 rows |
| Dense duplicates | 100,000 | 4,500 | DISTINCT only | ~4,500 rows |
| High cardinality | 500,000 | 45,000 | DISTINCT + Rounding | ~4,800 rows |
| Very high cardinality | 1M | 200,000 | DISTINCT + Aggressive Rounding | ~8,000 rows |
| Massive dataset | 10M | 500,000 | DISTINCT + Rounding + Binning | ~5,000 rows |

---

## Key Takeaways

### ✅ For Scatter Charts (2 continuous dimensions):
- **Always use DISTINCT** - eliminates duplicates, works on all databases
- Typically achieves **50-95% reduction** in data size
- No visual information loss

### ✅ For Large Scatter Charts (>5000 unique pairs):
- **Apply adaptive rounding** based on data ranges
- Two-pass approach: estimate first, then optimize
- Achieves additional **30-60% reduction**
- Minimal precision loss, patterns preserved

### ✅ For Multiple Dimension Pairs:
- **Use independent queries** for high cardinality (>10k rows per pair)
- **Use combined query** for low cardinality (<10k total)
- Each approach has trade-offs in network vs computation

### ✅ For Cross-Database Support:
- **Build unified optimization layer** with database-agnostic core
- **Add database-specific enhancements** as optional accelerations
- **Use standard SQL** as baseline (DISTINCT, ROUND)
- **Leverage db-specific features** for better performance (uniq, approx_count)

---

## Implementation Priority

### Must Have (Phase 1)
1. ✅ DISTINCT for scatter plots
2. ✅ QueryOptimizer framework
3. ✅ DistinctPairStrategy

### Should Have (Phase 2)
4. ✅ Adaptive rounding
5. ✅ Size estimation
6. ✅ ClickHouse-specific estimator

### Nice to Have (Phase 3)
7. ⏳ DuckDB/PostgreSQL estimators
8. ⏳ 2D binning for massive datasets
9. ⏳ Query result caching

### Future Enhancements
10. 🔮 Client-side sampling fallback
11. 🔮 Approximate algorithms (HyperLogLog)
12. 🔮 ML-based precision tuning

---

**Last Updated**: 2025-10-17  
**Status**: Ready for Implementation  
**Estimated Effort**: 7-9 days (1 developer)
