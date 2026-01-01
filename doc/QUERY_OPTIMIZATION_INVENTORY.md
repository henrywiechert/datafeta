# Query Optimization Inventory

This document provides a comprehensive inventory of all query optimization techniques currently implemented in Data Slicer, across backend, frontend, and local (DuckDB WASM) execution contexts.

**Last Updated**: January 2026

## Summary Table

| # | Technique | Location | DB Target | Scope | Trigger | Purpose |
|---|-----------|----------|-----------|-------|---------|---------|
| **1** | Small Table Detection | Backend: `table_size_detector.py` | All (ClickHouse, DuckDB/CSV) | Remote | Auto (< 5000 rows) | Skip all optimizations for small tables to avoid overhead |
| **2** | Adaptive Rounding | Backend: `adaptive_rounding.py` | All | Remote | Hints + Auto | Round continuous dimensions to reduce cardinality |
| **3** | DateTime Binning | Backend: `datetime_binning.py` | All | Remote | Hints + Auto | `date_trunc()` binning for timeline dimensions |
| **4** | DISTINCT (Distinct Pairs) | Backend: `distinct_pairs.py` | All | Remote | Hints + Auto | Apply DISTINCT to raw queries to remove duplicates |
| **5** | Discrete Deduplication | Backend: `discrete_dedup.py` | All | Remote | Auto | DISTINCT for discrete-only dimension queries |
| **6** | Category Deduplication | Backend: `category_dedup.py` | All | Remote | Auto | GROUP BY + any() for scatter with color encoding |
| **7** | Random Sampling | Backend: `sampling_limits_builder.py` | All | Remote | Auto + Flag | ORDER BY random() LIMIT for large raw queries |
| **8** | Distinct Value Regex Filter | Backend: `filter_builder.py` | All | Remote | API param | LIKE filter on distinct value queries |
| **9** | Result Budget (Stratified) | Backend: `query_service.py` | All | Remote | API param | Stratified/random sampling for oversize results |
| **10** | Force Raw Rows | Backend: `grouping_ordering_builder.py` | All | Remote | API param | Disable DISTINCT/GROUP BY for caching slices |
| **11** | Row Count Probing | Frontend: `queryDecisionEngine.ts` | N/A | Decision | Auto | Probe `/row-count` to decide local vs remote strategy |
| **12** | Column-Slice Caching | Frontend: `columnCacheManager.ts` | DuckDB WASM | Local | Auto | Cache base-filtered slices by (db, table, filterHash) |
| **13** | Filter Tiers (Base/Refinement) | Frontend: `filterTierManager.ts` | Both | Routing | Manual (lock icon) | Route base filters to backend, refinement to local |
| **14** | Local Adaptive Rounding | Frontend: `chartQueryService.ts` | DuckDB WASM | Local | Auto | Per-chart rounding based on local cardinality |
| **15** | Local Point Budget | Frontend: `localSqlBuilder.ts` | DuckDB WASM | Local | Auto | Random/stratified sampling with preserved extremes |
| **16** | Local Line Budget | Frontend: `localSqlBuilder.ts` | DuckDB WASM | Local | Auto | Sample aggregated line results preserving min/max |
| **17** | Line Auto-Aggregation | Frontend: `lineChart.ts` | N/A (in-memory) | Render | Auto | Bin-aggregate dense line series to avoid hairball |
| **18** | Frontend Optimization Hints | Frontend: `optimizationHintGenerator.ts` | → Backend | Hints | Auto | Generate field-level hints for backend |

---

## Detailed Breakdown by Layer

### A. Backend Optimization Strategies

Located in `backend/services/optimization/`

