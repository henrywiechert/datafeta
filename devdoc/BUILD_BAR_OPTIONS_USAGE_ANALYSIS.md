# buildBarOptions() Usage Analysis

## Overview

The `buildBarOptions()` function in `barCore.ts` is the **single source of truth** for bar chart generation. It's called from **5 different locations** serving **4 distinct use cases**.

---

## Call Chain Analysis

### 1. **barChart.ts → buildBarOptions()** 
**Path**: User selection → chartRules → barChart() → buildBarOptions()

**When chosen**: 
- Automatic chart type selection via `chartRules.ts`
- Condition: `qualifiesForBarChart()` returns true
  - Exactly 1 measure field
  - 0 or 1 dimension field
  - NOT multiple measures (that goes to multiMeasureBarChart)

**Parameters passed**:
```typescript
buildBarOptions({
  data,
  measureName,
  orientation: yMeasure ? 'vertical' : 'horizontal',  // Auto-detected
  categoryColumn: dimensionField ? getFieldColumnName(dimensionField) : undefined,
  colorColumn: colorField ? getFieldColumnName(colorField) : undefined,
  colorDomain: colorField ? Array.from(new Set(...)) : undefined,
  colorSchemeId: colorScheme,
  bandPadding: computeBandPaddingFromSizeField(data, sizeField) ?? undefined,  // Dynamic or default
  zeroBaseline: true,
  tooltipColumns: [colorField?.columnName, sizeField?.columnName].filter(Boolean),
  singleBarSizeMultiplier: 5,  // Legacy sizing for single bar
})
```

**Unique features**:
- ✅ Dynamic band padding from size field
- ✅ Color domain auto-computed from data
- ✅ Tooltip includes color + size fields
- ✅ `singleBarSizeMultiplier: 5` for visual prominence

**Use case**: **Standard single-measure bar charts** (most common)

---

### 2. **multiMeasureBarChart.ts → buildBarOptions()** (called in loop)
**Path**: User selection → observablePlotGenerator → multiMeasureBarChart() → buildBarOptions() (multiple times)

**When chosen**:
- Explicit check in `observablePlotGenerator.ts`
- Condition: Multiple measures on same axis (X OR Y, not both)
  - `xMeasures.length > 1` OR `yMeasures.length > 1`
  - Creates small multiples (one bar chart per measure)

**Parameters passed** (per measure):
```typescript
buildBarOptions({
  data: aggregatedData,  // Pre-aggregated per measure
  measureName,
  orientation: layoutType === 'horizontal' ? 'horizontal' : 'vertical',
  categoryColumn: '__category',  // Synthetic composite key
  categoriesDomain: categories,  // Shared across all measures
  bandPadding: computeBandPaddingFromSizeField(data, sizeField) ?? legacyPadding,
  valueDomainOverride: sharedDomains[measureName],  // Ensures consistent scale
  singleBarSizeMultiplier: 2,  // Different from barChart!
  tooltipColumns: []
})
```

**Unique features**:
- ✅ Pre-aggregates data per measure (avoids double-counting)
- ✅ Synthetic `__category` column for composite dimensions
- ✅ Shared domains across all measure charts (aligned scales)
- ✅ `singleBarSizeMultiplier: 2` (smaller than standard bar chart)
- ✅ Creates PlotResult with multiple plots in grid layout

**Use case**: **Multi-measure small multiples** (less common, advanced)

---

### 3. **facetGenerator.ts → createBarCellGenerator → buildBarOptions()** (called per facet cell)
**Path**: generateFacetedGrid() → coordinateFacetedGrid() → barCellGenerator() → buildBarOptions() (per cell)

**When chosen**:
- Faceting is enabled (rowFacetFields or colFacetFields present)
- Chart type is BAR (has category axis)
- Creates grid of small multiples split by discrete field values

**Parameters passed** (per facet cell):
```typescript
buildBarOptions({
  data: cellData,  // Filtered to this facet combination
  measureName,
  orientation: barOrientation === 'barX' ? 'horizontal' : 'vertical',
  categoryColumn: categoryColumnName,
  categoriesDomain: categories,  // Shared category domain across all cells
  colorColumn: colorColumnName,
  colorDomain: sharedDomains.color,  // Shared color domain across all cells
  colorSchemeId: colorScheme,
  bandPadding: BAND_PADDING,  // Constant, no dynamic sizing
  zeroBaseline: true,
  valueDomainOverride: valueDomain,  // Shared measure domain across all cells
  tooltipColumns: [colorField?.columnName].filter(Boolean),
})
```

