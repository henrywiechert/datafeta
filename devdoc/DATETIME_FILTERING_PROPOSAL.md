# DateTime Filtering Enhancement Proposal

## Current Limitations

### Problems

1. **Full DateTime filtering** - Only date selection, no time component
   - `type="date"` input only allows YYYY-MM-DD
   - Loses time precision (hours, minutes, seconds)
   - Cannot filter "between 2PM and 4PM today"

2. **Timeline DateTime parts** - Treated as discrete, but problematic
   - "timeline hour" across many days → thousands of distinct values
   - "timeline month" across years → manageable but inefficient
   - Loads all values into memory for multi-select

3. **No quick date ranges** - No presets like "Last 7 days", "This month"

4. **No granular time selection** - Can't easily select specific hours/minutes

## Proposed Solution

### DateTime Filter Type Matrix

| Field Configuration | Filter Type | UI Component | Example |
|-------------------|-------------|--------------|---------|
| **Full DateTime** (no part) | Range Selector | DateTime Range Picker | "2024-01-15 14:30" to "2024-01-20 18:45" |
| **Distinct Part** (e.g., distinct hour) | Discrete Multi-Select | Checkbox list | Select: [0, 1, 2, 8, 9, 14, 15] |
| **Timeline Part** (e.g., timeline hour) | Range Selector | DateTime Range Picker | Same as Full DateTime |

### Key Insight

**Timeline datetime parts should use range filtering, not discrete selection**, because:
- Timeline hour across 30 days = 720 distinct values (impractical for multi-select)
- Timeline month across 10 years = 120 values (borderline)
- Range filtering is more intuitive: "Show me data from Jan 2023 to Mar 2024"

## Detailed Design

### 1. Full DateTime Filter (Enhanced)

**Component:** `DateTimeRangeFilter`

**Features:**
- Date + Time selection with **millisecond precision** (required)
- Start and End datetime
- Quick presets dropdown
- Separate inputs for date, time, and milliseconds

**UI Layout:**
```
┌─────────────────────────────────────────┐
│ Available: 2023-10-15 02:45:54.123      │
│         to 2023-10-26 18:12:08.987      │
├─────────────────────────────────────────┤
│ [Quick Presets ▼]                       │
│   • Last Hour                           │
│   • Last 24 Hours                       │
│   • Last 7 Days                         │
│   • Last 30 Days                        │
│   • This Month                          │
│   • Custom Range                        │
├─────────────────────────────────────────┤
│ Start: [2023-10-15] [14:30:00] [.123]  │
│        Date         Time       Ms       │
│                                         │
│ End:   [2023-10-20] [18:45:00] [.987]  │
│        Date         Time       Ms       │
└─────────────────────────────────────────┘
```

**Implementation:**
```typescript
interface DateTimeRangeFilterProps {
  metadata: DateTimeFilterMetadata;
  startDateTime: string | null;  // ISO 8601 with milliseconds: "2024-01-15T14:30:00.123Z"
  endDateTime: string | null;    // ISO 8601 with milliseconds: "2024-01-20T18:45:00.987Z"
  onChange: (start: string | null, end: string | null) => void;
}

// Internal state for easier editing
interface DateTimeInputs {
  date: string;          // "2024-01-15"
  time: string;          // "14:30:00"
  milliseconds: string;  // "123" (0-999)
}
```

### 2. Distinct DateTime Part Filter

**Component:** `DiscreteFilterControl` (existing, no changes)

**Behavior:**
- Use existing discrete filter
- Works perfectly for distinct parts (0-23 hours, 1-12 months, etc.)
- Multi-select checkboxes
- Search/regex filtering

**Example - Distinct Hour:**
```
┌─────────────────────────────────────────┐
│ 🔍 Search hours...                      │
├─────────────────────────────────────────┤
│ ☐ Select All (24 values)                │
├─────────────────────────────────────────┤
│ ☐ 0   ☐ 1   ☐ 2   ☐ 3                 │
│ ☐ 4   ☐ 5   ☐ 6   ☐ 7                 │
│ ☑ 8   ☑ 9   ☐ 10  ☐ 11                │
│ ☐ 12  ☐ 13  ☑ 14  ☑ 15                │
│ ...                                     │
└─────────────────────────────────────────┘
```

### 3. Timeline DateTime Part Filter (NEW)

**Component:** `DateTimeRangeFilter` (same as Full DateTime!)

