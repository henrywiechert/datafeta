# Faceting Module

Orchestrates faceted (small multiples) chart generation for Observable Plot.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Entry Points                                   │
│  ┌─────────────────┐   ┌──────────────────┐   ┌────────────────────┐   │
│  │  planFacets()   │   │ validateFacets() │   │ generateFacetedGrid│   │
│  │  (facetPlanner) │   │ (facetValidation)│   │ (facetGenerator)   │   │
│  └────────┬────────┘   └────────┬─────────┘   └─────────┬──────────┘   │
│           │                     │                       │               │
└───────────┼─────────────────────┼───────────────────────┼───────────────┘
            │                     │                       │
            ▼                     ▼                       ▼
┌───────────────────────────────────────────────────────────────────────┐
│                        facetCoordinator.ts                             │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ coordinateFacetedGrid() - Chart-type agnostic orchestration     │  │
│  │                                                                  │  │
│  │  • Computes facet combinations (row × column)                   │  │
│  │  • Computes shared domains across all facets                    │  │
│  │  • Filters data per facet cell                                  │  │
│  │  • Delegates to CellGenerator (strategy pattern)                │  │
│  │  • Assembles final grid layout                                  │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────────────────────┐
│                        Supporting Modules                              │
│  ┌───────────────┐  ┌───────────────┐  ┌────────────┐  ┌───────────┐ │
│  │ facetDomains  │  │  facetGrid    │  │ facetUtils │  │ barFacet  │ │
│  │ (domain calc) │  │ (layout calc) │  │ (shared)   │  │ Generator │ │
│  └───────────────┘  └───────────────┘  └────────────┘  └───────────┘ │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Pipeline Flow

```
1. planFacets()          → Decides which discrete fields become facets
                           (returns FacetPlan or null)
                           
2. validateFacetCounts() → Checks facet counts don't exceed limits
                           (prevents browser overwhelm)
                           
3. generateFacetedGrid() → Generates the actual chart grid
   │
   ├─► deriveChartConfig()     → Determines bar orientation, category axis
   │
   └─► coordinateFacetedGrid() → Main orchestration
       │
       ├─► computeSharedDomainsForFaceting() → Shared scales
       ├─► filterRowsByFacets()              → Per-cell data
       ├─► CellGenerator(cellData)           → Per-cell plots
       └─► computeGridLayout()               → Final layout
```

---

## File Responsibilities

### `facetPlanner.ts`
**Entry point** - Analyzes fields to determine faceting strategy.

```typescript
planFacets(context) → FacetPlan | null
```

- X discrete dimensions → column facets
- Y discrete dimensions → row facets
- Returns `null` if no discrete dimensions

---

### `facetValidation.ts`
**Guard** - Prevents rendering too many facets.

```typescript
validateFacetCounts(context, plan) → FacetValidationResult
```

- Limit: 500 facets per direction (`FACET_LIMIT`)
- Returns which direction(s) exceed limits
- Used by UI to show `FacetLimitDialog`

---

### `facetGenerator.ts`
**Chart-type-specific** generator entry point.

```typescript
generateFacetedGrid(context, plan) → PlotResult
```

Two paths:
1. **Bar/Tick Strip** → Uses `createBarCellGenerator()` from `barFacetGenerator.ts`
2. **Generic (scatter, line)** → Uses inline `cartesianCellGenerator`

---

### `facetCoordinator.ts`
**Core orchestrator** - Chart-type agnostic.

```typescript
coordinateFacetedGrid(config) → PlotResult
```

Responsibilities:
- Build facet combinations (Cartesian product of row × column values)
- Compute shared domains (ensuring consistent scales)
- Handle independent domains per row/column if configured
- Loop through all cells, filter data, call `CellGenerator`
- Assemble final grid with positions

**Key Types:**
```typescript
type CellGenerator = (cellData, context, sharedDomains, position, facetContext) => CellResult;

interface CellResult {
  plots: PositionedPlot[];
  columns: number;
  rows: number;
  columnSizes?: Array<number | 'fr'>;
  rowSizes?: Array<number | 'fr'>;
}
```

---

### `barFacetGenerator.ts`
**Specialized generator** for bar charts and tick strips.

```typescript
createBarCellGenerator(...) → CellGenerator
```

Handles:
- Multi-measure bar charts (multiple bars per facet)
- Tick strips (continuous dimension visualization)
- Category normalization (Date → string for band scales)
- Label rendering
- Tooltips with facet context

---

### `facetDomains.ts`
**Domain computation** for consistent scales across facets.

```typescript
computeSharedDomainsForFaceting(data, xFields, yFields, ...) → SharedDomains
```

Computes:
- Measure domains (min/max for continuous values)
- Numeric domains (for dimensions)
- Categorical domains (for band scales)
- Color scale (categorical or sequential)

---

### `facetGrid.ts`
**Layout computation** for grid positioning.

```typescript
computeGridLayout(baseCols, baseRows, numRowFacets, numColFacets, ...) → GridLayout
computeFacetLabels(rowFields, colFields, ...) → FacetLabels
```

---

### `facetUtils.ts`
**Shared utilities** used across the module.

| Function | Purpose |
|----------|---------|
| `detectBarChartConfiguration()` | Detect bar/tick strip and category axis |
| `filterRowsByFacets()` | Filter data for a specific facet cell |
| `buildFacetCombos()` | Build Cartesian product of facet values |
| `uniqueValuesForField()` | Get sorted unique values for a field |

---

## Strategy Pattern: CellGenerator

The `CellGenerator` type enables chart-type-specific rendering while keeping the coordination logic generic:

```typescript
// Bar chart cell generator
const barCellGen = createBarCellGenerator(xFields, yFields, ...);

// Generic cartesian cell generator (inline)
const cartesianCellGen: CellGenerator = (cellData, ctx, domains, pos) => {
  const plots = generateCartesianPlots(config);
  return { plots, columns: xCount, rows: yCount };
};

// Same coordinator handles both
coordinateFacetedGrid({
  context,
  plan,
  cellGenerator: barCellGen, // or cartesianCellGen
});
```

---

## Independent Domains

Faceted charts can have independent scales per row or column:

```typescript
independentDomains: {
  x?: boolean;  // Each column has its own X scale
  y?: boolean;  // Each row has its own Y scale
}
```

When enabled:
- Per-column domains computed from column's data only
- Per-row domains computed from row's data only
- Color scale always remains global (for consistency)

---

## External Connections

| Consumer | Entry Point |
|----------|-------------|
| `observablePlotGenerator.ts` | `planFacets()`, `generateFacetedGrid()` |
| `useChartGeneration.ts` | `planFacets()`, `validateFacetCounts()` |
| `FacetLimitDialog.tsx` | `FacetValidationResult` type |
| `configBuilder.ts` | `computeSharedDomainsForFaceting()` |

---

## Test Coverage

- `__tests__/independentDomains.test.ts` - Tests independent domain behavior
