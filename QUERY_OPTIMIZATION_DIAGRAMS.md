# Query Optimization Architecture Diagrams

Visual representations of the query optimization system architecture and workflows.

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Field Config │  │ Chart Area   │  │ Optimization │         │
│  │              │  │              │  │ Hint Display │         │
│  └──────┬───────┘  └──────┬───────┘  └──────▲───────┘         │
│         │                 │                  │                  │
│         └─────────┬───────┘                  │                  │
│                   │                          │                  │
│                   ▼                          │                  │
│         ┌──────────────────┐                │                  │
│         │  Query Builder   │                │                  │
│         │  Constructs      │                │                  │
│         │  QueryDescription│                │                  │
│         └────────┬─────────┘                │                  │
└──────────────────┼──────────────────────────┼──────────────────┘
                   │                          │
                   │ HTTP POST                │ Metadata
                   ▼                          │
┌─────────────────────────────────────────────┼──────────────────┐
│                    Backend API (FastAPI)     │                  │
│                                              │                  │
│         ┌──────────────────┐                │                  │
│         │  /api/v1/data    │                │                  │
│         │  /query          │                │                  │
│         └────────┬─────────┘                │                  │
│                  │                          │                  │
│                  ▼                          │                  │
│         ┌──────────────────┐               │                  │
│         │  QueryService    │               │                  │
│         │  translate_to_sql│               │                  │
│         └────────┬─────────┘               │                  │
│                  │                          │                  │
│                  │                          │                  │
│         ┌────────▼──────────┐              │                  │
│         │  QueryOptimizer   │              │                  │
│         │  ┌──────────────┐ │              │                  │
│         │  │ analyze_query│ │──────────────┘                  │
│         │  └──────┬───────┘ │    Returns optimization         │
│         │         │         │    metadata                     │
│         │  ┌──────▼───────┐ │                                 │
│         │  │create_plan() │ │                                 │
│         │  └──────┬───────┘ │                                 │
│         │         │         │                                 │
│         │  ┌──────▼───────┐ │                                 │
│         │  │OptimizationP│ │                                 │
│         │  │lan.apply()  │ │                                 │
│         │  └──────┬───────┘ │                                 │
│         └─────────┼─────────┘                                 │
│                   │                                            │
│         ┌─────────▼────────────────────────┐                  │
│         │  Optimization Strategies         │                  │
│         │  ┌────────────────────────────┐  │                  │
│         │  │ DistinctPairStrategy       │  │                  │
│         │  │ - Adds DISTINCT            │  │                  │
│         │  └────────────────────────────┘  │                  │
│         │  ┌────────────────────────────┐  │                  │
│         │  │ AdaptiveRoundingStrategy   │  │                  │
│         │  │ - Calculates precision     │  │                  │
│         │  │ - Wraps fields in ROUND()  │  │                  │
│         │  └────────────────────────────┘  │                  │
│         │  ┌────────────────────────────┐  │                  │
│         │  │ SamplingStrategy (future)  │  │                  │
│         │  └────────────────────────────┘  │                  │
│         └──────────────┬───────────────────┘                  │
│                        │                                       │
│                        │ Returns optimized pypika Query        │
│                        ▼                                       │
│         ┌──────────────────────────┐                          │
│         │  Generate SQL String     │                          │
│         │  query.get_sql()         │                          │
│         └──────────────┬───────────┘                          │
└────────────────────────┼────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Database (ClickHouse/DuckDB)                  │
│                                                                  │
│  Execute optimized SQL:                                         │
│  SELECT DISTINCT                                                │
│    ROUND(price / 100) * 100 as price,                          │
│    ROUND(quantity / 10) * 10 as quantity                       │
│  FROM orders                                                    │
│  WHERE price IS NOT NULL AND quantity IS NOT NULL              │
│                                                                  │
│  Returns: 4,800 rows (instead of 100,000)                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Query Optimization Decision Flow

