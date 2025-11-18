# Filter Panel "Request was cancelled" Error Fix

## Issue Description

When reloading a configuration (JSON file) from a ClickHouse case, the filter panel would show "Error: Request was cancelled" when opening the first discrete filter menu, even though the filter settings and charts loaded correctly.

## Root Cause

The issue was caused by the global `AbortController` in `apiService.ts` that was designed to cancel previous requests when a new one is made. This worked well for sequential operations but caused problems during configuration loading:

1. When a configuration is loaded, the `useEffect` in `useVisualizationState.ts` (lines 813-827) triggers because `dataSource.selectedTable` and `dataSource.selectedDatabase` change
2. This effect calls `fetchFilterMetadata(field)` for each filter field that doesn't have metadata yet
3. Multiple filter fields would trigger multiple parallel API calls to fetch their metadata
4. Each call to `fetchFilterMetadata()` → `apiService.getDistinctValuesCount()` → `createAbortController()` would **abort the previous request** before starting a new one
5. This caused a cascade of request cancellations, leaving some filter fields without properly loaded metadata
6. When the user opened a filter menu later, the incomplete metadata state would cause errors

## Solution

The fix implements **independent abort controllers** for each filter field's metadata fetch:

### Changes Made

1. **Added abort controller storage** (`useVisualizationState.ts`, line 18-19):
   - Created a `useRef<Map<string, AbortController>>` to store abort controllers keyed by `fieldId`
   - This allows each field to have its own independent abort controller

2. **Added cleanup on unmount** (`useVisualizationState.ts`, lines 33-40):
   - Added a `useEffect` that aborts all pending requests and clears the map on unmount
   - Prevents memory leaks and orphaned requests

3. **Updated `fetchFilterMetadata`** (`useVisualizationState.ts`, lines 505-515):
   - Creates a new `AbortController` for each field
   - Cancels any existing fetch for the same field before starting a new one
   - Passes the controller's signal to all API calls (`getDistinctValuesCount`, `getDistinctValues`)
   - Cleans up the controller after successful fetch (line 713)
   - Handles abort errors gracefully by not showing "Request was cancelled" to the user (lines 717-720)

4. **Updated `refetchFilterValues`** (`useVisualizationState.ts`, lines 839-849):
   - Applied the same pattern for when users manually refetch filter values with regex patterns
   - Ensures refetch operations don't interfere with other ongoing fetches

### Key Improvements

- **Parallel fetching**: Multiple filter fields can now fetch metadata simultaneously without canceling each other
- **Field-specific cancellation**: If the same field is refetched (e.g., user changes regex pattern), only that field's previous request is cancelled
- **Clean error handling**: Intentional cancellations (via abort) are silently ignored, while real errors are still displayed
- **Proper cleanup**: Abort controllers are removed from the map after completion or error

## Testing

To verify the fix:

1. Connect to a ClickHouse database
2. Create a configuration with multiple discrete filter fields
3. Save the configuration to JSON
4. Reload the page and load the configuration
5. Open the first discrete filter menu - it should load without errors
6. All filters should work correctly

## Previous Attempt

The previous fix (referenced in the user's message) added `dataSource.selectedTable` and `dataSource.selectedDatabase` to the useEffect dependencies to trigger re-fetching when these change. While this correctly identified *when* to re-fetch, it didn't solve the underlying problem of parallel fetches canceling each other via the global abort controller.

This new fix completes the solution by making each field's metadata fetch independent and non-interfering.