**Key Decision:** Treat timeline datetime parts as range filters, not discrete

**Reasoning:**
- Timeline hour spanning 30 days → 720 distinct timestamps
- Range filtering is more intuitive
- Backend already supports `>=` and `<=` operators
- Same SQL: `WHERE toStartOfHour(timestamp) >= '2024-01-15 14:00' AND ...`

**Example - Timeline Hour:**
```
┌─────────────────────────────────────────┐
│ Filter: Hour (Timeline)                 │
│ Available: 2023-10-15 14:00             │
│         to 2023-10-26 18:00             │
├─────────────────────────────────────────┤
│ [Quick Presets ▼]                       │
│   • Last 6 Hours                        │
│   • Last 24 Hours                       │
│   • Working Hours (8-18)                │
│   • Custom Range                        │
├─────────────────────────────────────────┤
│ Start Hour: [2023-10-15] [14:00]       │
│ End Hour:   [2023-10-20] [18:00]       │
└─────────────────────────────────────────┘
```

**Example - Timeline Month:**
```
┌─────────────────────────────────────────┐
│ Filter: Month (Timeline)                │
│ Available: 2020-01 to 2024-10           │
├─────────────────────────────────────────┤
│ [Quick Presets ▼]                       │
│   • Last 3 Months                       │
│   • Last 6 Months                       │
│   • Last Year                           │
│   • This Year                           │
│   • Custom Range                        │
├─────────────────────────────────────────┤
│ Start Month: [2023-01]                  │
│ End Month:   [2024-06]                  │
└─────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Enhanced Full DateTime Filter

1. Create `DateTimeRangeFilter.tsx`
   - Date input (type="date")
   - Time input (type="time" with seconds)
   - Milliseconds input (type="number", 0-999)
   - Quick presets dropdown
   - Auto-format to ISO 8601: "YYYY-MM-DDTHH:mm:ss.sssZ"

2. Add preset configurations
   - Relative presets (last N hours/days)
   - Absolute presets (this week/month/year)
   - Calculate based on available data range
   - Preserve millisecond precision when applying presets

3. Update backend to handle millisecond precision
   - Currently strips time component
   - Support full ISO 8601 datetime strings with milliseconds
   - Database-specific millisecond handling (ClickHouse: DateTime64, SQL: TIMESTAMP)

### Phase 2: Distinguish Timeline vs Distinct Parts

1. Update filter type detection in `useVisualizationState.ts`
   ```typescript
   const getFilterType = (): FilterType => {
     if (field.dataType === 'datetime') {
       // Distinct datetime parts → discrete filter
       if (field.dateTimePart && field.dateTimeMode === 'distinct') {
         return 'discrete';
       }
       // Full datetime or timeline parts → datetime range filter
       return 'datetime';
     }
     return field.flavour === 'discrete' ? 'discrete' : 'continuous';
   };
   ```

2. Update metadata fetching
   - Timeline parts: Fetch min/max range (like full datetime)
   - Distinct parts: Fetch distinct values (current behavior)

### Phase 3: Part-Specific Presets

1. Create preset configurations per datetime part
   ```typescript
   const DATETIME_PRESETS = {
     full: [
       { label: 'Last Hour', value: () => ({ hours: -1 }) },
       { label: 'Last 24 Hours', value: () => ({ hours: -24 }) },
       { label: 'Last 7 Days', value: () => ({ days: -7 }) },
       // ...
     ],
     hour: [
       { label: 'Last 6 Hours', value: () => ({ hours: -6 }) },
       { label: 'Working Hours (8-18)', value: () => ({ hour: [8, 18] }) },
       // ...
     ],
     day: [
       { label: 'Last 7 Days', value: () => ({ days: -7 }) },
       { label: 'This Month', value: () => ({ month: 0 }) },
       // ...
     ],
     month: [
       { label: 'Last 3 Months', value: () => ({ months: -3 }) },
       { label: 'This Year', value: () => ({ year: 0 }) },
       // ...
     ],
     // ...
   };
   ```

2. Apply appropriate presets based on field configuration

### Phase 4: Advanced Features (Future)

1. **Sub-millisecond precision** (if data supports it)
   - Microseconds (0-999,999)
   - Nanoseconds (0-999,999,999)
   - Auto-detect precision from metadata
   - Adaptive UI: show only relevant precision levels

2. **Relative time filters**
   - "Last N hours/days/months"
   - "Next N hours/days/months"
   - Auto-update as time passes

3. **Time zone support**
   - Display in user's timezone
   - Store in UTC
   - Timezone selector

4. **Calendar view for date selection**
   - Visual calendar picker
   - Highlight available data ranges
   - Multi-date selection

5. **Time of day patterns**
   - "Every day between 9 AM and 5 PM"
   - "Weekends only"
   - "Business hours"

## Benefits

### User Experience

✅ **More intuitive** - Range selection for timeline data makes sense  
✅ **Better performance** - No loading thousands of discrete values  
✅ **Quick presets** - Common selections one click away  
✅ **Full precision** - Can filter by hour, minute, second  
✅ **Less confusion** - Clear distinction between distinct and timeline modes

### Technical

✅ **Better scalability** - Range queries more efficient than `IN (...)` with thousands of values  
✅ **Consistent with data model** - Timeline parts preserve time dimension  
✅ **Reusable components** - DateTimeRangeFilter works for full and timeline parts  
✅ **Backend-ready** - Already supports `>=` and `<=` operators

## Example Use Cases

### Use Case 1: Full DateTime - Find Events in Time Window
```
Field: event_timestamp (Full DateTime)
User wants: Events between Jan 15 2024 at 2:30 PM and Jan 20 2024 at 6:45 PM