```
                    ┌──────────────────┐
                    │ Query Request    │
                    │ Received         │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ QueryOptimizer   │
                    │ analyze_query()  │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ Detect Chart Type│
                    │ - Scatter?       │
                    │ - Bar?           │
                    │ - Tick strip?    │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
    ┌─────────────┐  ┌──────────────┐  ┌──────────┐
    │  Scatter    │  │  Bar Chart   │  │  Other   │
    │  Plot       │  │  (Aggregated)│  │          │
    └──────┬──────┘  └──────┬───────┘  └────┬─────┘
           │                │                │
           │                │                │
           ▼                ▼                ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────┐
    │ Apply        │  │ No           │  │ No       │
    │ DISTINCT     │  │ Optimization │  │ Optim.   │
    │ Strategy     │  │ (already     │  │          │
    │              │  │ optimized)   │  │          │
    └──────┬───────┘  └──────┬───────┘  └────┬─────┘
           │                 │                │
           ▼                 │                │
    ┌──────────────┐         │                │
    │ Estimate     │         │                │
    │ Result Size  │         │                │
    │ (Fast query) │         │                │
    └──────┬───────┘         │                │
           │                 │                │
           ▼                 │                │
    ┌──────────────┐         │                │
    │ unique_pairs │         │                │
    │ > 5000?      │         │                │
    └──────┬───────┘         │                │
           │                 │                │
     ┌─────┴─────┐           │                │
     │           │           │                │
    YES         NO           │                │
     │           │           │                │
     ▼           │           │                │
┌─────────────┐  │           │                │
│ Apply       │  │           │                │
│ Adaptive    │  │           │                │
│ Rounding    │  │           │                │
│ Strategy    │  │           │                │
└──────┬──────┘  │           │                │
       │         │           │                │
       └─────┬───┘           │                │
             │               │                │
             ▼               ▼                ▼
        ┌─────────────────────────────────────┐
        │  Build OptimizationPlan             │
        │  with selected strategies           │
        └─────────────┬───────────────────────┘
                      │
                      ▼
        ┌─────────────────────────────────────┐
        │  Apply strategies to pypika Query   │
        │  - Modify SELECT clause             │
        │  - Add DISTINCT                     │
        │  - Wrap in ROUND() if needed        │
        └─────────────┬───────────────────────┘
                      │
                      ▼
        ┌─────────────────────────────────────┐
        │  Generate SQL & Execute             │
        │  Return results + metadata          │
        └─────────────────────────────────────┘
```

---

## Adaptive Rounding Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│               PASS 1: Estimation Query                          │
└─────────────────────────────────────────────────────────────────┘

    SELECT 
        COUNT(*) as total_rows,                    -- Total row count
        uniq(price, quantity) as unique_pairs,     -- Approximate unique
        MIN(price) as x_min, MAX(price) as x_max,  -- X-axis range
        MIN(quantity) as y_min, MAX(quantity) as y_max  -- Y-axis range
    FROM orders
    WHERE price IS NOT NULL AND quantity IS NOT NULL

    ⏱️  Execution time: ~200-500ms
    📊  Result: { total: 100000, unique: 45000, ranges: {...} }

                             │
                             ▼
                    ┌──────────────────┐
                    │ Check threshold  │
                    │ unique > 5000?   │
                    └────────┬─────────┘
                             │
                            YES
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│               Calculate Rounding Precision                       │
└─────────────────────────────────────────────────────────────────┘

    For price field:
        Range: $0.50 - $999.99 = $999.49
        Target buckets: 100
        Bucket size: $999.49 / 100 = $9.99
        
        Magnitude: 10^floor(log10(9.99)) = 10^0 = 1
        
        Since 9.99 > 5 * 1:
            Precision = 5 * 1 = 5
        
        ✅ Round to nearest $5

    For quantity field:
        Range: 1 - 5000 = 4999
        Bucket size: 4999 / 100 = 49.99
        
        Magnitude: 10^floor(log10(49.99)) = 10^1 = 10
        
        Since 49.99 > 5 * 10:
            Precision = 5 * 10 = 50
        
        ✅ Round to nearest 50 units

                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│               PASS 2: Optimized Query                           │
└─────────────────────────────────────────────────────────────────┘

    SELECT DISTINCT
        ROUND(price / 5) * 5 as price,        -- Round to $5
        ROUND(quantity / 50) * 50 as quantity -- Round to 50 units
    FROM orders
    WHERE price IS NOT NULL AND quantity IS NOT NULL

    ⏱️  Execution time: ~3.0s
    📊  Result: 4,800 unique rounded pairs

                             │
                             ▼
                    ┌──────────────────┐
                    │ Calculate        │
                    │ Reduction        │
                    │ 100000 → 4800    │
                    │ 96% reduction!   │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ Return to client │
                    │ with metadata    │
                    └──────────────────┘
```

---

## Multiple Dimension Pairs Handling

### Strategy A: Independent Queries

```
User Configuration:
    X-axis: [price, discount]
    Y-axis: [quantity, revenue]

                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Generate 4 Independent Queries                      │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐    ┌──────────────────┐