**Unique features**:
- ✅ Called multiple times (once per facet cell)
- ✅ All cells share same category, measure, and color domains (aligned)
- ✅ No `singleBarSizeMultiplier` parameter (uses default 1)
- ✅ Fixed BAND_PADDING (no dynamic sizing)
- ✅ May create multiple series per cell (multi-series faceted bars)

**Use case**: **Faceted bar charts** (small multiples by discrete facet)

---

### 4. **cellCharts.ts → createBarX() → buildBarOptions()**
**Path**: generatePairChartOptions() → createBarX() → buildBarOptions()

**When chosen**:
- Used in **SCPM (Scatter Plot Matrix)** for pairwise field comparisons
- Condition: One field is measure, other is dimension OR null
- Called when chart type resolves to 'barX'

**Parameters passed**:
```typescript
buildBarOptions({
  data,
  measureName,
  orientation: 'horizontal',  // Always horizontal for createBarX
  categoryColumn: yDimension ? getFieldColumnName(yDimension) : undefined,
  categoriesDomain: sharedCatDomain || Array.from(new Set(...)),
  colorColumn: colorField ? getFieldColumnName(colorField) : undefined,
  colorDomain: undefined,  // NO shared color domain in SCPM
  bandPadding: 0.1,  // Fixed
  zeroBaseline: true,
  valueDomainOverride: valueDomain,  // From shared measure domains
  tooltipColumns: [],
})
```

**Use case**: **SCPM horizontal bars** (matrix cell charts)

---

### 5. **cellCharts.ts → createBarY() → buildBarOptions()**
**Path**: generatePairChartOptions() → createBarY() → buildBarOptions()

**When chosen**:
- Used in **SCPM (Scatter Plot Matrix)** for pairwise field comparisons
- Condition: One field is measure, other is dimension OR null
- Called when chart type resolves to 'barY'

**Parameters passed**:
```typescript
buildBarOptions({
  data,
  measureName,
  orientation: 'vertical',  // Always vertical for createBarY
  categoryColumn: xDimension ? getFieldColumnName(xDimension) : undefined,
  categoriesDomain: sharedCatDomain || Array.from(new Set(...)),
  colorColumn: colorField ? getFieldColumnName(colorField) : undefined,
  colorDomain: undefined,  // NO shared color domain in SCPM
  bandPadding: 0.1,  // Fixed
  zeroBaseline: true,
  valueDomainOverride: valueDomain,  // From shared measure domains
  tooltipColumns: [],
})
```

**Use case**: **SCPM vertical bars** (matrix cell charts)

---

## Decision Tree: Which Path is Chosen?

```
User selects fields
    │
    ├─ Multiple measures on same axis?
    │   └─ YES → multiMeasureBarChart() → buildBarOptions() (loop)
    │
    ├─ Faceting enabled (row/col facet fields)?
    │   ├─ YES + BAR chart type
    │   │   └─ facetGenerator() → coordinateFacetedGrid() → barCellGenerator() → buildBarOptions() (per cell)
    │   │
    │   └─ NO → Continue...
    │
    ├─ SCPM context (pairwise matrix)?
    │   ├─ YES + measure vs dimension
    │   │   ├─ Measure on X → createBarX() → buildBarOptions()
    │   │   └─ Measure on Y → createBarY() → buildBarOptions()
    │   │
    │   └─ NO → Continue...
    │
    └─ Standard bar chart (1 measure, 0-1 dimension)?
        └─ YES → barChart() → buildBarOptions()
```

---

## Parameter Comparison Matrix

| Parameter | barChart | multiMeasure | facetGenerator | cellCharts (X/Y) |
|-----------|----------|--------------|----------------|------------------|
| **data** | Raw rows | Aggregated per measure | Filtered per cell | Raw rows |
| **orientation** | Auto (Y=vertical, X=horizontal) | layoutType | barOrientation | 'horizontal' / 'vertical' |
| **categoryColumn** | From dimension field or undefined | '__category' (composite) | From category field | From dimension or undefined |
| **categoriesDomain** | undefined (auto) | Shared array | Shared array | Shared or auto |
| **colorColumn** | From colorField | undefined | From colorField | From colorField |
| **colorDomain** | Auto from data | undefined | Shared across cells | undefined |
| **colorSchemeId** | From context | undefined | From context | undefined |
| **bandPadding** | **Dynamic** from size field | **Dynamic** or 0.1/0.25 | **Fixed** BAND_PADDING | **Fixed** 0.1 |
| **zeroBaseline** | true | true | true | true |
| **valueDomainOverride** | undefined (auto) | **Shared** domain | **Shared** domain | **Shared** or undefined |
| **tooltipColumns** | [color, size] | [] | [color] | [] |
| **singleBarSizeMultiplier** | **5** | **2** | undefined (1) | undefined (1) |