| Strategy | File | DB Support | When Applied | Description |
|----------|------|------------|--------------|-------------|
| **SmallTableDetector** | `table_size_detector.py` | ClickHouse, DuckDB | Before all | If `row_count < 5000`, skip all optimizations |
| **AdaptiveRoundingStrategy** | `strategies/adaptive_rounding.py` | All | Raw data, ≥1 continuous dim | `ROUND(field, precision)` to reduce unique values |
| **DateTimeBinningStrategy** | `strategies/datetime_binning.py` | All | Timeline dimensions | `date_trunc('unit', field)` to bin timestamps |
| **DistinctPairStrategy** | `strategies/distinct_pairs.py` | All | Raw data queries | Apply `DISTINCT` to reduce duplicate rows |
| **DiscreteDeduplicationStrategy** | `strategies/discrete_dedup.py` | All | Discrete-only queries | `DISTINCT` for category/filter value queries |
| **CategoryDeduplicationStrategy** | `strategies/category_dedup.py` | All | Scatter with color | `GROUP BY x,y` with `any(category)` for dedup |

#### Configuration

File: `backend/services/optimization/config.py`

```python
@dataclass
class OptimizerConfig:
    enable_distinct_pairs: bool = True
    enable_adaptive_rounding: bool = True
    rounding_threshold: int = 10000
    target_buckets: int = 100
    enable_small_table_detection: bool = True
    small_table_threshold: int = 5000
    enable_count_cache: bool = True
    count_cache_ttl_seconds: int = 300
```

Environment variables:
- `OPTIMIZER_ENABLE_DISTINCT_PAIRS`
- `OPTIMIZER_ENABLE_ADAPTIVE_ROUNDING`
- `OPTIMIZER_ROUNDING_THRESHOLD`
- `OPTIMIZER_TARGET_BUCKETS`
- `OPTIMIZER_ENABLE_SMALL_TABLE_DETECTION`
- `OPTIMIZER_SMALL_TABLE_THRESHOLD`

---

### B. Backend Query-Level Optimizations

Located in `backend/services/query_components/`

| Mechanism | File | Trigger | Description |
|-----------|------|---------|-------------|
| **Sampling & Limits** | `sampling_limits_builder.py` | Raw single-dim query | `ORDER BY rand() LIMIT 5000` for ClickHouse |
| **Random Sample Flag** | `sampling_limits_builder.py` | `use_random_sample=True` | `ORDER BY random()` for filter dropdowns |
| **Distinct Value Regex** | `filter_builder.py` | `distinct_value_regex` param | `LIKE '%pattern%'` for search-as-you-type |
| **Result Budget** | `query_service.py` | `result_budget` in QueryDescription | Stratified or random sampling post-query |
| **Force Raw Rows** | `grouping_ordering_builder.py`, `distinct_applier.py` | `force_raw_rows=True` | Disable DISTINCT/GROUP BY for caching |

#### QueryDescription Optimization Fields

From `backend/models/query.py`:

```python
class QueryDescription(BaseModel):
    # Optimization hints from frontend
    optimization_hints: Optional[OptimizationHints] = None
    
    # For distinct value queries
    distinct_value_regex: Optional[str] = None  # SQL LIKE pattern
    use_random_sample: Optional[bool] = None    # ORDER BY RANDOM()
    fetch_filter_values: Optional[bool] = None  # Explicit filter query flag
    
    # Result reduction
    result_budget: Optional[ResultBudget] = None  # Stratified sampling
    force_raw_rows: Optional[bool] = None         # Disable optimizations for caching
```

---

### C. Frontend Query Decision & Routing

Located in `frontend/src/services/`

| Component | File | Purpose |
|-----------|------|---------|
| **QueryDecisionEngine** | `queryDecisionEngine.ts` | Decides `cache_hit` / `raw_columns` / `pre_aggregated` based on row count |
| **FilterTierManager** | `filterTierManager.ts` | Splits filters into base (→ backend) vs refinement (→ local) |
| **ColumnCacheManager** | `columnCacheManager.ts` | Tracks cached columns by `(db, table, baseFilterHash)` |
| **QueryExecutionOrchestrator** | `queryExecutionOrchestrator.ts` | Coordinates decision → fetch → cache → local query |
| **OptimizationHintGenerator** | `optimizationHintGenerator.ts` | Generates field-level hints to send to backend |

#### Size Threshold

From `queryDecisionEngine.ts`:

```typescript
const DEFAULT_SIZE_THRESHOLD = 5_000_000; // rows
```

