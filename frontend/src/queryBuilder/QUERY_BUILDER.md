# Query Builder Module

Transforms visualization field configurations into `QueryDescription` objects that the backend API can execute. Handles both regular queries and synthetic field (MeasureNames/MeasureValues) unpivoting.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Visualization State                              │
│  { xFields, yFields, filterConfigurations, labelFields, ... }     │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
           [regular fields]            [synthetic fields]
                    │                             │
                    ▼                             ▼
    ┌──────────────────────────┐    ┌──────────────────────────┐
    │    queryBuilder.ts       │    │ syntheticQueryBuilder.ts │
    │                          │    │                          │
    │  buildQuery()            │    │  buildUnpivotedQuery()   │
    │    ├─ getQueryTypeFromFields() │  • Expands MeasureValues   │
    │    ├─ buildAggregatedQuery()   │    to actual measures      │
    │    └─ buildRawQuery()    │    │  • Queries with all       │
    │                          │    │    measures as columns    │
    │  Utilities:              │    │  • Transforms result to   │
    │  • extractColumnCasts()  │    │    long format (unpivot)  │
    │  • convertFilterConfigsToFilters()                        │
    └──────────────────────────┘    └──────────────────────────┘
                    │                             │
                    └──────────────┬──────────────┘
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      QueryDescription                               │
│  { target_table, dimensions, measures, filters, orderBy, ... }     │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    apiService.executeQueryArrow()                   │
│                    → Backend SQL execution                          │
└─────────────────────────────────────────────────────────────────────┘
```

## Files

| File | Purpose | Lines |
|------|---------|-------|
| `queryBuilder.ts` | Regular query building (aggregated/raw) | 375 |
| `syntheticQueryBuilder.ts` | MeasureNames/MeasureValues unpivoting | 354 |

## Query Types

### 1. Aggregated Query (`buildAggregatedQuery`)
Used when visualization requires server-side aggregation (bar charts, line charts with measures).

```typescript
// Input: X=[category (dim)], Y=[SUM(sales) (measure)]
// Output:
{
  target_table: "orders",
  dimensions: [{ field: "category", flavour: "discrete" }],
  measures: [{ field: "sales", aggregation: "sum", alias: "SUM(sales)" }],
  orderBy: [{ field: "category" }],
}
```

### 2. Raw Query (`buildRawQuery`)
Used when no aggregation is needed (scatter plots with two measures).

```typescript
// Input: X=[price (measure)], Y=[quantity (measure)]
// Output:
{
  target_table: "orders",
  dimensions: [
    { field: "price", flavour: "continuous" },
    { field: "quantity", flavour: "continuous" },
  ],
  measures: [],  // No aggregation
}
```

### 3. Unpivoted Query (`buildUnpivotedQuery`)
Used when MeasureValues synthetic field is present. Transforms multiple measure columns into rows.

```typescript
// Input: X=[species (dim)], Y=[MeasureValues], Color=[MeasureNames]
// Available measures: culmen_length_mm, culmen_depth_mm

// Step 1: Query with all measures as columns
// SELECT species, SUM(culmen_length_mm), SUM(culmen_depth_mm) FROM penguins GROUP BY species

// Step 2: Transform result (wide → long)
// Before: { species: 'Adelie', SUM(culmen_length_mm): 100, SUM(culmen_depth_mm): 50 }
// After:  [
//   { species: 'Adelie', MeasureNames: 'culmen_length_mm', SUM(MeasureValues): 100 },
//   { species: 'Adelie', MeasureNames: 'culmen_depth_mm', SUM(MeasureValues): 50 }
// ]
```

## Key Functions

### `queryBuilder.ts`

| Function | Purpose |
|----------|---------|
| `buildQuery()` | Main entry - auto-selects aggregated or raw |
| `getQueryTypeFromFields()` | Determines query type from field config |
| `buildAggregatedQuery()` | Builds query with GROUP BY and measures |
| `buildRawQuery()` | Builds query without aggregation |
| `extractColumnCasts()` | Extracts column type casting config |
| `convertFilterConfigsToFilters()` | Converts UI filter state to API format |

### `syntheticQueryBuilder.ts`

| Function | Purpose |
|----------|---------|
| `buildUnpivotedQuery()` | Complete flow: build, execute, transform |
| `requiresUnpivoting()` | Checks if fields need unpivot handling |
| `transformMeasuresToRows()` | Wide-to-long format transformation |

## Integration Points

### Consumers

| File | Function Used |
|------|---------------|
| `useQueryBuilder.ts` | `buildQuery()` |
| `useQueryExecutor.ts` | `buildRawQuery()`, `buildUnpivotedQuery()` |
| `useQueryExecution.ts` | `requiresUnpivoting()` |

### Dependencies

| Module | Usage |
|--------|-------|
| `../types` | `Field`, `QueryDescription`, `FilterConfig`, etc. |
| `../utils/fieldUtils` | `getResultColumnName()` |
| `../utils/syntheticFields` | `isMeasureValuesField()`, `getMeasureFieldsForUnpivot()` |
| `../apiService` | `executeQueryArrow()` (only in syntheticQueryBuilder) |

## Query Decision Logic

```typescript
getQueryTypeFromFields(fields):
  1. If any field has type='measure' AND aggregation set → 'aggregated'
  2. If measures on exactly one axis (X xor Y) → 'aggregated' 
  3. Otherwise → 'raw'
```

## Filter Conversion

```typescript
// Discrete filter (categorical)
{ type: 'discrete', selectedValues: ['A', 'B'] }
  → { field: 'category', operator: 'in', value: ['A', 'B'] }

// Continuous filter (numeric range)
{ type: 'continuous', min: 10, max: 100 }
  → [
      { field: 'price', operator: '>=', value: 10 },
      { field: 'price', operator: '<=', value: 100 }
    ]

// DateTime filter
{ type: 'datetime', startDate: '2024-01-01', endDate: '2024-12-31' }
  → [
      { field: 'order_date', operator: '>=', value: '2024-01-01' },
      { field: 'order_date', operator: '<=', value: '2024-12-31' }
    ]
```

## Ordering Strategy

Queries always order by dimensions to ensure deterministic results:
1. Discrete dimensions first (categorical ordering)
2. Continuous dimensions second (left-to-right flow for charts)
3. DateTime parts use alias names: `field_part_mode`

## Column Casting

Fields can specify type casts for backend processing:

```typescript
// Field with casting
{ columnName: 'timestamp_str', castType: 'timestamp', castReplacement: '%Y-%m-%d' }

// Extracted as:
column_casts: {
  'timestamp_str': { cast_type: 'timestamp', replacement_pattern: '%Y-%m-%d' }
}
```

## Cleanup Applied

| Issue | Resolution |
|-------|------------|
| `console.log` in production code | Removed optimization hints logging |
| `detectSyntheticFieldUsage` exported but unused externally | Made private |

## Design Notes

- **Field-driven**: Query type determined by user's field configuration, not chart type
- **Deduplication**: Fields merged from multiple sources (axes, labels, tooltips) are deduplicated
- **Ordering**: Always deterministic via explicit ORDER BY on dimensions
- **Virtual support**: Handles virtual tables and virtual columns
- **DateTime awareness**: Preserves `dateTimePart` and `dateTimeMode` for part extraction
