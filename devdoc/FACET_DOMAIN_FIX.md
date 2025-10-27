# Facet Domain Sharing Fix

## Problem Description

When using faceted charts with multiple measures or continuous dimensions on one axis:
- **Configuration**: 1 discrete dimension (creates column facets) + 1 continuous dimension on X-axis, and 2+ continuous measures/dimensions on Y-axis
- **Issue**: Each horizontal facet (column) had different Y-domains for the same measure/dimension
- **Expected**: Each measure/dimension should have its own Y-domain, but that domain should be shared across all horizontal facets

### Example Scenario
```
X-axis: Minutes(timestamp) [discrete] + Seconds(timestamp) [continuous]
Y-axis: AVG(ueStats_cs1_avg) + AVG(ueStats_cs2_avg) [2 measures]
Color: EQ_dir

Expected: Both measures appear as line charts in a 2-row grid
- Row 1 (AVG(ueStats_cs1_avg)): Same Y-scale across Minutes 25 and 26
- Row 2 (AVG(ueStats_cs2_avg)): Same Y-scale across Minutes 25 and 26
```

## Root Causes

### 1. Shared Domains Not Passed to Cartesian Grid Generation
When faceting creates cells, each cell calls `baseGeneratePlot` → `generateCartesianGrid`. The Cartesian grid was computing domains from **only that cell's filtered data**, not using the global domains computed at the faceting level.

**Location**: `observablePlotGenerator.ts` line 111
```typescript
// OLD: Always computed from local data
const sharedMeasureDomains = computeSharedMeasureDomains(queryResult.rows, ...);
```

### 2. Scatter Charts Explicitly Excluded from Shared Domains
The `applySharedDomains` function had logic that skipped applying shared domains to scatter charts:

**Location**: `facetDomains.ts` line 90
```typescript
// OLD: Explicitly set to undefined for scatter charts
const xDomain = isScatterChart ? undefined : ...
const yDomain = isScatterChart ? undefined : ...
```

This caused scatter plots (e.g., dimension vs dimension) to have inconsistent scales across facets.

## Solution

### Change 1: Extended ChartGenerationContext
Added `sharedDomainsOverride` field to pass pre-computed global domains from faceting down to chart generation.

**File**: `types.ts`
```typescript
export interface ChartGenerationContext {
  // ... existing fields
  sharedDomainsOverride?: {
    measure?: Record<string, [number, number]>;
    numeric?: Record<string, [number, number]>;
  };
}
```

### Change 2: Modified baseGeneratePlot to Use Provided Domains
Updated to use `sharedDomainsOverride` when available instead of always computing from local data.

**File**: `observablePlotGenerator.ts`
```typescript
// NEW: Use provided domains if available, otherwise compute from local data
const sharedMeasureDomains = context.sharedDomainsOverride?.measure 
  || computeSharedMeasureDomains(queryResult.rows, ...);
const sharedNumericDomains = context.sharedDomainsOverride?.numeric || {};
const combinedDomains = { ...sharedNumericDomains, ...sharedMeasureDomains };
```

### Change 3: Faceting Passes Shared Domains
The facet cell generator now passes global shared domains through the context.

**File**: `facetGenerator.ts`
```typescript
const localContext: ChartGenerationContext = {
  ...cellContext,
  queryResult: { ...cellContext.queryResult, rows: cellData },
  sharedDomainsOverride: {
    measure: sharedDomains.measure,
    numeric: sharedDomains.numeric,
  },
};
```

### Change 4: Simplified applySharedDomains
Removed the logic that excluded scatter charts and conditional application based on chart type. Now ALL charts in faceted grids use shared domains.

**File**: `facetDomains.ts`
```typescript
// NEW: Apply to ALL chart types
const xDomain = (sharedDomains.numeric && xDomainKey && sharedDomains.numeric[xDomainKey]) 
  || (sharedDomains.measure && xDomainKey && sharedDomains.measure[xDomainKey]);
const yDomain = (sharedDomains.numeric && yDomainKey && sharedDomains.numeric[yDomainKey]) 
  || (sharedDomains.measure && yDomainKey && sharedDomains.measure[yDomainKey]);

// ALWAYS override when we have a shared domain
if (xDomain && opts.x) {
  opts.x = { ...(opts.x as any), domain: xDomain } as any;
}
if (yDomain && opts.y) {
  opts.y = { ...(opts.y as any), domain: yDomain } as any;
}
```

## Impact

### Fixed Scenarios
1. ✅ **Line charts** (continuous dimension + measure): Shared Y-domains across facets
2. ✅ **Scatter charts** (2 continuous dimensions): Shared X/Y domains across facets
3. ✅ **Mixed measures** (multiple measures on one axis): Each measure has its own domain, shared across facets
4. ✅ **With/without color fields**: Works in both cases

### Architecture Benefits
- Shared domain computation happens once at the faceting level (more efficient)
- Consistent behavior across all chart types
- Cleaner separation of concerns: faceting computes domains, chart generators use them

## Testing
Test with:
- 1 discrete + 1 continuous dimension on X, 2 measures on Y → Line charts in 2-row grid
- 1 discrete dimension on X, 2 continuous dimensions on Y → Scatter plots in 2-row grid
- Add/remove color field → Behavior should be consistent
- Verify Y-scales are identical across horizontal (column) facets for the same measure/dimension
