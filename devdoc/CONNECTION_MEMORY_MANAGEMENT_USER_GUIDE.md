# Connection and Memory Management - User Guide

## What Was Fixed

You asked about three important issues:

1. **"Do we have a reliable way to close a connection and free all data from browser's memory?"**
2. **"I can load a new JSON while a connection to ClickHouse or CSV is still active. What happens then?"**
3. **"We need some graceful disconnect, and maybe forbid to load another JSON while connected?"**

All three issues have been addressed! ✅

## Solutions Implemented

### 1. ✅ Graceful Automatic Disconnect

**When it happens**: Automatically when you connect to a new data source while already connected.

**What it does**:
- Disconnects from previous connection first
- Cleans up backend resources (closes DB connections, deletes CSV files)
- Clears all query results from browser memory
- Then establishes the new connection

**Example**:
```
Before: CSV file A → Connect to ClickHouse → Both active ❌
After:  CSV file A → Connect to ClickHouse → CSV A cleaned up → ClickHouse active ✅
```

### 2. ✅ Complete Memory Cleanup

**When it happens**: When you disconnect or switch connections

**What gets cleared**:
- ✅ Query results (the big data arrays with thousands of rows)
- ✅ Database and table lists
- ✅ Available fields metadata
- ✅ Connection details

**What stays**:
- ✅ Your chart configuration (X-axis, Y-axis, filters, colors)
- ✅ Your sheets
- ✅ Filter settings

This lets you quickly reconnect with the same visualization setup!

### 3. ✅ JSON Config Load Protection

**When it happens**: When you try to load a JSON config while connected

**What you'll see**:
- A confirmation dialog: *"You are currently connected to a data source. Loading this configuration will disconnect you first. Continue?"*
- **Click Cancel** → Nothing happens, you stay connected
- **Click OK** → Disconnects cleanly, then loads the config

## How to Use

### Switching Between Data Sources

**Old behavior** (could cause issues):
```
1. Connect to CSV file
2. Query data → 50,000 rows in memory
3. Connect to ClickHouse → Previous connection still active, CSV file still on server
4. Memory contains data from both
```

**New behavior** (clean and safe):
```
1. Connect to CSV file
2. Query data → 50,000 rows in memory
3. Connect to ClickHouse → Automatically disconnects CSV first
4. CSV file deleted from server, memory cleared
5. Fresh ClickHouse connection
```

### Loading JSON Configurations

**Old behavior**:
```
1. Connected to ClickHouse
2. Load JSON config for CSV → Confusing state
```

**New behavior**:
```
1. Connected to ClickHouse
2. Load JSON config for CSV
3. Dialog appears: "Currently connected. Disconnect first?"
4. You decide:
   - Cancel → Stay connected, don't load config
   - OK → Disconnect, clear memory, load config
```

### Manual Disconnect

When you click the **Disconnect** button:

1. ✅ Backend connection closed (ClickHouse client or CSV file)
2. ✅ Temporary files deleted (for CSV uploads)
3. ✅ All query results cleared from memory
4. ✅ Metadata cleared
5. ✅ Connection state reset

Your browser can now garbage collect all that memory!

## Memory Management Details

### What Uses the Most Memory?

Query results are typically the largest data structure:
- A query returning 10,000 rows × 20 columns = 200,000 data points
- With string data, this can be several MB in browser memory
- Multiple queries accumulate without cleanup

### How We Free Memory

1. **Set to null**: `queryResult = null` removes reference
2. **Clear arrays**: `databases = []` empties the list
3. **Garbage collection**: Browser frees unreferenced memory (automatic, not immediate)

### Monitoring Memory Usage

Want to see memory usage in Chrome DevTools?

1. Open DevTools (F12)
2. Go to Performance → Memory
3. Take heap snapshot
4. Connect and query data
5. Take another snapshot
6. Disconnect
7. Wait a few seconds, force GC (trash icon)
8. Take final snapshot
9. Compare - you'll see memory drop!

## Behavior Summary

| Action | Old Behavior | New Behavior |
|--------|-------------|--------------|
| **Connect while connected** | Multiple connections active | Auto-disconnect previous first |
| **Load JSON while connected** | Unclear state | Confirmation dialog |
| **Disconnect** | Backend closed, frontend partial cleanup | Full cleanup: backend + memory |
| **Switch CSV → ClickHouse** | CSV file remains on server | CSV deleted automatically |
| **Switch ClickHouse → CSV** | Both connections possibly active | ClickHouse closed first |
| **Memory after disconnect** | Query results remain | All results cleared |

## Best Practices

### For Regular Use

1. **Don't worry about it!** - The app now handles cleanup automatically
2. **Switch data sources freely** - Previous connection will clean up
3. **Disconnect when done** - Frees up server and browser resources

### For Long Sessions

If you're working for hours with large datasets:

1. **Disconnect periodically** - Even if you'll reconnect, this frees memory
2. **Watch query result sizes** - The app warns when results are > 50,000 rows
3. **Use filters** - Smaller result sets use less memory
4. **Use aggregation** - Aggregated data is typically much smaller

### For Large Datasets

If you regularly work with huge result sets:

1. **Add filters** - Reduce the data transferred
2. **Use aggregation** - Sum/count instead of raw rows
3. **Limit to top N** - Use filters to show top 100 or 1000
4. **Consider the data size** - 100,000+ rows may strain the browser

## Technical Details

### Files Modified

1. **`frontend/src/contexts/ConnectionContext.tsx`**
   - Added auto-disconnect in `connect()`
   - Enhanced memory cleanup in `disconnect()`

2. **`frontend/src/App.tsx`**
   - Added confirmation dialog in `handleLoadConfiguration()`
   - Checks if connected before loading config

### Backend Support

The backend already had proper cleanup:
- `/api/v1/data/disconnect` endpoint
- Closes database connections
- Deletes temporary CSV files
- Clears session state

No backend changes were needed!

## FAQ

**Q: Will my chart configuration be lost when I switch connections?**  
A: No! Your X-axis, Y-axis, filters, colors, and all visualization settings are preserved. Only the data and metadata are cleared.

**Q: What if I want to keep multiple connections active?**  
A: This isn't supported for good reasons:
- Server resource management
- Session state clarity
- Memory management
- File upload cleanup

**Q: Can I load a JSON config without disconnecting?**  
A: If the config has connection metadata, you'll be prompted to disconnect. If you cancel, the config won't load. This prevents confusion about which connection is active.

**Q: How do I know if memory is actually being freed?**  
A: Use Chrome DevTools Memory profiler (see "Monitoring Memory Usage" above). You should see heap size drop after disconnect + garbage collection.

**Q: What if disconnection fails?**  
A: The frontend will still clear its state and try to continue. The backend may still have the connection, but a new connection attempt will clean it up.

## Summary

✅ **Automatic cleanup** - No more worrying about multiple active connections  
✅ **Memory management** - Query results cleared when disconnecting  
✅ **Safe JSON loading** - Confirmation before disconnecting  
✅ **Graceful switching** - Connect to new sources without issues  
✅ **Backend cleanup** - Server resources properly released  

The application now handles connection lifecycle properly, making it safe to switch between data sources and load configurations without concerns about resource leaks or memory buildup.

For full technical details, see: `devdoc/CONNECTION_MEMORY_MANAGEMENT.md`
