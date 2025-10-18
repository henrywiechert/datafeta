# Optimization Hints Refactoring Plan

## Executive Summary

This document outlines the planned refactoring to separate frontend visualization concerns from backend SQL optimization. The key change is introducing an **OptimizationHints** interface that allows the frontend to explicitly communicate performance preferences to the backend, rather than having the backend attempt to infer chart types and optimization needs.

## Problem Statement

### Current Issues

1. **Backend tries to detect chart types** - The `QueryOptimizer` has `_detect_chart_type()` logic that guesses visualization types from query structure
2. **Tight coupling** - Backend makes assumptions about what optimizations to apply based on query structure
3. **Inflexibility** - Frontend cannot control optimization behavior or communicate context
4. **Violation of separation of concerns** - Backend should not know about frontend chart types

### Why This Matters

- Same query structure might be used for different visualizations with different optimization needs
- Frontend already knows the chart type and requirements
- Users might want different optimization levels (preview vs export, speed vs precision)
- Current architecture makes it hard to add new chart types or optimization strategies

## Proposed Solution

### Core Concept: Optimization Hints

Create a flexible interface for the frontend to communicate optimization preferences:

```typescript
interface OptimizationHints {
  // What optimizations to apply
  enable_distinct?: boolean;
  enable_rounding?: boolean;
  enable_sampling?: boolean;
  
  // Thresholds and parameters
  rounding_threshold?: number;
  max_result_size?: number;
  sampling_rate?: number;
  
  // Precision requirements
  required_precision?: { [field: string]: number };
  
  // Overall strategy
  optimization_level?: 'none' | 'conservative' | 'balanced' | 'aggressive';
  
  // Context (for logging/debugging)
  purpose?: 'preview' | 'visualization' | 'export' | 'analysis';
  chart_context?: {
    type?: string;
    estimated_viewport_capacity?: number;
  };
}
```

### Key Principles

1. **Frontend Knows Best** - Frontend understands visualization needs and user intent
2. **Backend Executes** - Backend implements the requested optimizations efficiently
3. **Explicit is Better** - No implicit behavior based on query structure
4. **Backward Compatible** - Default behavior when hints not provided

## Implementation Plan

### Phase 1: Add Hints Support (Non-Breaking)

**Backend Changes:**
1. ✅ Create `OptimizationHints` pydantic model in `backend/models/query.py`
2. Add optional `optimization_hints` field to `QueryDescription`
3. Update `QueryOptimizer.create_plan()` to check for hints
4. Maintain default behavior when hints are absent

**Frontend Changes:**
5. Add `OptimizationHints` interface to `frontend/src/types.ts`
6. Update `QueryDescription` type to include optional `optimization_hints`

**Status:** Ready to implement - Design complete

### Phase 2: Frontend Hint Generation

**New Component: Hint Generator**
- Create `frontend/src/services/optimizationHintGenerator.ts`
- Define optimization profiles for each chart type:
  - Scatter: `enable_distinct: true, enable_rounding: true, threshold: 5000`
  - Bar: `enable_distinct: true, enable_rounding: false`
  - Line: `enable_distinct: true, enable_rounding: true, threshold: 2000`
  - Heatmap: `enable_distinct: true, enable_rounding: true, threshold: 100, optimization_level: 'aggressive'`

**Integration Points:**
- Chart components call hint generator based on their type
- Query builder includes hints in `QueryDescription`
- User preferences can override defaults

**Status:** Design complete, ready to implement

### Phase 3: Backend Refactoring

**Remove Chart Type Logic:**
1. Delete `_detect_chart_type()` method from `QueryOptimizer`
2. Remove tests that rely on implicit chart type detection
3. Update `create_plan()` to use only explicit hints

**New Behavior:**
```python
def create_plan(self, query_desc: QueryDescription) -> OptimizationPlan:
    hints = query_desc.optimization_hints or self._apply_default_hints(query_desc)
    
    strategies = []
    
    if hints.enable_distinct:
        strategies.append(DistinctPairStrategy(...))
    
    if hints.enable_rounding:
        if self._should_apply_rounding(query_desc, hints.rounding_threshold):
            strategies.append(AdaptiveRoundingStrategy(...))
    
    return OptimizationPlan(strategies)
```

**Status:** Design complete, ready to implement

### Phase 4: Testing & Documentation

**Backend Tests:**
- Test hint-driven optimization selection
- Test default behavior when hints absent
- Test `optimization_level` controls
- Test hint propagation through API

**Frontend Tests:**
- Test hint generation for each chart type
- Test hint override by user preferences
- Test hint serialization in API calls

**Documentation:**
- ✅ `OPTIMIZATION_HINTS_ARCHITECTURE.md` - Complete architecture guide
- Update API documentation with hint examples
- Update chart component documentation

**Status:** Architecture doc complete, tests TODO

## Benefits

### 1. Clean Separation of Concerns
- ✅ Frontend owns visualization logic (chart types, layouts)
- ✅ Backend owns SQL optimization logic (DISTINCT, rounding, sampling)
- ✅ Clear contract between layers

### 2. Flexibility
- ✅ Same query can use different optimizations for different contexts
- ✅ User preferences easily propagated (speed vs precision)
- ✅ Context-aware optimization (preview vs export vs thumbnail)

### 3. Maintainability
- ✅ Backend doesn't need updates for new chart types
- ✅ Optimization profiles centralized in frontend
- ✅ Easy to test specific optimization combinations

### 4. Performance Control
- ✅ Frontend can balance speed vs accuracy per use case
- ✅ Adaptive based on viewport size
- ✅ Progressive refinement possible (fast preview → detailed view)

