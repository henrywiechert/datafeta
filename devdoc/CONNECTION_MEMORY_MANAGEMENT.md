# Connection and Memory Management Improvements

## Overview

Enhanced connection management to ensure graceful disconnection, proper resource cleanup, and memory management when switching between data sources or loading configurations.

## Problem Statement

### Issues Identified

1. **No automatic disconnect when connecting to a new data source**
   - Users could connect to a new CSV or ClickHouse source while an existing connection was active
   - Backend session state could be inconsistent
   - Previous connection resources (uploaded CSV files, database connections) not properly cleaned up

2. **Loading JSON configuration while connected**
   - Users could load a saved configuration without disconnecting from current connection
   - Led to confusion about which data source was active
   - Memory not cleared from previous connection's query results

3. **Large query results stored in browser memory**
   - Query results with tens of thousands of rows remain in memory
   - No automatic cleanup when switching connections
   - Can lead to high memory usage, especially with multiple large queries

4. **No explicit memory cleanup mechanism**
   - Frontend state accumulates data across multiple queries
   - Browser has no way to force garbage collection
   - Memory usage grows over time during long sessions

## Solution Implementation

### 1. Graceful Disconnect Before New Connection ✅

**File**: `frontend/src/contexts/ConnectionContext.tsx`

Modified the `connect()` function to automatically disconnect from existing connection before establishing a new one:

```typescript
const connect = useCallback(async (details: ConnectionDetails, file?: File) => {
  // If already connected, disconnect first to clean up resources
  if (isConnected) {
    try {
      await apiService.disconnect();
    } catch (err) {
      console.warn('Failed to disconnect from previous connection:', err);
      // Continue anyway - attempt new connection
    }
  }
  
  // ... rest of connection logic
```

**Benefits**:
- ✅ Automatic cleanup of previous backend connection
- ✅ Uploaded CSV files are deleted from server
- ✅ Database connections are properly closed
- ✅ Session state remains consistent

### 2. Memory Cleanup on Connection ✅

Added explicit memory cleanup when establishing new connections:

```typescript
// Reset metadata to trigger refresh without touching axis fields
dispatch({ type: 'SET_DATABASES', payload: [] });
dispatch({ type: 'SET_TABLES', payload: [] });
dispatch({ type: 'SET_AVAILABLE_FIELDS', payload: [] });
dispatch({ type: 'SET_SELECTED_DATABASE', payload: '' });
dispatch({ type: 'SET_SELECTED_TABLE', payload: '' });
// Clear query results to free memory
dispatch({ type: 'SET_QUERY_RESULT', payload: null });
dispatch({ type: 'SET_QUERY_ERROR', payload: null });
```

**Benefits**:
- ✅ Large query result arrays are cleared immediately
- ✅ Metadata arrays reset to empty
- ✅ Memory eligible for garbage collection
- ✅ Fresh state for new connection

### 3. Enhanced Disconnect Function ✅

Updated `disconnect()` to comprehensively clear all visualization state:

```typescript
const disconnect = useCallback(async () => {
  // ... disconnect from backend
  
  // Clear all visualization state to free memory
  dispatch({ type: 'SET_DATABASES', payload: [] });
  dispatch({ type: 'SET_TABLES', payload: [] });
  dispatch({ type: 'SET_AVAILABLE_FIELDS', payload: [] });
  dispatch({ type: 'SET_SELECTED_DATABASE', payload: '' });
  dispatch({ type: 'SET_SELECTED_TABLE', payload: '' });
  dispatch({ type: 'SET_QUERY_RESULT', payload: null });
  dispatch({ type: 'SET_QUERY_ERROR', payload: null });
}, [dispatch]);
```

**Benefits**:
- ✅ Complete memory cleanup on disconnect
- ✅ Backend connection closed
- ✅ Frontend state cleared
- ✅ Consistent behavior across connection types

### 4. Connection Guard for JSON Config Loading ✅

**File**: `frontend/src/App.tsx`

Added check and confirmation dialog when loading a configuration while connected:

```typescript
const handleLoadConfiguration = async (rawConfig: any) => {
  // Check if currently connected - warn user before proceeding
  if (isConnected) {
    const confirmed = window.confirm(
      'You are currently connected to a data source. Loading this configuration will disconnect you first. Continue?'
    );
    if (!confirmed) {
      return; // User cancelled
    }
    
    // Disconnect from current connection
    try {
      await disconnect();
    } catch (err) {
      console.error('Failed to disconnect before loading configuration:', err);
      // Continue anyway - validation will handle errors
    }
  }
  
  // ... rest of config loading
}
```

