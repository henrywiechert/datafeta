# Faceting Architecture Refactoring Proposal

## Current Architecture Analysis

### File Structure
```
faceting/
├── facetPlanner.ts      (~212 lines)
├── facetGenerator.ts    (~484 lines)
└── facetUtils.ts        (~60 lines)
```

### Current Problems

#### 1. **Mixed Responsibilities in `facetGenerator.ts`**

The file has **two completely separate paths** that duplicate logic:

##### BAR Path (lines 28-180, ~150 lines)
- Hardcodes Observable Plot bar mark generation
- Contains chart-type-specific rendering logic that belongs in `chartTypes/barChart.ts`
- Duplicates: facet combo computation, domain sharing, layout calculation
- Inline bar options construction with fill, z-channel, tooltips, etc.

##### Generic Cartesian Path (lines 183-250)
- Calls `buildBaseSpecForDataSubset()` for each facet cell
- Also duplicates: facet combo computation, domain sharing
- Different approach but same goal

**Result**: ~60% code duplication between these paths

#### 2. **Monolithic `buildBaseSpecForDataSubset()` (lines 308-470, ~160 lines)**

This function does **too many things**:
- Filters fields (excludes facet fields and category field)
- Calls `baseGeneratePlot()` to generate plots
- Applies shared domains (measure, numeric, color, category)
- Adjusts intrinsic sizes based on category domain
- Forces zero baseline for bar charts (chart-type-specific!)
- Derives column/row sizes from plot options
- Returns normalized BaseSpec

**Issues**:
- Violates Single Responsibility Principle
- Contains bar-specific logic (`coerceZeroBaseline`)
- Mixes field manipulation, plot generation, domain application, and size calculation
- Hard to test and maintain

#### 3. **Unclear Separation of Concerns**

**facetPlanner.ts** contains:
- Facet field selection ✓ (belongs here)
- Chart type detection logic (multi-measure, bar orientation) ✗ (should be in chart type resolver)
- Category axis determination ✗ (should be in bar chart logic)
- Complex conditional logic mixing faceting strategy with chart type concerns

**facetGenerator.ts** contains:
- Chart rendering code (bar marks) ✗ (belongs in chartTypes/)
- Domain computation ✗ (already done elsewhere, just needs application)
- Layout calculation ✓ (belongs here)
- Field filtering ✓ (belongs here)

#### 4. **Code Duplication**

##### Facet Combo Computation (appears 2x):
```typescript
// Lines 53-58 (BAR path)
const { rowValuesLevels, colValuesLevels, safeRowCombos, safeColCombos } = 
  computeFacetLevelsAndCombos(...);

// Lines 185-191 (Generic path)
const { rowValuesLevels, colValuesLevels, safeRowCombos, safeColCombos } = 
  computeFacetLevelsAndCombos(...);
```

##### Domain Computation Logic (appears 2x):
```typescript
// Lines 45-52 (BAR path)
const sharedMeasureDomains = computeSharedMeasureDomains(...);

// Lines 188-199 (Generic path)  
const sharedMeasureDomains = computeSharedMeasureDomains(...);
const sharedNumericDomains = computeSharedNumericDomains(...);
```

##### Color Domain Computation:
- Appears in `facetGenerator.ts` (line 32)
- Also in `coreGridGenerator.ts` (lines 100-124)
- Same pattern, duplicated code

#### 5. **Obsolete/Dead Code Patterns**

- `filterRowsByFacet()` in `facetUtils.ts` (single field) unused - only multi-field version used
- Complex field filtering in `buildBaseSpecForDataSubset` creates local contexts that duplicate work
- Manual domain application logic duplicates what's already in `coreGridGenerator`

---

## Proposed Architecture

### Core Principles

1. **Separation of Concerns**: Planning vs Generation vs Rendering
2. **Single Responsibility**: Each module does one thing well
3. **Composability**: Faceting should wrap any chart type
4. **No Duplication**: Shared logic extracted to utilities
5. **Chart-Type Agnostic**: Faceting shouldn't know about bars vs lines

### New Structure

```
faceting/
├── facetPlanner.ts           # SLIM: Just facet field selection
├── facetCoordinator.ts       # NEW: Orchestrates faceted rendering
├── facetGrid.ts              # NEW: Grid layout logic
├── facetDomains.ts           # NEW: Domain sharing strategies
├── facetUtils.ts             # Utilities (filtering, combos)
└── __tests__/                # Unit tests
```

