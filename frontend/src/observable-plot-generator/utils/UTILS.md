# Observable Plot Utils

Utility modules for Observable Plot chart generation. These provide reusable functionality for color scales, size mapping, labels, tooltips, date formatting, field overrides, and configuration building.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Chart Type Generators                          │
│  (scatterChart, lineChart, barCore, tickStrip, etc.)                │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ imports
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           utils/                                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ colorSchemeUtils │  │    sizeUtils     │  │   labelUtils     │  │
│  │                  │  │                  │  │                  │  │
│  │ deriveColorScale │  │ createSizeScale  │  │ prepareLabelData │  │
│  │ applyMeasure...  │  │                  │  │ createLabelMark  │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  tooltipUtils    │  │ dateFormatUtils  │  │  configBuilder   │  │
│  │                  │  │                  │  │                  │  │
│  │createTooltip...  │  │ formatDateTick   │  │computeShared...  │  │
│  │formatTooltipVal  │  │                  │  │buildLabelConfig  │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
│                                                                     │
│  ┌──────────────────┐                                               │
│  │ fieldOverrides   │                                               │
│  │                  │                                               │
│  │computeOverride.. │                                               │
│  └──────────────────┘                                               │
└─────────────────────────────────────────────────────────────────────┘
```

## Module Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `colorSchemeUtils.ts` | 280 | Color scale derivation and bias transformation |
| `sizeUtils.ts` | 109 | Size scale creation for scatter/line charts |
| `labelUtils.ts` | 183 | Data label preparation and mark creation |
| `tooltipUtils.ts` | 115 | Custom tooltip field configuration |
| `dateFormatUtils.ts` | 39 | Date formatting for axis ticks |
| `configBuilder.ts` | 197 | Configuration builders for chart generation |
| `fieldOverrides.ts` | 101 | Per-field override target computation |
| `index.ts` | 4 | Barrel re-exports |

---

## Module Details

### colorSchemeUtils.ts

Color scale derivation for Observable Plot charts.

**Key Exports:**
- `deriveColorScaleInfo()` — Compute color scale from data and field
- `applyMeasureNameColorOverrides()` — Apply per-measure colors for MeasureValues
- `ColorScaleInfo` — Type for color scale configuration

**Features:**
- Supports categorical and continuous color scales
- Color bias transformation (power scaling for gradient emphasis)
- Per-measure color overrides when using MeasureValues synthetic field
- Fallback to default schemes when not specified

**Color Bias:**
```typescript
// Bias ranges from -1 (left emphasis) to 1 (right emphasis)
// Uses power scaling: bias < 0 → exponent > 1, bias > 0 → exponent < 1
const exponent = Math.pow(2, -bias);
return Math.pow(t, exponent);
```

---

### sizeUtils.ts

Size scale creation for mapping field values to mark sizes.

**Key Exports:**
- `createSizeScale()` — Creates a size scale from field values
- `SizeScale` — Interface for size mapping

**Features:**
- Supports discrete fields (alphabetically sorted, evenly distributed)
- Supports continuous fields (linear mapping)
- Handles implicit SUM aggregation aliases
- Fallback to manual size when field is null

---

### labelUtils.ts

Data label preparation and Observable Plot mark creation.

**Key Exports:**
- `prepareLabelData()` — Decide if labels render, apply sampling
- `createLabelMark()` — Create Plot.text mark for labels
- `buildLabelString()` — Format label text from data
- `LabelRenderConfig` — Configuration interface

**Features:**
- Auto-suppression above threshold with sampling
- Hard cap protection (5000 labels max)
- Chart-type-specific label positioning
- Support for stacked bar labels (uses Plot.stackY/stackX)
- Multi-field label concatenation

---

### tooltipUtils.ts

Custom tooltip field configuration for chart hover states.

**Key Exports:**
- `createTooltipFieldsGetter()` — Factory for tooltip field resolver
- `formatTooltipValue()` — Format values for display

**Features:**
- Builds tooltip fields from main fields, color, size, and additional tooltip fields
- Automatic duplicate detection via exclude set
- Facet fields shown first for context
- Consistent value formatting (2 decimal places for floats)

---

### dateFormatUtils.ts

Date formatting utilities for Observable Plot axes.

**Key Export:**
- `formatDateTick()` — Format dates for axis tick labels

**Format Strategy:**
- Midnight dates: `YYYY-MM-DD`
- Dates with time: `YYYY-MM-DD HH:mm`
- Dates with seconds: `YYYY-MM-DD HH:mm:ss`

---

### configBuilder.ts

Configuration builders that extract and transform ChartGenerationContext.

**Key Exports:**
- `computeSharedDomainsFromContext()` — Single source of truth for domain computation
- `buildLabelConfig()` — Extract label configuration from context
- `buildCartesianPlotsConfig()` — Build CartesianPlotsConfig for cell generators

**Features:**
- Centralizes context property extraction
- Handles precomputed domains vs. computed domains
- Adapts measure label fields to aggregated column aliases

---

### fieldOverrides.ts

Computation of per-field override targets.

**Key Exports:**
- `computeOverrideTargets()` — Determine which fields can receive overrides
- `FieldOverrideTarget` — Target descriptor interface

**Override Rules:**
1. MeasureValues on axis → source measures get overrides
2. Single axis with 2+ continuous fields → those fields get overrides
3. Both axes have continuous fields (total > 2) → larger axis wins
4. Equal continuous fields → prefer X-axis

---

## Barrel Export (index.ts)

```typescript
export * from './configBuilder';
export * from './colorSchemeUtils';
export * from './sizeUtils';
export * from './labelUtils';
```

**Note:** `tooltipUtils`, `dateFormatUtils`, and `fieldOverrides` are NOT in the barrel and must be imported directly.

---

## External Connections

### Consumed By:
- All chart type generators (`scatterChart`, `lineChart`, `barCore`, etc.)
- `observablePlotGenerator.ts` — Uses `configBuilder` functions
- `facetGenerator.ts` — Uses `configBuilder` and `colorSchemeUtils`
- `facetDomains.ts` — Uses `colorSchemeUtils`
- `coreGridGenerator.ts` — Uses `colorSchemeUtils`

### Dependencies:
- `../../config/colorSchemes` — Color scheme definitions
- `../../utils/fieldUtils` — Field column name resolution
- `../../utils/syntheticFields` — MeasureValues/MeasureNames detection
- `../../types` — Field and FieldOverrideState types

---

## Design Notes

### Value Formatting Duplication

`formatTooltipValue()` (tooltipUtils) and `formatValue()` (labelUtils) have similar logic with slight differences:

| Aspect | formatTooltipValue | formatValue |
|--------|-------------------|-------------|
| null/undefined | `'null'` | N/A |
| Dates | `toLocaleString()` | `toISOString()` |
| Numbers | `toFixed(2)` | `toFixed(2)` |

**Recommendation:** Consider unifying into a shared formatter with options.

### Barrel Export Inconsistency

Some consumers import via barrel (`'../utils'`), others import directly (`'../utils/tooltipUtils'`). The barrel only exports 4 of 7 modules. This is intentional to keep the barrel focused, but could be confusing.
