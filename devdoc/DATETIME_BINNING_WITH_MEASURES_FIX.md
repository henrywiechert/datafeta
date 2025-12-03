# DateTime Binning with MeasureValues Fix

## Problem

When using MeasureValues together with a continuous full DateTime dimension, the time was not being binned. This created too much data in the query response because:

1. Each unique timestamp created a separate group in the aggregated query
2. The optimization system assumed that GROUP BY (used with measures) handles all deduplication needs
3. DateTime binning was only applied to raw data queries (no measures), not aggregated queries

## Root Cause

The issue occurred in two places:

### 1. Backend: Strategy Planner Logic
In `/backend/services/optimization/strategy_planner.py`, the `create_from_query_structure` method had this logic:

```python
if has_measures:
    # Aggregated query - GROUP BY handles deduplication.
    # NO OPTIMIZATION STRATEGIES APPLIED
else:
    # Apply rounding/binning strategies
```

This meant that when MeasureValues was unpivoted into actual measures, the resulting aggregated query skipped all optimization strategies, including DateTime binning.

### 2. Frontend: Optimization Hints Not Passed
In `/frontend/src/queryBuilder/syntheticQueryBuilder.ts`, the `buildUnpivotedQuery` function did not accept or pass optimization hints to the backend. This meant that even field-level hints (which could trigger binning) were not available.

## Solution

### Backend Changes

Modified `/backend/services/optimization/strategy_planner.py` to check for timeline dimensions even when measures are present:

```python
def create_from_query_structure(self, query_desc: QueryDescription) -> List[OptimizationStrategy]:
    """Default strategy planning when no hints are provided."""
    strategies: List[OptimizationStrategy] = []

    has_measures = bool(query_desc.measures)
    continuous_dims = [d for d in query_desc.dimensions if d.flavour == "continuous"]
    discrete_dims = [d for d in query_desc.dimensions if d.flavour == "discrete"]
    timeline_dims = [d for d in query_desc.dimensions if d.flavour == "continuous" and d.date_mode == "timeline"]

    if has_measures:
        # Aggregated query - GROUP BY handles deduplication.
        self._logger.info(
            "Aggregated query with %s measures - no deduplication needed",
            len(query_desc.measures),
        )
        
        # However, we still need to bin timeline dimensions to prevent too many groups
        if timeline_dims and self._config.enable_adaptive_rounding:
            self._logger.info(
                "Checking if datetime binning needed for %s timeline dimensions",
                len(timeline_dims),
            )
            binning_strategy = self._rounding_planner.plan_binning(
                query_desc,
                threshold=self._config.rounding_threshold
            )
            if binning_strategy:
                strategies.append(binning_strategy)
                self._logger.info("Applied datetime binning strategy for aggregated query")
    else:
        # ... existing raw data logic
```

### Frontend Changes

1. **Modified `buildUnpivotedQuery` function signature** to accept optimization hints:
   - Added `optimizationHints` parameter to the function
   - Attached hints to the query description before execution

2. **Updated call site in `useQueryExecution.ts`**:
   - Passed `optimizationHints` to `buildUnpivotedQuery`
   - This ensures field-level hints are available for synthetic queries

## Benefits

1. **Reduced data volume**: DateTime dimensions are now binned appropriately (e.g., by hour, day) instead of keeping every unique timestamp
2. **Consistent behavior**: Whether using regular queries or MeasureValues, DateTime binning is applied consistently
3. **Better performance**: Fewer groups means faster query execution and smaller result sets
4. **Field-level control**: Optimization hints now flow through synthetic queries, enabling fine-grained control

## Testing

Added a new test case `test_datetime_binning_applied_for_aggregated_query_with_timeline_dimension` to verify that:
- DateTime binning strategy is created even when measures are present
- The strategy is properly included in the optimization plan
- Timeline dimensions trigger binning regardless of query type

## Example Scenario

**Before Fix:**
```
Query: MeasureValues by Timestamp (continuous, timeline)
Result: 100,000 rows (one per unique timestamp)
Optimization: None applied (has measures = skip optimization)
```

**After Fix:**
```
Query: MeasureValues by Timestamp (continuous, timeline)
Result: 24 rows (binned to hourly buckets)
Optimization: DateTime binning applied (detected timeline dimension)
```

## Files Modified

1. `/backend/services/optimization/strategy_planner.py` - Added timeline dimension check for aggregated queries
2. `/frontend/src/queryBuilder/syntheticQueryBuilder.ts` - Added optimization hints support
3. `/frontend/src/components/Visualization/ChartArea/hooks/useQueryExecution.ts` - Pass hints to unpivot query
4. `/backend/tests/unit/services/optimization/test_optimization.py` - Added test case

## Migration Notes

This is a non-breaking change that enhances existing functionality. No migration steps required.