### Module Responsibilities

#### 1. `facetPlanner.ts` (SIMPLIFIED)
**Purpose**: Analyze fields and determine which should be facets

**Exports**:
```typescript
export interface FacetPlan {
  rowFacetFields: Field[];
  colFacetFields: Field[];
}

export function planFacets(context: ChartGenerationContext): FacetPlan | null
```

**Removes**:
- ❌ `categoryAxis`, `categoryField`, `barOrientation` (move to bar chart logic)
- ❌ `sharedCategoryDomain` (computed later)
- ❌ Chart type detection logic (move to chart type resolver)

**Keeps**:
- ✅ Field classification (discrete vs continuous)
- ✅ Facet field selection logic
- ✅ `uniqueValuesForField()` utility

**Size**: ~100 lines (reduced from 212)

---

#### 2. `facetCoordinator.ts` (NEW)
**Purpose**: Main entry point - orchestrates faceted grid generation

**Exports**:
```typescript
export interface FacetConfig {
  plan: FacetPlan;
  context: ChartGenerationContext;
  cellGenerator: CellGenerator;
}

export function generateFacetedGrid(config: FacetConfig): PlotResult
```

**Responsibilities**:
1. Compute facet combinations (using `facetUtils`)
2. Compute shared domains (using `facetDomains`)
3. Loop through facet cells
4. For each cell:
   - Filter data by facet values
   - Create cell context
   - Call `cellGenerator` to render
5. Assemble final grid layout (using `facetGrid`)

**Size**: ~80 lines

---

#### 3. `facetGrid.ts` (NEW)
**Purpose**: Grid layout calculations only

**Exports**:
```typescript
export interface GridLayout {
  type: 'grid';
  columns: number;
  rows: number;
  columnSizes: Array<number | 'fr'>;
  rowSizes: Array<number | 'fr'>;
}

export interface FacetLabels {
  rowsLevels?: Array<{ fieldLabel: string; values: any[] }>;
  colsLevels?: Array<{ fieldLabel: string; values: any[] }>;
  groupSpan: { columnsPerFacet: number; rowsPerFacet: number };
  spans: {
    baseCols: number;
    baseRows: number;
    columns: number[];
    rows: number[];
  };
}

export function computeGridLayout(
  baseCols: number,
  baseRows: number,
  rowCombos: any[][],
  colCombos: any[][],
  samplePlotOptions?: Plot.PlotOptions[]
): GridLayout

export function computeFacetLabels(
  rowFields: Field[],
  colFields: Field[],
  rowValuesLevels: any[][],
  colValuesLevels: any[][],
  baseCols: number,
  baseRows: number
): FacetLabels

export function deriveCellSizes(
  plots: Array<{ options: Plot.PlotOptions; position: { row: number; col: number } }>,
  columns: number,
  rows: number
): { columnSizes: Array<number | 'fr'>; rowSizes: Array<number | 'fr'> }
```

**Responsibilities**:
- Grid dimension calculations
- Size derivation from plot options
- Facet label span computation
- Pure functions, no side effects

**Size**: ~80 lines

---

#### 4. `facetDomains.ts` (NEW)
**Purpose**: Compute and apply shared domains across facets

**Exports**:
```typescript
export interface SharedDomains {
  measure: Record<string, [number, number]>;
  numeric: Record<string, [number, number]>;
  categorical: Record<string, any[]>;
  color?: any[];
}

export function computeSharedDomainsForFaceting(
  data: any[],
  xFields: Field[],
  yFields: Field[],
  colorField?: Field,
  categoryField?: Field,
  facetFields?: Field[]
): SharedDomains

export function applySharedDomains(
  plotOptions: Plot.PlotOptions,
  sharedDomains: SharedDomains,
  colorScheme?: string
): Plot.PlotOptions
```

**Responsibilities**:
- Centralize all domain computation logic
- Provide domain application utilities
- Handle color domain sorting/deduplication
- Remove duplication from generator files

**Size**: ~100 lines

---

#### 5. `facetUtils.ts` (CLEANED UP)
**Purpose**: Low-level utilities