---

## Key Differences Explained

### 1. **Data Handling**
- **barChart**: Raw rows from query result
- **multiMeasureBarChart**: Pre-aggregates to avoid double-counting (sums per category)
- **facetGenerator**: Filters rows to facet cell subset
- **cellCharts**: Raw rows for single SCPM cell

### 2. **Band Padding**
- **barChart**: Dynamic from size field (visual encoding)
- **multiMeasureBarChart**: Dynamic from size field OR legacy (0.1 with categories, 0.25 without)
- **facetGenerator**: Fixed BAND_PADDING constant
- **cellCharts**: Fixed 0.1

### 3. **Color Domain**
- **barChart**: Auto-computed from data (unique values)
- **multiMeasureBarChart**: Not used (no color encoding)
- **facetGenerator**: Shared across all facet cells (consistency)
- **cellCharts**: Not used (SCPM doesn't share color scales)

### 4. **Value Domain**
- **barChart**: Auto-computed by buildBarOptions
- **multiMeasureBarChart**: Shared across all measure charts (aligned scales)
- **facetGenerator**: Shared across all facet cells (aligned scales)
- **cellCharts**: From shared domains or auto

### 5. **Single Bar Size Multiplier**
- **barChart**: **5** (makes single bars visually prominent)
- **multiMeasureBarChart**: **2** (smaller, fits in grid)
- **facetGenerator**: **1** (default, minimal)
- **cellCharts**: **1** (default, minimal)

---

## Are There Obsolete Paths?

### ❌ NO - All paths are actively used and serve distinct purposes:

1. **barChart** → Standard single-measure charts (MOST COMMON)
2. **multiMeasureBarChart** → Multi-measure small multiples (ADVANCED)
3. **facetGenerator** → Faceted grids (SMALL MULTIPLES by discrete facets)
4. **cellCharts (createBarX/Y)** → SCPM matrix cells (EXPLORATORY ANALYSIS)

Each path has unique requirements:
- Different data preparation (raw vs aggregated vs filtered)
- Different domain sharing strategies (auto vs shared)
- Different sizing multipliers (5 vs 2 vs 1)
- Different padding strategies (dynamic vs fixed)

### ✅ All paths are NECESSARY and NON-REDUNDANT

---

## Potential Improvements (Future Work)

### 1. **Standardize Band Padding Logic**
Currently scattered across callers. Could be moved to buildBarOptions with a strategy parameter:
```typescript
interface BarBuildParams {
  // ...existing params
  paddingStrategy?: 'dynamic' | 'fixed' | 'legacy';
}
```

### 2. **Standardize Single Bar Sizing**
Different multipliers (5, 2, 1) are context-dependent. Could expose as parameter:
```typescript
// Currently some callers pass it, others don't
// Could make it required with sensible defaults
```

### 3. **Document Parameter Combinations**
Some parameter combinations may be invalid. Could add validation:
```typescript
export function buildBarOptions(params: BarBuildParams): Plot.PlotOptions {
  // Validate: if colorDomain provided, colorColumn must also be provided
  if (params.colorDomain && !params.colorColumn) {
    console.warn('colorDomain ignored without colorColumn');
  }
  // ...
}
```

### 4. **Extract Data Preparation**
The data aggregation logic in multiMeasureBarChart could be extracted:
```typescript
// barCore.ts
export function aggregateDataForBarChart(
  data: any[], 
  measureName: string, 
  categoryColumn?: string
): any[] {
  // Centralize aggregation logic
}
```

---

## Summary

**buildBarOptions() is called from 5 locations serving 4 use cases:**

| Use Case | Caller | Frequency | Unique Features |
|----------|--------|-----------|-----------------|
| Standard bars | barChart.ts | Most common | Dynamic padding, color domain, size multiplier 5 |
| Multi-measure | multiMeasureBarChart.ts | Advanced | Pre-aggregation, shared domains, size multiplier 2 |
| Faceted bars | facetGenerator.ts | Medium | Per-cell filtering, shared domains, size multiplier 1 |
| SCPM bars | cellCharts.ts (2x) | Exploratory | Fixed padding, shared measure domains, size multiplier 1 |

**All paths are actively used and non-redundant.** Each serves a distinct context with different data preparation, domain sharing, and sizing requirements.

**The architecture is CLEAN** - single source of truth (buildBarOptions) with appropriate parameter customization per context.