UI:
- Start: 2024-01-15 14:30:00
- End:   2024-01-20 18:45:00

SQL:
WHERE event_timestamp >= '2024-01-15 14:30:00' 
  AND event_timestamp <= '2024-01-20 18:45:00'
```

### Use Case 2: Distinct Hour - Peak Hour Analysis
```
Field: event_timestamp (Distinct Hour)
User wants: Only see hours 8, 9, 14, 15, 16 (morning and afternoon peaks)

UI:
- Checkboxes: ☑ 8  ☑ 9  ☑ 14  ☑ 15  ☑ 16

SQL:
WHERE toHour(event_timestamp) IN (8, 9, 14, 15, 16)
```

### Use Case 3: Timeline Hour - Last 24 Hours
```
Field: event_timestamp (Timeline Hour)
User wants: Last 24 hours of data, hour by hour

UI:
- Preset: "Last 24 Hours"
- Calculates: Start = now - 24h, End = now

SQL:
WHERE toStartOfHour(event_timestamp) >= '2024-01-20 12:00:00'
  AND toStartOfHour(event_timestamp) <= '2024-01-21 12:00:00'
```

### Use Case 4: Timeline Month - Year-over-Year Comparison
```
Field: sales_date (Timeline Month)
User wants: Compare same months across 2 years (Jan 2023 - Dec 2024)

UI:
- Start Month: 2023-01
- End Month:   2024-12

SQL:
WHERE toStartOfMonth(sales_date) >= '2023-01-01'
  AND toStartOfMonth(sales_date) <= '2024-12-31'
```

## Migration Strategy

### Backward Compatibility

1. **Existing filters continue to work**
   - Full DateTime filters: Keep date-only if no time specified
   - DateTime parts: Automatically detect mode

2. **Gradual rollout**
   - Phase 1: Only Full DateTime enhancement
   - Phase 2: Timeline parts switch to range filter
   - Phase 3: Add presets and advanced features

3. **No breaking changes**
   - Backend already supports all necessary operators
   - Frontend adds new components alongside existing ones

## Open Questions

1. **Should we allow discrete filtering for timeline parts as fallback?**
   - Pro: Gives users choice
   - Con: Confusing, performance issues
   - **Recommendation**: No, keep it simple - always use range filters

2. **How to handle millisecond input validation?**
   - Must be 0-999
   - Should we allow microseconds/nanoseconds if data supports it?
   - **Recommendation**: Start with milliseconds (0-999), add micro/nano later if needed

3. **How to handle very long time ranges?**
   - E.g., 10 years of daily data
   - **Recommendation**: Show warning, suggest using coarser granularity (month/year)

4. **Should quick presets set milliseconds to .000?**
   - "Last 24 hours" → ends at current time with milliseconds, or .000?
   - **Recommendation**: 
     - Presets that end "now" → use current milliseconds
     - Presets with fixed boundaries → use .000

## Next Steps

1. ✅ Review and approve proposal
2. Create detailed UI mockups
3. Implement Phase 1 (Enhanced Full DateTime)
4. Test with real data
5. Gather user feedback
6. Implement Phases 2-3