**Benefits**:
- ✅ User is informed before disconnection
- ✅ Gives option to cancel and stay connected
- ✅ Ensures clean state before loading new config
- ✅ Prevents confusion about active connection

## Connection Lifecycle

### Scenario 1: Switching Data Sources

**Before Fix**:
```
User connected to CSV file A
→ User clicks "Connect" to ClickHouse
→ Backend creates ClickHouse connection (CSV file A still exists on server)
→ Frontend has mixed state
→ Memory contains data from both connections
```

**After Fix**:
```
User connected to CSV file A
→ User clicks "Connect" to ClickHouse
→ Frontend calls disconnect() first
→ Backend closes CSV connection, deletes file
→ Frontend clears all query results and metadata
→ Backend creates fresh ClickHouse connection
→ Frontend has clean state
```

### Scenario 2: Loading JSON Configuration

**Before Fix**:
```
User connected to ClickHouse database A
→ User loads JSON config for CSV file B
→ Connection dialog shows CSV file B
→ User unclear if still connected to database A
→ Could end up with two connections active
```

**After Fix**:
```
User connected to ClickHouse database A
→ User loads JSON config for CSV file B
→ Confirmation dialog: "You are currently connected... Continue?"
→ If user confirms:
  → Frontend disconnects from database A
  → Backend closes connection, cleans up
  → Frontend clears memory
  → Connection dialog shows CSV file B
  → User provides file and connects cleanly
```

### Scenario 3: Explicit Disconnect

**Before Fix**:
```
User clicks "Disconnect" button
→ Backend connection closed
→ Frontend connectionDetails = null
→ Query results still in memory (could be large)
→ Metadata still populated
```

**After Fix**:
```
User clicks "Disconnect" button
→ Backend connection closed
→ Frontend clears all state:
  - connectionDetails = null
  - queryResult = null (frees memory)
  - databases = []
  - tables = []
  - availableFields = []
→ Memory eligible for garbage collection
```

## Backend Connection Management

The backend already had proper connection management in place:

**File**: `backend/services/connection_service.py`

```python
async def _clear_previous_state(self, session_id: str) -> None:
    if self.state_manager.current_connector:
        await run_in_threadpool(self.state_manager.current_connector.disconnect)
    if self.state_manager.current_csv_temp_path and os.path.exists(...):
        os.remove(self.state_manager.current_csv_temp_path)
    self.state_manager.clear_state()
```

**Connectors** implement `disconnect()`:
- **ClickHouseConnector**: Closes client connection
- **FileConnector**: Logs disconnection (DuckDB handles cleanup)

## Memory Management Best Practices

### What Gets Cleared

When disconnecting or switching connections, we clear:

1. **Query Results** (`queryResult: QueryResult | null`)
   - Array of row data (can be 10,000+ rows × many columns)
   - This is typically the largest data structure
   - Cleared immediately to free memory

2. **Metadata Arrays**
   - `databases: Database[]`
   - `tables: Table[]`
   - `availableFields: Field[]`
   - Usually small, but cleared for consistency

3. **Connection Details**
   - `connectionDetails: ConnectionDetails | null`
   - Contains connection parameters

4. **Selected State**
   - `selectedDatabase: string`
   - `selectedTable: string`

### What Doesn't Get Cleared

We intentionally **don't** clear user's visualization work:

- ❌ X-axis fields (`xAxisFields`)
- ❌ Y-axis fields (`yAxisFields`)
- ❌ Filter fields (`filterFields`)
- ❌ Color/size/label configurations

This allows users to:
- Switch between connections while preserving their chart setup
- Quickly reconnect and see the same visualization
- Load different data sources with the same field mappings

## Testing Scenarios

### Manual Test Cases

1. **CSV → ClickHouse Switch**
   - [ ] Connect to CSV file
   - [ ] Execute query and verify results
   - [ ] Click connection button, select ClickHouse
   - [ ] Verify confirmation or automatic disconnect
   - [ ] Verify CSV file deleted from server
   - [ ] Verify ClickHouse connection works

