# DateTime Timezone Issue (UNRESOLVED)

## Current Status: PARKED

This issue is parked for future investigation. More important features take priority.

## Problem Summary

There's a timezone offset between the filter panel and charts:

**Last observed state (with local timezone fixes):**
- Filter panel: 14:00:00
- Chart tooltip: 12:00:00+02:00  
- Chart scale: 10:00 AM

All three show different times, indicating a complex timezone handling issue.

## What We Tried

1. **Fixed frontend datetime utilities** to use consistent local timezone
   - `getCurrentDateTime()`, `adjustDateTime()`, `getStartOf()` now use local methods
   - This fixed preset calculations

2. **Attempted UTC marking in backend** 
   - Added 'Z' to datetime strings from ClickHouse
   - Made things worse - created 3 different times

3. **Attempted UTC ↔ Local conversion in filter component**
   - Used `parseUTCToLocal()` and `formatLocalToUTC()`
   - Also made things worse

## Current Code State

**Reverted to original approach:**
- Backend returns datetime as-is from ClickHouse (`.isoformat()`)
- Frontend utilities use local timezone consistently
- Filter component does NOT do timezone conversion
- Charts (Observable Plot) handle datetime interpretation automatically

## Root Cause (Hypothesis)

The issue likely involves:
1. ClickHouse datetime storage format (UTC? Local? No timezone?)
2. Python `.isoformat()` output format
3. JavaScript's interpretation of datetime strings (with vs without 'Z')
4. Observable Plot's datetime handling
5. Mismatch between how filter values and chart data are interpreted

## What's Needed for Resolution

To properly fix this, we need to:
1. **Investigate ClickHouse configuration**: What timezone is it using?
2. **Log actual datetime values**: Check browser Network tab for exact formats returned
3. **Test with known data**: Insert test row with known UTC time, see what's displayed
4. **Understand Observable Plot**: How does it interpret datetime strings?
5. **Consistent strategy**: Either all UTC, all local, or explicit timezone handling throughout

## Files Modified (Current State)

- `frontend/src/utils/datetimeFormatUtils.ts` - Uses consistent local timezone
- `frontend/src/utils/datetimePresets.ts` - Uses local datetime utilities
- `frontend/src/components/DateTime/DateTimeRangeFilter.tsx` - No timezone conversion
- `backend/connectors/clickhouse_connector.py` - Returns `.isoformat()` as-is

## Workaround

For now, users can:
- Be aware of the timezone offset
- Manually adjust filter times by the offset amount
- Use relative presets ("Last Hour", "Today") which may work better than absolute times

## Future Investigation

When we revisit this:
1. Start with debugging/logging actual values at each step
2. Create test cases with known datetime values
3. Document ClickHouse timezone configuration
4. Consider explicit timezone configuration in app settings
5. Consider showing timezone indicator in UI