**Exports**:
```typescript
export function filterRowsByFacets(
  rows: any[],
  rowFields: Field[],
  rowValues: any[],
  colFields: Field[],
  colValues: any[]
): any[]

export function buildFacetCombos(
  fields: Field[],
  valuesLevels: any[][]
): any[][]

export function uniqueValuesForField(
  rows: any[],
  field: Field
): any[]
```

**Removes**:
- ❌ `filterRowsByFacet()` (single field version - unused)

**Size**: ~50 lines (reduced from 60)

---

### Cell Generation Strategy

Instead of hardcoding chart types in `facetGenerator`, use a **strategy pattern**:

```typescript
// In facetCoordinator.ts
export type CellGenerator = (
  cellContext: ChartGenerationContext,
  sharedDomains: SharedDomains
) => PlotResult;

// Usage example:
const cellGenerator: CellGenerator = (cellContext, sharedDomains) => {
  // This could call baseGeneratePlot, barChart, or any chart type
  const result = baseGeneratePlot(cellContext);
  
  // Apply shared domains
  if (result.plots) {
    result.plots = result.plots.map(p => ({
      ...p,
      options: applySharedDomains(p.options, sharedDomains, cellContext.colorScheme)
    }));
  }
  
  return result;
};

generateFacetedGrid({ plan, context, cellGenerator });
```

This allows:
- **Flexibility**: Any chart type can be faceted
- **Testability**: Each component tested independently
- **No duplication**: Chart logic stays in chart files

---

### Migration Path

#### Phase 1: Extract Utilities (Low Risk)
1. Create `facetDomains.ts` - extract domain logic
2. Create `facetGrid.ts` - extract layout logic
3. Update existing files to use new utilities
4. Test existing behavior preserved

#### Phase 2: Simplify Planner (Low Risk)
1. Remove chart-type logic from `facetPlanner.ts`
2. Move bar orientation/category logic to `chartTypes/barChart.ts`
3. Simplify `FacetPlan` interface
4. Test facet selection unchanged

#### Phase 3: Create Coordinator (Medium Risk)
1. Create `facetCoordinator.ts` with strategy pattern
2. Implement generic cell generation
3. Test with existing chart types

#### Phase 4: Migrate Generator (High Risk)
1. Replace BAR path with strategy approach
2. Replace Generic path with coordinator
3. Remove `buildBaseSpecForDataSubset()` entirely
4. Delete old `facetGenerator.ts`

#### Phase 5: Clean Up (Low Risk)
1. Remove unused code
2. Add comprehensive tests
3. Update documentation

---

## Benefits

### Code Quality
- **-250 lines** overall (from ~760 to ~510)
- **-60% duplication** (two paths merged into one)
- **Clear responsibilities** (each file has one job)

### Maintainability
- **Easier to test** (pure functions, strategy pattern)
- **Easier to debug** (smaller, focused modules)
- **Easier to extend** (add new faceting strategies without changing existing code)

### Flexibility
- **Chart-type agnostic** (any chart can be faceted)
- **Composable** (faceting can wrap grids, bars, lines, etc.)
- **Configurable** (domain strategies can be swapped)

### Performance
- **No change** (same algorithms, better organized)
- **Potential optimization** (shared domain computation can be cached)

---

## Example: Before vs After

### Before (facetGenerator.ts, BAR path)
```typescript
// 150 lines of inline bar chart generation mixed with faceting logic
if (barOrientation && categoryAxis) {
  // ... compute facet combos
  // ... compute domains
  for (let r...) {
    for (let c...) {
      for (let s...) {
        // Inline bar mark creation
        options = barOrientation === 'barX' ? {
          x: { label: measureName, domain: valueDomain, ... },
          y: { label: categoryColumnName, type: 'band', ... },
          marks: [
            Plot.barX(subset, { x: measureName, y: categoryColumnName, ... }),
            Plot.ruleX([0])
          ],
          ...
        } : { ... };
      }
    }
  }
  // ... compute layout
}
```

### After (facetCoordinator.ts + barChart.ts)
```typescript
// facetCoordinator.ts (~80 lines, chart-agnostic)
export function generateFacetedGrid(config: FacetConfig): PlotResult {
  const { plan, context, cellGenerator } = config;
  
  const combos = computeFacetCombos(plan);
  const sharedDomains = computeSharedDomainsForFaceting(context);
  
  const plots = [];
  for (const { rowCombo, colCombo, position } of combos) {
    const cellData = filterRowsByFacets(context.data, rowCombo, colCombo);
    const cellContext = { ...context, queryResult: { rows: cellData } };
    const cellResult = cellGenerator(cellContext, sharedDomains);
    plots.push(...cellResult.plots);
  }
  
  return assembleGrid(plots, plan, sharedDomains);
}

// barChart.ts (unchanged, already exists)
// Faceting just wraps it via cellGenerator strategy
```