2. **ClickHouse → CSV Switch**
   - [ ] Connect to ClickHouse
   - [ ] Execute query with large result set
   - [ ] Connect to CSV file (upload new file)
   - [ ] Verify ClickHouse connection closed
   - [ ] Verify query results cleared
   - [ ] Verify CSV connection works

3. **Load JSON While Connected**
   - [ ] Connect to any data source
   - [ ] Execute query
   - [ ] Load JSON configuration
   - [ ] Verify warning dialog appears
   - [ ] Cancel - verify still connected
   - [ ] Confirm - verify disconnected before loading
   - [ ] Verify memory cleared

4. **Explicit Disconnect**
   - [ ] Connect to data source
   - [ ] Execute multiple large queries
   - [ ] Check browser memory usage (DevTools)
   - [ ] Click Disconnect
   - [ ] Verify memory drops (allow time for GC)
   - [ ] Verify connection state cleared

5. **Rapid Connection Switches**
   - [ ] Connect to CSV A
   - [ ] Immediately connect to CSV B (before query)
   - [ ] Verify CSV A cleaned up
   - [ ] Connect to ClickHouse
   - [ ] Verify CSV B cleaned up

## Browser Memory Considerations

### Garbage Collection

JavaScript's garbage collector automatically frees memory for unreferenced objects. Our changes help by:

1. **Setting objects to null** - Removes references
2. **Clearing arrays** - Sets length to 0, unreferences elements
3. **Replacing large objects** - Old object becomes unreferenced

However:
- GC timing is not immediate
- GC is non-deterministic (browser decides when)
- Large objects may not be freed until next GC cycle

### Monitoring Memory

To check if memory is being freed properly:

```javascript
// In browser console
performance.memory.usedJSHeapSize  // Current memory usage
```

Or use Chrome DevTools:
1. Open DevTools → Performance → Memory
2. Take heap snapshot before connection
3. Execute large query
4. Take snapshot after query
5. Disconnect
6. Wait a few seconds
7. Force GC (trash icon in DevTools)
8. Take snapshot after disconnect
9. Compare retained size

Expected: Significant drop in retained size after disconnect + GC.

## API Impact

### No Breaking Changes

All changes are internal to the frontend:
- Backend API unchanged
- Existing backend disconnect logic works as expected
- No new API endpoints needed

### Backend Already Supports

The backend `/api/v1/data/disconnect` endpoint:
- ✅ Closes connector connections
- ✅ Deletes temporary CSV files
- ✅ Clears session state
- ✅ Returns success message

## Future Enhancements

### Potential Improvements

1. **Connection status indicator**
   - Visual indicator of active connection in UI
   - Show connection type and details
   - Warning if disconnected but trying to query

2. **Automatic disconnect on page unload**
   - Clean up backend resources if user closes tab
   - Use `beforeunload` event
   - Challenge: async operations not guaranteed to complete

3. **Memory usage monitor**
   - Show estimated memory usage in UI
   - Warn when approaching limits
   - Suggest disconnect/reload if too high

4. **Background disconnect timer**
   - Auto-disconnect after period of inactivity
   - Configurable timeout (e.g., 30 minutes)
   - Saves server resources for long-lived sessions

5. **Query result pagination**
   - Only load N rows at a time
   - Fetch more on demand
   - Reduces initial memory footprint
   - Trade-off: additional API calls

## Related Files

### Modified
- `frontend/src/contexts/ConnectionContext.tsx` - Core connection management
- `frontend/src/App.tsx` - JSON config loading guard

### Reviewed (No Changes Needed)
- `backend/services/connection_service.py` - Already handles cleanup
- `backend/connectors/clickhouse_connector.py` - Already implements disconnect
- `backend/connectors/file_connector.py` - Already implements disconnect
- `frontend/src/contexts/VisualizationContext.tsx` - Dispatches handled correctly

## Summary

✅ **Problem Solved**: Users can now safely switch between data sources without resource leaks or memory issues.

✅ **Graceful Disconnection**: Previous connection is automatically cleaned up before establishing new one.

✅ **Memory Management**: Large query results are cleared when disconnecting or switching connections.

✅ **User-Friendly**: Confirmation dialog prevents accidental disconnection when loading JSON configs.

✅ **Backend Cleanup**: CSV files deleted, database connections closed properly.

✅ **Consistent State**: Frontend and backend state remain synchronized.

The application now has robust connection lifecycle management that prevents the issues raised by the user.