## Example Use Cases

### Use Case 1: Scatter Plot with 1M Points

**Frontend sends:**
```json
{
  "dimensions": [...],
  "optimization_hints": {
    "enable_distinct": true,
    "enable_rounding": true,
    "rounding_threshold": 5000,
    "max_result_size": 10000,
    "optimization_level": "balanced"
  }
}
```

**Backend applies:** DISTINCT → cardinality check → adaptive rounding if needed

**Result:** ~8000 points, good visual fidelity, fast rendering

### Use Case 2: User Zooms In (Need More Precision)

**Frontend sends:**
```json
{
  "dimensions": [...],
  "filters": [{ "field": "price", "operator": ">", "value": 100 }, ...],
  "optimization_hints": {
    "enable_distinct": true,
    "enable_rounding": false,  // Disable for precision
    "optimization_level": "conservative"
  }
}
```

**Backend applies:** Only DISTINCT, no rounding

**Result:** Full precision in zoomed region

### Use Case 3: Thumbnail Preview

**Frontend sends:**
```json
{
  "dimensions": [...],
  "optimization_hints": {
    "enable_sampling": true,
    "sampling_rate": 0.05,
    "max_result_size": 500,
    "optimization_level": "aggressive",
    "purpose": "preview"
  }
}
```

**Backend applies:** Aggressive sampling + minimal processing

**Result:** Fast preview with ~500 points

### Use Case 4: Data Export

**Frontend sends:**
```json
{
  "dimensions": [...],
  "optimization_hints": {
    "enable_distinct": false,
    "enable_rounding": false,
    "optimization_level": "none",
    "purpose": "export"
  }
}
```

**Backend applies:** No optimizations

**Result:** Complete raw data

## Migration Strategy

### Step 1: Backward Compatible Addition ✅
- Add hint support alongside existing logic
- Keep default behavior unchanged
- No breaking changes to API

### Step 2: Frontend Adoption
- Implement hint generator
- Update chart components to send hints
- Test with various chart types
- Deploy and monitor

### Step 3: Backend Cleanup (Breaking Change)
- Remove `_detect_chart_type()` logic
- Require hints for all queries (or use smart defaults)
- Remove implicit optimization logic
- Update all tests

### Step 4: Advanced Features
- Progressive refinement (preview → detailed)
- User preference controls
- Viewport-aware optimization
- Query result caching by hints

## Current State of DISTINCT and Rounding

### What Works Well ✅

1. **DISTINCT is always applied** for continuous dimensions (raw queries)
   - Correctly guards against duplicate (x, y) pairs
   - Works for all database types

2. **Rounding is triggered by cardinality**
   - Applied when unique pairs > threshold (default 5000)
   - Precision calculated from data ranges
   - Database-specific implementation

3. **Category deduplication**
   - GROUP BY used for discrete dimensions
   - Works alongside continuous optimization

### What Needs Improvement 🔧

1. **Backend shouldn't guess chart types**
   - Current: `_detect_chart_type()` tries to infer visualization
   - Better: Frontend explicitly states requirements via hints

2. **No way to disable optimizations**
   - Current: Always applies if query structure matches
   - Better: Frontend controls via `enable_*` flags

3. **Cannot adjust thresholds per query**
   - Current: Global config only
   - Better: Per-query thresholds via hints

4. **No context awareness**
   - Current: Same optimization for preview and export
   - Better: Different strategies via `purpose` field

## Next Steps

1. **Review this plan** - Gather feedback from team
2. **Implement Phase 1** - Add hint models and API support (backend + frontend types)
3. **Implement Phase 2** - Create frontend hint generator
4. **Test extensively** - Ensure hints work for all chart types
5. **Implement Phase 3** - Remove legacy chart type detection
6. **Deploy gradually** - Feature flag the new behavior

## Success Metrics

- ✅ Backend has zero references to chart types
- ✅ Frontend explicitly controls all optimization behavior
- ✅ Same query can be executed with different optimization strategies
- ✅ Tests pass with explicit hints instead of implicit detection
- ✅ API response time unchanged or improved
- ✅ Visual quality unchanged or improved

## Questions & Answers

**Q: Won't this increase frontend complexity?**
A: Yes slightly, but it puts the logic where it belongs. Frontend already knows the chart type, this just makes that knowledge explicit.

**Q: What if frontend doesn't send hints?**
A: Backend falls back to smart defaults based on query structure (current behavior). Backward compatible.

**Q: How do we handle new optimization strategies?**
A: Add new `enable_*` flags to hints. Frontend can opt-in to new features.

**Q: Can user override hints?**
A: Yes! Frontend can provide UI controls that modify hints before sending query.

**Q: Will this break existing queries?**
A: No in Phase 1-2 (hints are optional). Yes in Phase 3 (requires hints or smart defaults).

## References

- ✅ `OPTIMIZATION_HINTS_ARCHITECTURE.md` - Complete architectural design
- `QUERY_OPTIMIZATION_PROPOSAL.md` - Original optimization proposal
- `PHASE6_COMPLETE.md` - Current optimization implementation
- `backend/services/optimization/optimizer.py` - Current optimizer implementation
- `backend/models/query.py` - QueryDescription model

## Timeline Estimate

- **Phase 1 (Backend Models + API):** 1-2 days
- **Phase 2 (Frontend Hint Generator):** 2-3 days  
- **Phase 3 (Backend Refactoring):** 2-3 days
- **Phase 4 (Testing & Documentation):** 1-2 days
- **Total:** 6-10 days

This is a significant but manageable refactoring that will greatly improve the architecture and maintainability of the system.