│  Query 1         │    │  Query 2         │
│  price ×         │    │  price ×         │
│  quantity        │    │  revenue         │
│                  │    │                  │
│ DISTINCT         │    │ DISTINCT         │
│ price, quantity  │    │ price, revenue   │
└────────┬─────────┘    └────────┬─────────┘
         │                       │
         │  ┌──────────────────┐ │    ┌──────────────────┐
         │  │  Query 3         │ │    │  Query 4         │
         │  │  discount ×      │ │    │  discount ×      │
         │  │  quantity        │ │    │  revenue         │
         │  │                  │ │    │                  │
         │  │ DISTINCT         │ │    │ DISTINCT         │
         │  │ discount, qty    │ │    │ discount, rev    │
         │  └────────┬─────────┘ │    └────────┬─────────┘
         │           │           │             │
         └───────┬───┴───────────┴─────────────┘
                 │
                 ▼
        ┌─────────────────────┐
        │ Execute in parallel │
        │ 4 separate queries  │
        └─────────┬───────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │ Each optimized with │
        │ its own precision   │
        │                     │
        │ Query 1: 4,800 rows │
        │ Query 2: 3,200 rows │
        │ Query 3: 2,100 rows │
        │ Query 4: 1,900 rows │
        └─────────┬───────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │ Render 4 scatter    │
        │ plots in grid       │
        └─────────────────────┘

Pros: ✅ Optimal per-pair precision
      ✅ Parallel execution
      ✅ Flexible optimization

Cons: ❌ 4 database round-trips
      ❌ More API calls
```

### Strategy B: Combined Query

```
User Configuration:
    X-axis: [price, discount]
    Y-axis: [quantity, revenue]

                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Generate Single Combined Query                      │
└─────────────────────────────────────────────────────────────────┘

    SELECT DISTINCT 
        price,
        discount,
        quantity,
        revenue
    FROM orders
    WHERE price IS NOT NULL 
      AND discount IS NOT NULL
      AND quantity IS NOT NULL
      AND revenue IS NOT NULL

                             │
                             ▼
                    ┌──────────────────┐
                    │ Execute once     │
                    │ Get 8,500 rows   │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ Send to frontend │
                    └────────┬─────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Frontend: Extract Pairs                            │
└─────────────────────────────────────────────────────────────────┘

    data = [
        { price: 100, discount: 10, quantity: 5, revenue: 500 },
        { price: 150, discount: 15, quantity: 3, revenue: 450 },
        ...
    ]

    // Extract 4 datasets
    chart1Data = data.map(r => ({ x: r.price, y: r.quantity }))
    chart2Data = data.map(r => ({ x: r.price, y: r.revenue }))
    chart3Data = data.map(r => ({ x: r.discount, y: r.quantity }))
    chart4Data = data.map(r => ({ x: r.discount, y: r.revenue }))

                             │
                             ▼
                    ┌──────────────────┐
                    │ Render 4 scatter │
                    │ plots in grid    │
                    └──────────────────┘

Pros: ✅ Single database query
      ✅ One API call
      ✅ Simpler logic

Cons: ❌ Can't optimize per-pair
      ❌ May transfer unused combinations
      ❌ All-or-nothing DISTINCT
```

---

## Database-Specific Estimator Flow

```
                    ┌──────────────────┐
                    │ Need to estimate │
                    │ result size      │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ What database?   │
                    └────────┬─────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  ClickHouse     │  │  DuckDB         │  │  Other (MySQL,  │
│                 │  │                 │  │  PostgreSQL)    │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                     │
         ▼                    ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Use uniq()      │  │ Use approx_     │  │ Use COUNT       │
│ (HyperLogLog)   │  │ count_distinct()│  │ DISTINCT        │
│                 │  │                 │  │ (exact, slower) │
│ SELECT          │  │ SELECT          │  │                 │
│   uniq(x, y)    │  │   approx_count_ │  │ SELECT          │
│   as pairs      │  │   distinct(x||y)│  │   COUNT(        │
│ FROM table      │  │   as pairs      │  │   DISTINCT x,y) │
│                 │  │ FROM table      │  │   as pairs      │
│ ⚡ ~100ms       │  │ ⚡ ~150ms       │  │ ⏱️ ~2-5s        │
│ 📊 ±2% error    │  │ 📊 ±1% error    │  │ 📊 Exact        │
└─────────┬───────┘  └────────┬────────┘  └────────┬────────┘
          │                   │                     │
          └───────────────────┼─────────────────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │ Return estimate │
                     │ unique_pairs    │
                     │ dimension_ranges│
                     └─────────────────┘