#### Query Strategies

```typescript
type QueryStrategy = 'raw_columns' | 'pre_aggregated' | 'cache_hit';
```

- **cache_hit**: All required columns available locally → query DuckDB WASM
- **raw_columns**: Small dataset (< threshold) → fetch raw slice, cache, query locally
- **pre_aggregated**: Large dataset (> threshold) → backend aggregation

---

### D. Frontend Local Optimizations (DuckDB WASM)

| Technique | File | Trigger | Description |
|-----------|------|---------|-------------|
| **Local Adaptive Rounding** | `chartQueryService.ts` | `pairCount > 10000` | Calculate precision from range, apply `ROUND()` |
| **Point Budget (Random)** | `localSqlBuilder.ts` | Scatter/tick strip | `ORDER BY random() LIMIT maxPoints` |
| **Point Budget (Stratified)** | `localSqlBuilder.ts` | Scatter with color | Per-stratum sampling with `row_number() OVER PARTITION` |
| **Point Budget (Preserve Extremes)** | `localSqlBuilder.ts` | Scatter | Keep min/max points for each continuous field |
| **Line Budget** | `localSqlBuilder.ts` | Dense aggregated lines | Random sample with preserved min/max |
| **DateTime Part Extraction** | `localSqlBuilder.ts` | Datetime dimensions | `EXTRACT()` / `date_trunc()` computed locally |

#### Local Rounding Thresholds

From `chartQueryService.ts`:

```typescript
const DEFAULT_TARGET_BUCKETS = 100;
const DEFAULT_ROUNDING_THRESHOLD = 10000;
```

---

### E. Frontend Render-Time Optimizations

| Technique | File | Purpose |
|-----------|------|---------|
| **Line Auto-Aggregation** | `lineChart.ts` (`binAggregateLine`) | Bin-average dense X values to prevent hairball |

This runs in-memory after data is fetched, binning many X values into ~maxBins buckets with averaged Y values.

---

## Flow: Frontend → Backend Optimization Hints

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Frontend: optimizationHintGenerator.ts                                     │
│  ─────────────────────────────────────────                                  │
│  Analyzes fields and generates:                                             │
│  • field_hints[]: enable_rounding, rounding_threshold per field             │
│  • enable_global_distinct: true for raw queries                             │
│  • optimization_level: 'light' | 'balanced' | 'aggressive'                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Backend: QueryOptimizer.create_plan()                                      │
│  ─────────────────────────────────────                                      │
│  1. SmallTableDetector.check() → skip all if < 5000 rows                    │
│  2. If hints provided → StrategyPlanner.create_from_hints()                 │
│  3. Else → StrategyPlanner.create_from_query_structure()                    │
│  4. Returns OptimizationPlan with ordered strategies                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Backend: OptimizationPlan.apply()                                          │
│  ─────────────────────────────────                                          │
│  Applies strategies in priority order:                                      │
│  • DiscreteDeduplicationStrategy (priority 5)                               │
│  • DistinctPairStrategy (priority 10)                                       │
│  • AdaptiveRoundingStrategy (priority 20)                                   │
│  • DateTimeBinningStrategy (priority 20)                                    │
│  • CategoryDeduplicationStrategy (priority 25)                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Threshold Reference

| Threshold | Value | Location | Purpose |
|-----------|-------|----------|---------|
| `small_table_threshold` | 5,000 | Backend config | Skip all optimizations |
| `rounding_threshold` | 10,000 | Backend config | Apply rounding above this cardinality |
| `target_buckets` | 100 | Backend config | Target distinct values after rounding |
| `DEFAULT_SIZE_THRESHOLD` | 5,000,000 | Frontend queryDecisionEngine | Raw vs pre-aggregated decision |
| `DEFAULT_ROUNDING_THRESHOLD` | 10,000 | Frontend chartQueryService | Local rounding trigger |
| `DEFAULT_TARGET_BUCKETS` | 100 | Frontend chartQueryService | Local rounding target |
| `ROW_COUNT_CACHE_TTL` | 5 min | Frontend queryDecisionEngine | Row count probe cache |
| `count_cache_ttl_seconds` | 300 | Backend config | Table size cache TTL |

