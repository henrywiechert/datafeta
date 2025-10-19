# Save/Load Configuration - Bug Fixes

## Issue #1: Empty Password Support ✅

**Problem**: When loading a configuration with ClickHouse connection, the Connect button was disabled if the password field was empty. Some databases allow empty passwords, so this restriction was too strict.

**Solution**: 
- Removed the password validation that required a non-empty password for ClickHouse connections
- The Connect button is now enabled even with an empty password field
- Only CSV connections require file selection before enabling the Connect button

**Files Modified**:
- `frontend/src/components/ConnectionRestoreDialog.tsx`
  - Removed `(isClickHouse && !password.trim())` check from button disabled condition
  - Removed validation error for empty password in `handleConnect()`

## Issue #2: CSV Table Name Consistency ✅

**Problem**: When uploading a CSV file, the backend generated a random table name based on the temporary file path (e.g., "tmp8xk2p9q3"). When saving and reloading a configuration with the same CSV file, the table name would be different, breaking the saved visualization configuration.

**Solution**: 
- Backend now uses the original CSV filename (sanitized) to generate the table name
- Sanitization process:
  - Removes file extension
  - Converts to lowercase
  - Replaces spaces and special characters with underscores
  - Removes consecutive underscores
  - Ensures it doesn't start with a number
  - Example: "Sales Data 2023.csv" → "sales_data_2023"

**Files Modified**:

1. **`backend/services/connection_service.py`**
   - Added `original_filename` to `connect_args` when processing CSV uploads
   - Passes the uploaded file's original filename to the connector

2. **`backend/connectors/file_connector.py`**
   - Added `_sanitize_table_name()` method to create valid SQL table names from filenames
   - Modified `connect()` method to use original filename if provided
   - Falls back to temp file name for backwards compatibility

## User Experience

### Issue #1 - Empty Password
**Before**: User couldn't connect to ClickHouse with empty password
**After**: User can connect with empty password (just leave the field blank)

### Issue #2 - CSV Table Names
**Before**: 
1. Upload "sales_data.csv" → table name: "tmp8xk2p9q3"
2. Save configuration with table name "tmp8xk2p9q3"
3. Load configuration later, upload same "sales_data.csv" → table name: "tmpf3j9d8a1" (different!)
4. Configuration broken because table names don't match

**After**:
1. Upload "sales_data.csv" → table name: "sales_data"
2. Save configuration with table name "sales_data"
3. Load configuration later, upload same "sales_data.csv" → table name: "sales_data" (consistent!)
4. Configuration works perfectly

## Testing Recommendations

### Test Case 1: Empty Password
1. Create and save a configuration with ClickHouse connection (using a password)
2. Load the configuration
3. In the connection restore dialog, leave password field empty
4. Click Connect
5. Verify: Connection succeeds if the database allows empty passwords

### Test Case 2: CSV Table Name Consistency
1. Upload a CSV file named "test_data.csv"
2. Create visualizations using the data
3. Save the configuration
4. Disconnect and close the browser
5. Reopen the application and load the saved configuration
6. Upload the same "test_data.csv" file when prompted
7. Verify: All visualizations load correctly with the same data

### Test Case 3: Special Characters in CSV Filename
1. Upload CSV files with various names:
   - "Sales Data 2023.csv" → should create table "sales_data_2023"
   - "Revenue (Q1).csv" → should create table "revenue_q1"
   - "2023-results.csv" → should create table "table_2023_results"
   - "my-file@#$%.csv" → should create table "my_file"
2. Verify each creates a valid, consistent table name

### Test Case 4: Metadata Loading After Config Restore
1. Create and save a configuration with visualizations
2. Disconnect and refresh the browser
3. Load the saved configuration
4. Provide connection credentials when prompted
5. Verify: Field panel shows:
   - Database name (for ClickHouse) or empty (for CSV)
   - Table name
   - List of available fields
6. Verify: Can drag fields to axes and create new visualizations
7. Verify: Existing visualizations load correctly with data

## Backwards Compatibility

All fixes maintain backwards compatibility:

1. **Empty Password**: Existing configurations still work. Users can now optionally use empty passwords.

2. **CSV Table Names**: 
   - New CSV uploads will use sanitized filenames
   - Old configurations with random table names still work (won't break existing saved configs)
   - The improvement only affects new CSV uploads going forward

3. **Metadata Loading**:
   - Existing configurations will now properly load metadata
   - No changes needed to saved configuration files
   - Improvement is transparent to users

## Security Considerations

- Empty passwords are now allowed, but this is acceptable as:
  - Some databases legitimately allow empty passwords (especially in development)
  - The password field is never saved in configuration files
  - Users must explicitly leave the field empty (intentional action)

## Issue #3: Field Panel Not Updated After Config Load ✅

**Problem**: When loading a configuration and successfully connecting (by providing CSV file or DB password), the field panel remained empty - no database name, table name, or available fields were displayed. This prevented users from continuing to work with the restored data source.

**Root Cause**: 
1. The data source selection (database and table names) was being restored before the visualization page was mounted, so the React hooks that fetch metadata weren't initialized yet
2. For CSV files specifically, trying to restore the table name conflicted with the auto-detection logic (CSV has only one table that should be auto-detected)

**Solution**:
- Navigate to the visualization page first, ensuring hooks are mounted
- **For ClickHouse connections:**
  - Use `requestAnimationFrame` and `setTimeout` to wait for the next render cycle
  - Clear metadata arrays (databases, tables, availableFields) before restoration
  - Set database and table names after clearing, triggering the useEffects
  - The existing useEffects in `useVisualizationState` then automatically fetch metadata
- **For CSV connections:**
  - Don't restore database/table selection at all
  - Let the natural useEffect flow handle metadata fetching
  - The `fetchTables` function auto-detects and selects the single CSV table
  - This ensures compatibility even if the CSV filename/table name changed

**Files Modified**:
- `frontend/src/App.tsx`
  - Updated `restoreConfigurationState()` to navigate first, then conditionally restore data source
  - For CSV: Skip restoration entirely, rely on auto-detection
  - For ClickHouse: Clear metadata arrays before setting database/table
  - Used `requestAnimationFrame` + `setTimeout` for proper timing
  - Added destructuring of `setDatabases`, `setTables`, `setAvailableFields` from DataSourceContext

**Workflow After Fix (ClickHouse)**:
1. User loads configuration → connects successfully
2. App navigates to `/visualize`
3. Visualization page and hooks mount
4. Metadata arrays are cleared
5. Database and table names are set from config
6. useEffects detect changes and fetch metadata
7. Field panel populates with all metadata

**Workflow After Fix (CSV)**:
1. User loads configuration → selects CSV file → connects successfully
2. App navigates to `/visualize`
3. Visualization page and hooks mount
4. useEffect detects CSV connection
5. Automatically fetches table list
6. Auto-selects the single table (with consistent filename-based name)
7. Fetches columns for the table
8. Field panel populates with all metadata

## Build Status

✅ **Frontend**: Compiled successfully with warnings (pre-existing)
✅ **Backend**: No linter errors
✅ **Type Safety**: All TypeScript types validated