**Result**: 
- Faceting logic separated from chart rendering
- Bar chart stays in `chartTypes/barChart.ts`
- No duplication, no mixed concerns

---

## Questions to Consider

1. **Should categoryAxis/barOrientation be in FacetPlan?**
   - Current: Yes (in facetPlanner)
   - Proposed: No (move to bar chart logic or chart type resolver)
   - **Reasoning**: Faceting shouldn't know about bar-specific concepts

2. **How to handle the special BAR grid case?**
   - Current: Separate path in facetGenerator
   - Proposed: Use `multiMeasureBarChart.ts` as cellGenerator
   - **Reasoning**: Bar grids are just another chart type that can be faceted

3. **Should we keep backward compatibility?**
   - Option A: Refactor in place (risky but clean)
   - Option B: Create new modules, deprecate old ones (safer)
   - **Recommendation**: Option B (Phase 1-5 migration path)

4. **What about testing?**
   - Current: Minimal tests
   - Proposed: Unit tests for each module, integration tests for coordinator
   - **Priority**: High (prevents regressions during refactoring)

---

## Next Steps

1. **Review this proposal** with team
2. **Choose migration strategy** (phased vs big-bang)
3. **Write failing tests** for current behavior (characterization tests)
4. **Start with Phase 1** (extract utilities - low risk)
5. **Iterate** through phases with testing at each step

---

## Appendix: Deleted Code Examples

### Example 1: Duplicated Color Domain Computation
```typescript
// facetGenerator.ts:32-34
const sharedColorDomain = colorField 
  ? uniqueValuesForField(queryResult.rows, colorField) 
  : undefined;

// coreGridGenerator.ts:100-124
const sharedColorDomain = (() => {
  if (!colorField) return undefined;
  const col = getFieldColumnName(colorField);
  const seen = new Set<any>();
  const values: any[] = [];
  for (const row of Array.isArray(data) ? data : []) {
    const v = row?.[col];
    if (!seen.has(v)) {
      seen.add(v);
      values.push(v);
    }
  }
  // ... sorting logic
  return values;
})();

// Proposed: Single function in facetDomains.ts
export function computeColorDomain(data: any[], colorField: Field): any[]
```

### Example 2: Chart-Specific Logic in Faceting
```typescript
// facetGenerator.ts:405-426 (in buildBaseSpecForDataSubset)
// Force zero baseline for bar charts
const coerceZeroBaseline = (domain: any, values: number[]) => {
  if (!Array.isArray(values) || values.length === 0) return domain;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const lower = Math.min(0, min);
  const upper = max <= 0 ? 0 : max;
  return [lower, upper] as [number, number];
};
if (categoryAxis === 'x') {
  // ... coerce y domain to include zero
} else if (categoryAxis === 'y') {
  // ... coerce x domain to include zero
}

// Proposed: Move to barChart.ts or barCore.ts
// Faceting shouldn't know about zero baseline requirements
```

### Example 3: Inline Bar Chart Rendering
```typescript
// facetGenerator.ts:85-103
options = barOrientation === 'barX'
  ? {
      x: { label: measureName, grid: true, domain: valueDomain, ... },
      y: { label: categoryColumnName, type: 'band', domain: categories, ... },
      marks: [
        Plot.barX(subset, { 
          x: measureName, 
          y: categoryColumnName || (() => categories[0]), 
          fill: colorColumnName || DEFAULT_CHART_COLOR,
          ...(!categoryColumnName && colorColumnName 
            ? { z: colorColumnName, order: colorColumnName } 
            : colorColumnName ? { order: colorColumnName } : {}),
          tip: { pointer: 'x', preferredAnchor: 'top-right' } 
        }),
        Plot.ruleX([0])
      ],
      // ... color config
    }
  : { /* similar for barY */ };

// Proposed: Use existing barChart.ts via cellGenerator
// No inline mark creation in faceting code
```

---

*End of Proposal*
