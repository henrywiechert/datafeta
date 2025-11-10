# DateTime Timezone Consistency Fix

## Problem

The filter panel was displaying times with a timezone offset compared to the charts:

**Initial Issue:**
- **Chart**: 15:00:00+02:00 (correct local time)
- **Filter panel**: 17:00:00 (2 hours ahead!)

**After first fix attempt (making frontend use local time):**
- **Filter panel**: 14:00:00
- **Chart tooltip**: 14:00:00+02:00
- **Chart scale**: 12:00 PM (2 hours behind!)

The tooltip and filter matched, but the scale was wrong, indicating the data itself was being misinterpreted.

## Root Cause

The datetime utility functions were **mixing UTC and local timezone** when constructing datetime strings. This caused inconsistent behavior across the application.

### Specific Bugs Found

**1. `getCurrentDateTime()` (used by presets)**
```typescript
// BEFORE (WRONG):
const date = now.toISOString().split('T')[0];  // UTC date! 
const time = now.toTimeString().split(' ')[0]; // LOCAL time!
const milliseconds = now.getMilliseconds().toString().padStart(3, '0');

return { date, time, milliseconds }; // Mixing UTC date with local time!
```

**Problem**: Created hybrid timestamps like "2023-10-26 23:00:00" where:
- Date component is UTC (Oct 26)
- Time component is local (23:00 local)

This caused a 2-hour shift when interpreted by the backend.

**2. `adjustDateTime()` (used to calculate preset ranges)**
```typescript
// BEFORE (WRONG):
const date = new Date(dateTimeString.replace(' ', 'T') + 'Z'); // Adding 'Z' forces UTC!
// ...apply deltas...
const components = parseISODateTime(date.toISOString()); // Converting back to UTC!
```

**Problem**: Forced datetime to be interpreted as UTC by adding 'Z', then converted back using `.toISOString()` (which returns UTC). This double-converted the times.

**3. `getStartOf()` (used by presets like "Today", "This Week")**
```typescript
// BEFORE (WRONG):
const components = parseISODateTime(date.toISOString()); // Using UTC!
```

**Problem**: Used `.toISOString()` which returns UTC time, not local time.

## Solution

The fix required changes in **both backend and frontend**:

### Backend Fix: Mark UTC datetimes explicitly

ClickHouse stores datetimes in UTC. When Python's `.isoformat()` converts them to strings, it doesn't include timezone info. JavaScript then incorrectly interprets these strings as local time.

**Fixed: `backend/connectors/clickhouse_connector.py`**
```python
# Append 'Z' to datetime strings to mark them as UTC
if hasattr(value, 'isoformat'):
    iso_str = value.isoformat()
    # Only add 'Z' if not already present
    if not iso_str.endswith('Z') and '+' not in iso_str[-6:]:
        iso_str += 'Z'
    row_dict[col_name] = iso_str
```

Now backend returns: `"2023-10-26T14:00:00.000Z"` (explicitly UTC)

### Frontend Fix: Handle UTC properly

Made datetime utility functions **consistently work in LOCAL timezone** for user-facing operations, while properly converting to/from UTC when communicating with backend:

### 1. Fixed `getCurrentDateTime()`
```typescript
// AFTER (CORRECT):
const year = now.getFullYear();        // Local
const month = String(now.getMonth() + 1).padStart(2, '0'); // Local
const day = String(now.getDate()).padStart(2, '0'); // Local
const hours = String(now.getHours()).padStart(2, '0'); // Local
const minutes = String(now.getMinutes()).padStart(2, '0'); // Local
const seconds = String(now.getSeconds()).padStart(2, '0'); // Local
const milliseconds = String(now.getMilliseconds()).padStart(3, '0'); // Local

return {
  date: `${year}-${month}-${day}`,
  time: `${hours}:${minutes}:${seconds}`,
  milliseconds,
}; // All components in LOCAL timezone!
```

### 2. Fixed `adjustDateTime()`
```typescript
// AFTER (CORRECT):
const date = new Date(dateTimeString.replace(' ', 'T')); // NO 'Z' - treat as local!

// Apply deltas using LOCAL time methods
if (delta.hours) date.setHours(date.getHours() + delta.hours);
// etc...

// Convert back using LOCAL components
const components = {
  date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
  time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`,
  milliseconds: String(date.getMilliseconds()).padStart(3, '0'),
};

return formatISODateTime(components);
```

### 3. Fixed `getStartOf()`
```typescript
// AFTER (CORRECT):
// Use local time methods (setHours, setDate, etc.)
// ...

// Convert to components using LOCAL time (not UTC)
const components = {
  date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}:${String(date.getDate()).padStart(2, '0')}`,
  time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`,
  milliseconds: String(date.getMilliseconds()).padStart(3, '0'),
};

return formatISODateTime(components);
```

## How JavaScript Handles Datetime Strings

Understanding this is critical:

```javascript
// WITHOUT 'Z' or timezone → Interpreted as LOCAL time
const local = new Date("2023-10-26 15:00:00");
// Result in UTC+2: Thu Oct 26 2023 15:00:00 GMT+0200 (15:00 local)