---

## Issues & Inconsistencies

### 1. Duplicate Logic
Adaptive rounding exists in both backend (`adaptive_rounding.py`) and frontend (`chartQueryService.ts`) with similar but not identical thresholds.

### 2. Threshold Confusion
Multiple thresholds with similar purposes but different values:
- Backend `rounding_threshold`: 10,000
- Frontend `DEFAULT_ROUNDING_THRESHOLD`: 10,000
- Frontend `DEFAULT_SIZE_THRESHOLD`: 5,000,000
- Backend `small_table_threshold`: 5,000

### 3. Hints Flow Complexity
Frontend generates hints → backend may override → frontend may apply local optimizations anyway. The interplay can be confusing.

### 4. DB-Specific Gaps
- `result_budget` stratified sampling SQL differs between ClickHouse/DuckDB but implemented in single `query_service.py`
- Some estimators (cardinality) are DB-specific but strategy selection is generic

### 5. Feature Flags Scattered
Configuration spread across:
- Backend `OptimizerConfig` dataclass
- Backend environment variables
- Frontend service constants
- Frontend config objects

### 6. Local vs Remote Ambiguity
When `force_raw_rows=True`, backend skips optimizations, but frontend may still apply local ones after caching.

---

## Recommendations for Harmonization

### 1. Unified Configuration
Create single source of truth for thresholds, possibly shared via API endpoint or build-time injection.

### 2. Clear Responsibility Boundaries

| Responsibility | Backend | Frontend |
|----------------|---------|----------|
| SQL generation | ✅ | ❌ |
| DB-specific syntax | ✅ | ❌ |
| Large dataset handling | ✅ | ❌ |
| Local cache management | ❌ | ✅ |
| Per-chart optimization | ❌ | ✅ |
| Render-time reduction | ❌ | ✅ |

### 3. Simplify Hint Flow
Consider making backend fully authoritative:
- Frontend sends field types and chart context only
- Backend decides all optimization strategies
- Frontend only applies render-time (post-fetch) optimizations

### 4. Consolidate Point Budget Logic
Currently duplicated in:
- `localSqlBuilder.ts` (local execution)
- `query_service.py` (remote execution)

Should share strategy definitions with DB-specific SQL generation.

### 5. Document DB-Specific Behaviors
Create compatibility matrix:

| Optimization | ClickHouse | DuckDB (remote) | DuckDB WASM (local) |
|--------------|------------|-----------------|---------------------|
| `rand()` / `random()` | `rand()` | `random()` | `random()` |
| `date_trunc` | ✅ | ✅ | ✅ |
| `APPROX_COUNT_DISTINCT` | `uniq()` | ❌ | ❌ |
| Stratified sampling | Custom SQL | Custom SQL | Custom SQL |

---

## File Reference

### Backend
- `backend/services/optimization/optimizer.py` - Main coordinator
- `backend/services/optimization/strategy_planner.py` - Strategy factory
- `backend/services/optimization/config.py` - Configuration
- `backend/services/optimization/table_size_detector.py` - Small table detection
- `backend/services/optimization/strategies/*.py` - Individual strategies
- `backend/services/query_components/sampling_limits_builder.py` - Sampling logic
- `backend/services/query_service.py` - Query generation with optimizations

### Frontend
- `frontend/src/services/queryDecisionEngine.ts` - Local vs remote decision
- `frontend/src/services/queryExecutionOrchestrator.ts` - Execution coordination
- `frontend/src/services/columnCacheManager.ts` - Cache management
- `frontend/src/services/filterTierManager.ts` - Filter routing
- `frontend/src/services/chartQueryService.ts` - Per-chart local queries
- `frontend/src/services/localSqlBuilder.ts` - Local SQL generation
- `frontend/src/services/optimizationHintGenerator.ts` - Hint generation
- `frontend/src/observable-plot-generator/chartTypes/lineChart.ts` - Line auto-aggregation
