# DateTime Module

Centralized datetime handling for SQL generation, chart rendering, and data normalization.

## Directory Structure

All datetime logic is consolidated in `src/datetime/`:

| File | Purpose |
|------|---------|
| `datetimeSemantics.ts` | Core datetime part/mode definitions, SQL mappings, UTC contract |
| `dateTimeValueModel.ts` | Value detection and band scale normalization for charts |
| `datetimeUtils.ts` | Field-level utilities (display names, validation, tooltips) |
| `datetimePresets.ts` | Filter presets (Last 7 Days, This Month, etc.) |
| `datetimeFormatUtils.ts` | Parsing and formatting with millisecond precision |
| `utcWarnings.ts` | Non-UTC timezone detection and warnings |
| `index.ts` | Barrel export for all datetime functionality |

**UI Components** live in `src/components/DateTime/`:
- `DateTimeFilterControl.tsx` - Filter control for datetime fields
- `DateTimeRangeFilter.tsx` - Range picker with presets and millisecond precision
- `DateTimePartMenu.tsx` - Part/mode selection menu

**Imports:**
```typescript
// Preferred: import from datetime module
import { DATETIME_PARTS, formatISODateTime, getPresetsForField } from '../datetime';

// Also works: import from utils (re-exports for backward compatibility)
import { DATETIME_PARTS } from '../utils';
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      datetimeSemantics.ts                           │
│    (Central source of truth: parts, modes, SQL mappings, formats)   │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌─────────────────────┐   ┌─────────────────┐
│ SQL Builders  │   │ dateTimeValueModel  │   │  utcWarnings    │
│ (backend/     │   │ (band scale         │   │  (non-UTC       │
│  local)       │   │  normalization)     │   │   detection)    │
└───────────────┘   └─────────┬───────────┘   └─────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │chartDateTimeNormalizer│
                    │ (chart-level API)   │
                    └─────────────────────┘
```

---

## Files

### `datetimeSemantics.ts`

**Central configuration** for all datetime-related behavior.

| Export | Purpose |
|--------|---------|
| `DATETIME_PARTS` | Supported granularities: year → nanosecond |
| `DATETIME_MODES` | `'distinct'` (cyclic) vs `'timeline'` (chronological) |
| `TIMELINE_UNITS` | `date_trunc` unit for each part |
| `DISTINCT_EXTRACT_PART` | SQL `EXTRACT` part names |
| `SUBSECOND_MODULO` | Modulo values for ms/μs/ns extraction |
| `DISPLAY_FORMAT_BY_PART` | ISO-like display formats by resolution |
| `buildDateTimeAlias()` | Generates `<field>_<part>_<mode>` column alias |
| `UTC_SEMANTICS_NOTE` | Documentation string for UTC contract |

**Key Design Decisions:**
- All datetime parts are interpreted in **UTC**
- Weekday uses **ISO convention** (Monday=1 ... Sunday=7)
- Sub-second parts require modulo to isolate from seconds

---

### `dateTimeValueModel.ts`

Handles **date-like value detection** and **normalization for band scales**.

**Problem solved:** Observable Plot band scales don't handle Date objects well. This module detects date-like values and converts them to formatted strings.

```typescript
normalizeDateTimeForBand({
  domain: ['2024-01-01', '2024-01-02'],
  rows: chartData,
  categoryColumn: 'timestamp_day_timeline'
})
// → { domain: ['Jan 1', 'Jan 2'], rows: [...], tickFormat: fn, hasDateLike: true }
```

| Function | Purpose |
|----------|---------|
| `normalizeDateTimeForBand()` | Main entry: normalizes domain + rows for band scales |
| `isDateLikeValue()` | Detects Date objects or ISO datetime strings |

---

### `chartDateTimeNormalizer.ts`

**Thin facade** providing a chart-oriented API over `dateTimeValueModel`.

```typescript
import { normalizeCategoryForChart } from './chartDateTimeNormalizer';

const { domain, rows, tickFormat, hasDateLike } = normalizeCategoryForChart({
  domain: rawDomain,
  rows: chartRows,
  categoryColumn: 'x_column'
});
```

Currently wraps `normalizeDateTimeForBand()` 1:1. Exists as a stable API surface for chart components.

---

### `utcWarnings.ts`

**Non-fatal warning system** for non-UTC datetime strings.

Detects strings with explicit timezone offsets (e.g., `+05:30`, `-08:00`) that aren't UTC (`Z`). Emits console warnings during development.

```typescript
warnIfNonUtc(dateValues, 'Column ingestion');
// Console: [UTC warning] Column ingestion: Non-UTC datetimes detected...
```

| Function | Purpose |
|----------|---------|
| `detectNonUtcDateLike()` | Returns true if value has non-UTC offset |
| `warnIfNonUtc()` | Batch check + console warning |

---

## DateTime Modes Explained

### Distinct Mode (Cyclic)

Extracts the **numeric part value** from each timestamp. Groups values across different dates.

```sql
-- "What hour of day do most events happen?"
EXTRACT(HOUR FROM timestamp) → 0, 1, 2, ..., 23
```

Use case: "Events by weekday", "Sales by month-of-year"

### Timeline Mode (Chronological)

Truncates timestamps to the specified **resolution**. Preserves chronological order.

```sql
-- "Events per day over time"
DATE_TRUNC('day', timestamp) → 2024-01-01, 2024-01-02, ...
```

Use case: Time series, trends over time

---

## External Connections

| Consumer | Usage |
|----------|-------|
| `localSqlBuilder.ts` | Uses `TIMELINE_UNITS`, `DISTINCT_EXTRACT_PART` for local DuckDB queries |
| Backend SQL builders | Uses same semantics via shared contract |
| `observable-plot-generator/` | Uses `normalizeCategoryForChart()` for band axis labels |
| Filter controls | May use `DATETIME_PARTS` for granularity selection |

---

## Test Coverage

- `dateTimeValueModel.test.ts` - Value detection and normalization
- `utcWarnings.test.ts` - Non-UTC detection logic