// WITH 'Z' → Interpreted as UTC time
const utc = new Date("2023-10-26T15:00:00Z");
// Result in UTC+2: Thu Oct 26 2023 17:00:00 GMT+0200 (17:00 local = 15:00 UTC + 2)
```

The 2-hour offset in the filter panel was caused by accidentally adding 'Z' or using UTC methods.

### Filter Component Changes

**`frontend/src/components/DateTime/DateTimeRangeFilter.tsx`**

1. **Receiving from backend (UTC → Local)**:
```typescript
// Backend sends: "2023-10-26T14:00:00.000Z" (UTC)
// Parse and convert to local: "2023-10-26 16:00:00.000" (for UTC+2)
const parsed = metadata.min?.includes('Z') 
  ? parseUTCToLocal(metadata.min)  // Convert UTC to local
  : parseISODateTime(metadata.min); // Fallback for legacy data
```

2. **Sending to backend (Local → UTC)**:
```typescript
// User selected: 16:00 local
// Convert to UTC: "2023-10-26 14:00:00.000"
const start = formatLocalToUTC(startComponents);
```

## Complete Data Flow

```
┌──────────────────────────────────────────────────────┐
│  ClickHouse Database (UTC)                           │
│  Stores: 14:00:00 UTC                                │
└────────────────────┬─────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────┐
│  Backend                                             │
│  1. Fetches from ClickHouse: datetime(14, 0, 0)     │
│  2. Calls .isoformat(): "2023-10-26T14:00:00.000"   │
│  3. Appends 'Z': "2023-10-26T14:00:00.000Z"         │
│  4. Returns in JSON                                  │
└────────────────────┬─────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────┐
│  Frontend - Charts (Observable Plot)                 │
│  Receives: "2023-10-26T14:00:00.000Z"               │
│  Interprets as UTC, displays as local: 16:00+02:00  │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  Frontend - Filter Panel                             │
│                                                       │
│  Receiving (UTC → Local):                            │
│  1. Gets: "2023-10-26T14:00:00.000Z" (UTC)          │
│  2. parseUTCToLocal(): Converts to 16:00 local      │
│  3. Displays: "16:00:00" ✓                          │
│                                                       │
│  Sending (Local → UTC):                              │
│  1. User selects: 16:00 local                       │
│  2. formatLocalToUTC(): Converts to 14:00 UTC       │
│  3. Sends: "2023-10-26 14:00:00.000" to backend     │
└────────────────────┬─────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────┐
│  Backend - Filter Processing                         │
│  1. Receives: "2023-10-26 14:00:00.000"             │
│  2. Wraps with parseDateTime64BestEffort()          │
│  3. ClickHouse filters: WHERE time >= UTC(14:00)    │
└──────────────────────────────────────────────────────┘
```

## Key Principle

**All frontend datetime operations now work in LOCAL timezone** to match what Observable Plot displays in charts. This ensures consistency across:
- Filter panel displays
- Chart tooltips
- Chart axes
- Preset calculations

## Files Modified

### Backend
- `backend/connectors/clickhouse_connector.py`
  - Append 'Z' to datetime ISO strings to mark as UTC

### Frontend
- `frontend/src/utils/datetimeFormatUtils.ts`
  - Fixed `getCurrentDateTime()` to use all local components
  - Fixed `adjustDateTime()` to avoid 'Z' and use local methods
  - Fixed `getStartOf()` to extract local components
  - Already had `parseUTCToLocal()` and `formatLocalToUTC()` functions

- `frontend/src/components/DateTime/DateTimeRangeFilter.tsx`
  - Use `parseUTCToLocal()` when receiving datetime from backend
  - Use `formatLocalToUTC()` when sending datetime to backend
  - Handle both UTC (with 'Z') and legacy formats

## Testing

To verify the fix works:

1. **Check preset times**: Select "Last Hour" and verify the filter panel shows the correct time range (not offset)
2. **Check chart alignment**: The filter panel time should match the chart axis time exactly
3. **Check tooltip alignment**: Chart tooltips should show same time as filter panel
4. **Test around midnight**: Verify date transitions work correctly
5. **Test different timezones**: Change browser timezone and verify consistency

## Key Principles

1. **Database** stores all datetimes in UTC (ClickHouse standard)
2. **Backend** returns datetimes as UTC with 'Z' suffix
3. **Frontend** displays all datetimes in user's local timezone
4. **Frontend** converts back to UTC when sending filters
5. **Charts** (Observable Plot) automatically handle UTC strings correctly

## Future Considerations

Potential enhancements:
1. **Timezone indicator**: Show user's timezone in filter panel (e.g., "Local Time (UTC+2)")
2. **UTC toggle**: Allow users to view/filter in UTC if needed
3. **Multiple timezone support**: For teams distributed across timezones
4. **Server timezone config**: Explicit timezone configuration instead of assuming UTC