```

---

## Frontend Optimization Hint Display

```
┌─────────────────────────────────────────────────────────────────┐
│  Scatter Plot: Price vs Quantity                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  ℹ️  Performance Optimization Applied                      │ │
│  │                                                             │ │
│  │  Showing 4,800 unique coordinate pairs (rounded from       │ │
│  │  45,000 points). Visual patterns preserved.                │ │
│  │                                                             │ │
│  │  [distinct_pairs] [adaptive_rounding]                      │ │
│  │                                                             │ │
│  │  Learn more  |  Show exact values                          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                          │   │
│  │       1000 ┤                     •                      │   │
│  │            │           •    •        •                  │   │
│  │        800 ┤      •        •    •       •              │   │
│  │ Quantity   │   •     •        •     •                  │   │
│  │        600 ┤      •        •            •              │   │
│  │            │  •        •  •        •                   │   │
│  │        400 ┤     •           •                         │   │
│  │            │        •    •                             │   │
│  │        200 ┤  •                                        │   │
│  │            │                                           │   │
│  │          0 └──────────────────────────────────────────│   │
│  │            0   200   400   600   800  1000           │   │
│  │                        Price                          │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Precision: Price rounded to $5, Quantity rounded to 50 units   │
│  96% reduction in data size • Original estimate: 45,000 points  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Configuration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Configuration Sources                         │
└─────────────────────────────────────────────────────────────────┘

    ┌─────────────────┐     ┌─────────────────┐     ┌────────────┐
    │ Environment     │     │ Config File     │     │ Runtime    │
    │ Variables       │     │ (optional)      │     │ Override   │
    │                 │     │                 │     │            │
    │ .env file:      │     │ config.yaml:    │     │ API param: │
    │                 │     │                 │     │            │
    │ OPTIMIZER_      │     │ optimizer:      │     │ enable_opt:│
    │ ENABLE_DISTINCT │     │   distinct: on  │     │   false    │
    │ =true           │     │   rounding: on  │     │            │
    │                 │     │   threshold:    │     │ (per-query)│
    │ OPTIMIZER_      │     │     5000        │     │            │
    │ ROUNDING_       │     │                 │     │            │
    │ THRESHOLD=5000  │     │                 │     │            │
    └────────┬────────┘     └────────┬────────┘     └──────┬─────┘
             │                       │                     │
             └───────────────────────┼─────────────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │  OptimizerConfig        │
                        │  - Load from env        │
                        │  - Merge with defaults  │
                        │  - Apply runtime        │
                        │    overrides            │
                        └───────────┬─────────────┘
                                    │
                                    ▼
                        ┌─────────────────────────┐
                        │  QueryOptimizer         │
                        │  initialized with       │
                        │  final config           │
                        └─────────────────────────┘

Priority (highest to lowest):
    1. Runtime override (per-query)
    2. Environment variables (.env)
    3. Config file (if present)
    4. Built-in defaults
```

---

## Performance Monitoring Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│              Query Optimization Metrics Dashboard                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Optimization Success Rate                         📊 Last 24h  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Optimized Queries:    ████████████████████░░  87%  (348/400)  │
│  Unoptimized Queries:  ████░░░░░░░░░░░░░░░░  13%  (52/400)   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Average Data Reduction by Strategy                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DISTINCT only:           ██████████████████░  75%  reduction  │
│  DISTINCT + Rounding:     ████████████████████  92%  reduction  │
│  All strategies:          ██████████████████░  78%  avg        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Query Performance (Avg)                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Unoptimized:  ████████████████████████  8.2s                  │
│  Optimized:    ████████░░░░░░░░░░░░░░░  3.4s  (59% faster)    │
│                                                                  │
│  Estimation overhead: 0.3s                                      │
│  Net improvement:     4.5s faster                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Recent Optimizations                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  10:23 AM  price × quantity       45k → 4.8k (89% ↓)  ✅       │
│  10:21 AM  revenue × discount     12k → 8.2k (32% ↓)  ✅       │
│  10:19 AM  category × amount       850 rows          ⊘ (skip)  │
│  10:17 AM  date × revenue         2.3k → 2.3k (0% ↓)  ⊘ (skip)  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Legend

```
Symbols Used:
  │  Flow connection
  ▼  Flow direction
  ┌┐ Box/component boundary
  ──  Horizontal line
  ✅  Success/Enabled
  ❌  Failure/Disabled
  ⏱️  Time duration
  📊  Data/metrics
  ⚡  Fast operation
  🔮  Future feature
  ⏳  In progress
  ⊘  Skipped/Not applicable
```

---

**Document Version**: 1.0  
**Last Updated**: 2025-10-17  
**For**: Data Slicer Query Optimization System
